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

// 공통: 유저 배팅 1회 실행 (gameType 지정)
async function runBetForGame(gameType: "baccarat" | "race") {
  const { data: profiles } = await adminSupabase
    .from("profiles")
    .select("id, username")
    .in("username", AUTO_BET_USERNAMES)

  if (!profiles || profiles.length === 0) return { results: [], totalFee: 0, round: 0 }

  // 해당 게임 타입 유저만 필터
  const targetProfiles = profiles.filter(p => {
    const num = parseInt(p.username.replace("사용자", ""))
    return gameType === "baccarat" ? num % 2 !== 0 : num % 2 === 0
  })

  const userIds = targetProfiles.map(p => p.id)
  const { data: balances } = await adminSupabase
    .from("balances").select("user_id, amount").in("user_id", userIds)
  const balMap = Object.fromEntries((balances ?? []).map(b => [b.user_id, b.amount]))

  const nowSec = Math.floor(Date.now() / 1000)
  const roundNumber = gameType === "baccarat"
    ? Math.floor(nowSec / 30)
    : Math.floor(nowSec / 300)
  const ttl = gameType === "baccarat" ? 120 : 700

  const results: {
    username: string; gameType: string; side: string
    amount: number; success: boolean; error?: string; balance: number
  }[] = []
  let totalFee = 0

  for (const p of targetProfiles) {
    const side = gameType === "baccarat"
      ? randomPick(BACCARAT_SIDES)
      : randomPick(RACE_SIDES)
    const amount = randomPick(BET_AMOUNTS)
    const currentBalance = balMap[p.id] ?? 0

    if (currentBalance < amount) {
      results.push({ username: p.username, gameType, side, amount, success: false, error: "잔고 부족", balance: currentBalance })
      continue
    }

    // 레이스: 이번 라운드에 이미 배팅했으면 스킵 (중복 배팅 방지)
    const userBetsKey = `bet:bets:${gameType}:${roundNumber}:${p.id}`
    if (gameType === "race") {
      const existing = await redis.get(userBetsKey)
      if (existing) {
        results.push({ username: p.username, gameType, side, amount, success: false, error: "이미 배팅함", balance: currentBalance })
        continue
      }
    }

    try {
      // 잔고 차감
      const { data: newBal, error: deductErr } = await adminSupabase
        .rpc("deduct_balance_for_bet", { p_user_id: p.id, p_amount: amount })
      if (deductErr) {
        results.push({ username: p.username, gameType, side, amount, success: false, error: deductErr.message, balance: currentBalance })
        continue
      }

      // Redis 풀 반영 (settle-me/bet route.ts와 동일한 키 구조)
      const poolKey  = `pool:${gameType}:${roundNumber}`
      const userSetKey = `users:${gameType}:${roundNumber}`
      await Promise.all([
        redis.hincrby(poolKey, side, amount),
        redis.sadd(userSetKey, p.id),
        redis.expire(poolKey, ttl),
        redis.expire(userSetKey, ttl),
      ])

      // 유저별 배팅 내역 저장 (settle-me가 정산에 사용)
      const betPayload = gameType === "baccarat"
        ? { baccaratSide: side, baccaratAmount: amount }
        : { raceSide: side, raceAmount: amount }
      await redis.set(userBetsKey, JSON.stringify(betPayload), { ex: ttl })

      // odds 스냅샷 저장 (배팅 후 풀 기준 — 간단히 현재 풀로 계산)
      // 실제 odds는 settle-me에서 oddsSnap을 재사용하므로 풀만 저장해도 됨
      const oddsSnapKey = `odds:snap:${gameType}:${roundNumber}:${p.id}`
      const poolData = await redis.hgetall(poolKey).catch(() => null)
      if (poolData) {
        // 간단한 1.95 기본값 스냅 (실제 LP 계산은 서버사이드 odds stream에서)
        // 정산 시 settle-me가 oddsSnap을 우선 사용
        const snap = gameType === "baccarat"
          ? { player: 1.95, banker: 1.95, tie: 1.95 }
          : { bit: 1.95, coin: 1.95, tie: 1.95 }
        await redis.set(oddsSnapKey, JSON.stringify(snap), { ex: ttl })
      }

      // 유저 라운드 키 (settle-me roundNumber 매핑용)
      await redis.set(`bet:round:${gameType}:${p.id}`, roundNumber, { ex: ttl })

      // Redis 잔고 캐시 갱신
      await redis.set(`balance:${p.id}`, newBal as number, { ex: 3600 })
      await redis.incr(`balance_version:${p.id}`)

      totalFee += Math.floor(amount * 0.2)
      balMap[p.id] = newBal as number
      results.push({ username: p.username, gameType, side, amount, success: true, balance: newBal as number })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Unknown error"
      results.push({ username: p.username, gameType, side, amount, success: false, error: msg, balance: currentBalance })
    }
  }

  return { results, totalFee, round: roundNumber }
}

// POST: 자동배팅 1회 실행 (또는 잔고 일괄 충전)
export async function POST(request: Request) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "") ?? null
  const admin = await requireAdmin(token)
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await request.json()

  // action: "top_up"
  if (body.action === "top_up") {
    const { data: profiles } = await adminSupabase
      .from("profiles").select("id").in("username", AUTO_BET_USERNAMES)
    if (!profiles) return NextResponse.json({ ok: true, topped: 0 })
    const ids = profiles.map(p => p.id)
    const { data: balances } = await adminSupabase
      .from("balances").select("user_id, amount").in("user_id", ids)
    const needTopUp = (balances ?? []).filter(b => b.amount < 1000000)
    let topped = 0
    for (const b of needTopUp) {
      await adminSupabase.from("balances").update({ amount: 10000000 }).eq("user_id", b.user_id)
      topped++
    }
    return NextResponse.json({ ok: true, topped })
  }

  // action: "bet_baccarat" — 바카라 유저만 1라운드 배팅
  if (body.action === "bet_baccarat") {
    const { results, totalFee, round } = await runBetForGame("baccarat")
    const existingFee = await redis.get<number>("auto_bet:total_fee") ?? 0
    await redis.set("auto_bet:total_fee", (existingFee as number) + totalFee)
    const logEntry = JSON.stringify({ ts: Date.now(), results, totalFee, gameType: "baccarat" })
    await redis.lpush("auto_bet:logs", logEntry)
    await redis.ltrim("auto_bet:logs", 0, 99)
    return NextResponse.json({ ok: true, gameType: "baccarat", round, results, totalFeeThisRound: totalFee, accumulatedFee: (existingFee as number) + totalFee })
  }

  // action: "bet_race" — 레이스 유저만 1라운드 배팅
  if (body.action === "bet_race") {
    const { results, totalFee, round } = await runBetForGame("race")
    const existingFee = await redis.get<number>("auto_bet:total_fee") ?? 0
    await redis.set("auto_bet:total_fee", (existingFee as number) + totalFee)
    const logEntry = JSON.stringify({ ts: Date.now(), results, totalFee, gameType: "race" })
    await redis.lpush("auto_bet:logs", logEntry)
    await redis.ltrim("auto_bet:logs", 0, 99)
    return NextResponse.json({ ok: true, gameType: "race", round, results, totalFeeThisRound: totalFee, accumulatedFee: (existingFee as number) + totalFee })
  }

  // action: "bet" — 하위 호환: 바카라만 실행 (이전 방식)
  if (body.action === "bet") {
    const { results, totalFee, round } = await runBetForGame("baccarat")
    const existingFee = await redis.get<number>("auto_bet:total_fee") ?? 0
    await redis.set("auto_bet:total_fee", (existingFee as number) + totalFee)
    const logEntry = JSON.stringify({ ts: Date.now(), results, totalFee })
    await redis.lpush("auto_bet:logs", logEntry)
    await redis.ltrim("auto_bet:logs", 0, 99)
    return NextResponse.json({ ok: true, round, results, totalFeeThisRound: totalFee, accumulatedFee: (existingFee as number) + totalFee })
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 })
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
