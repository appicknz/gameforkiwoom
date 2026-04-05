import { adminSupabase } from "@/lib/supabase-admin"
import { createClient } from "@supabase/supabase-js"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

async function requireAdmin(token: string | null) {
  if (!token) return null
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data, error } = await anonClient.auth.getUser(token)
  if (error || !data.user) return null
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single()
  const adminRoles = ["master", "super_admin", "admin", "superadmin", "branch_admin"]
  if (!profile || !adminRoles.includes(profile.role)) return null
  return data.user
}

// 자동배팅 유저 목록 (사용자2~사용자30, 홀수=baka, 짝수=race)
const AUTO_BET_USERNAMES = Array.from({ length: 29 }, (_, i) => `사용자${i + 2}`)
const BET_AMOUNTS = [10000, 50000, 100000]
const BACCARAT_SIDES = ["player", "banker", "tie"] as const
const RACE_SIDES = ["bit", "coin", "tie"] as const

function randomPick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

// GET: 자동배팅 유저 목록 + 잔고 조회
export async function GET(request: Request) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "") ?? null
  const admin = await requireAdmin(token)
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profiles } = await adminSupabase
    .from("profiles")
    .select("id, username, branch_id")
    .in("username", AUTO_BET_USERNAMES)
    .order("username")

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ users: [] })
  }

  const userIds = profiles.map(p => p.id)
  const { data: balances } = await adminSupabase
    .from("balances")
    .select("user_id, amount")
    .in("user_id", userIds)

  const balMap = Object.fromEntries((balances ?? []).map(b => [b.user_id, b.amount]))

  const users = profiles.map(p => {
    const num = parseInt(p.username.replace("사용자", ""))
    return {
      id: p.id,
      username: p.username,
      num,
      gameType: num % 2 !== 0 ? "baccarat" : "race",
      balance: balMap[p.id] ?? 0,
    }
  })

  return NextResponse.json({ users })
}

// POST: 자동배팅 1회 실행 (또는 잔고 일괄 충전)
export async function POST(request: Request) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "") ?? null
  const admin = await requireAdmin(token)
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()

  // action: "top_up" — 잔고 부족 유저에게 1천만원 충전
  if (body.action === "top_up") {
    const { data: profiles } = await adminSupabase
      .from("profiles")
      .select("id")
      .in("username", AUTO_BET_USERNAMES)

    if (!profiles) return NextResponse.json({ ok: true, topped: 0 })

    const ids = profiles.map(p => p.id)
    const { data: balances } = await adminSupabase
      .from("balances")
      .select("user_id, amount")
      .in("user_id", ids)

    const needTopUp = (balances ?? []).filter(b => b.amount < 1000000)
    let topped = 0
    for (const b of needTopUp) {
      await adminSupabase
        .from("balances")
        .update({ amount: 10000000 })
        .eq("user_id", b.user_id)
      topped++
    }
    return NextResponse.json({ ok: true, topped })
  }

  // action: "bet" — 전체 자동배팅 유저 1라운드 배팅 실행
  const { data: profiles } = await adminSupabase
    .from("profiles")
    .select("id, username")
    .in("username", AUTO_BET_USERNAMES)

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ error: "No auto-bet users found" }, { status: 404 })
  }

  const userIds = profiles.map(p => p.id)
  const { data: balances } = await adminSupabase
    .from("balances")
    .select("user_id, amount")
    .in("user_id", userIds)
  const balMap = Object.fromEntries((balances ?? []).map(b => [b.user_id, b.amount]))

  const nowSec = Math.floor(Date.now() / 1000)
  const baccaratRound = Math.floor(nowSec / 30)
  const raceRound = Math.floor(nowSec / 300)

  const results: {
    username: string
    gameType: string
    side: string
    amount: number
    success: boolean
    error?: string
    balance: number
  }[] = []

  let totalFee = 0

  for (const p of profiles) {
    const num = parseInt(p.username.replace("사용자", ""))
    const gameType = num % 2 !== 0 ? "baccarat" : "race"
    const side = gameType === "baccarat"
      ? randomPick(BACCARAT_SIDES)
      : randomPick(RACE_SIDES)
    const amount = randomPick(BET_AMOUNTS)
    const currentBalance = balMap[p.id] ?? 0

    if (currentBalance < amount) {
      results.push({ username: p.username, gameType, side, amount, success: false, error: "잔고 부족", balance: currentBalance })
      continue
    }

    try {
      const roundKey = gameType === "baccarat"
        ? `bets:baccarat:${baccaratRound}`
        : `bets:race:${raceRound}`

      // 잔고 차감
      const { data: newBal, error: deductErr } = await adminSupabase
        .rpc("deduct_balance_for_bet", { p_user_id: p.id, p_amount: amount })

      if (deductErr) {
        results.push({ username: p.username, gameType, side, amount, success: false, error: deductErr.message, balance: currentBalance })
        continue
      }

      // Redis 배팅 풀 반영
      await redis.hincrby(roundKey, side, amount)
      await redis.hincrby(roundKey, "__total__", amount)
      await redis.hincrby(roundKey, "__users__", 1)
      await redis.expire(roundKey, gameType === "baccarat" ? 120 : 600)

      // Redis 잔고 캐시 갱신
      await redis.set(`balance:${p.id}`, newBal as number, { ex: 3600 })
      await redis.incr(`balance_version:${p.id}`)

      const fee = Math.floor(amount * 0.2)
      totalFee += fee
      balMap[p.id] = newBal as number

      results.push({ username: p.username, gameType, side, amount, success: true, balance: newBal as number })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error"
      results.push({ username: p.username, gameType, side, amount, success: false, error: msg, balance: currentBalance })
    }
  }

  // 누적 수수료를 Redis에 저장
  const existingFee = await redis.get<number>("auto_bet:total_fee") ?? 0
  await redis.set("auto_bet:total_fee", existingFee + totalFee)

  // 최근 배팅 결과를 Redis에 저장 (최근 100건)
  const logEntry = JSON.stringify({ ts: Date.now(), results, totalFee })
  await redis.lpush("auto_bet:logs", logEntry)
  await redis.ltrim("auto_bet:logs", 0, 99)

  return NextResponse.json({
    ok: true,
    roundBaccarat: baccaratRound,
    roundRace: raceRound,
    results,
    totalFeeThisRound: totalFee,
    accumulatedFee: (existingFee as number) + totalFee,
  })
}

// PATCH: 누적 수수료 초기화 또는 로그 조회
export async function PATCH(request: Request) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "") ?? null
  const admin = await requireAdmin(token)
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()

  if (body.action === "reset_fee") {
    await redis.set("auto_bet:total_fee", 0)
    return NextResponse.json({ ok: true })
  }

  if (body.action === "get_logs") {
    const logs = await redis.lrange<string>("auto_bet:logs", 0, 19)
    const accumulatedFee = await redis.get<number>("auto_bet:total_fee") ?? 0
    return NextResponse.json({ logs, accumulatedFee })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
}
