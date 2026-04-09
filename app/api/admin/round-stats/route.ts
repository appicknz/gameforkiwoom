import { adminSupabase } from "@/lib/supabase-admin"
import { createClient } from "@supabase/supabase-js"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds } from "@/lib/lp-system"

// anon 클라이언트로 사용자 토큰 검증 (service role 클라이언트는 토큰 검증 불가)
async function getUserFromToken(token: string) {
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data, error } = await anonClient.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

// 한 게임 타입의 라운드 현황 계산
async function buildStats(gameType: "baccarat" | "race", roundId: string) {
  const poolKey    = `pool:${gameType}:${roundId}`
  const userSetKey = `users:${gameType}:${roundId}`
  const lpCacheKey = `lp_config:${gameType}:${roundId}`

  const [pools, userIds, lpConfigRaw] = await Promise.all([
    redis.hgetall(poolKey).catch(() => null),
    redis.smembers(userSetKey).catch(() => []),
    redis.get(lpCacheKey).catch(() => null),
  ])

  const poolData = gameType === "baccarat"
    ? {
        player: Number((pools as Record<string, unknown>)?.player ?? 0) || 0,
        banker: Number((pools as Record<string, unknown>)?.banker ?? 0) || 0,
        tie:    Number((pools as Record<string, unknown>)?.tie    ?? 0) || 0,
      }
    : {
        bit:  Number((pools as Record<string, unknown>)?.bit  ?? 0) || 0,
        coin: Number((pools as Record<string, unknown>)?.coin ?? 0) || 0,
        tie:  Number((pools as Record<string, unknown>)?.tie  ?? 0) || 0,
      }

  const userCount = Array.isArray(userIds) ? userIds.length : 0
  const totalBet  = Object.values(poolData).reduce((a, b) => a + b, 0)

  let lpEnabled = true
  let lpAmount = 50000
  try {
    if (lpConfigRaw) {
      const parsed = typeof lpConfigRaw === "string" ? JSON.parse(lpConfigRaw) : lpConfigRaw
      lpEnabled = parsed.enabled ?? true
      lpAmount = gameType === "baccarat"
        ? (parsed.baccarat ?? parsed.lpAmountBaccarat ?? 50000)
        : (parsed.race    ?? parsed.lpAmountRace     ?? 50000)
    }
  } catch {}

  const lpConfig = { enabled: lpEnabled, lpAmountBaccarat: lpAmount, lpAmountRace: lpAmount }

  let mode: "lp-dominant" | "hybrid" | "pari" = "lp-dominant"
  let effectiveLP = 0
  let prediction: Record<string, number> = {}
  let oddsResult: Record<string, number> = {}
  let fee = 0

  if (gameType === "baccarat") {
    const p = poolData as { player: number; banker: number; tie: number }
    const r = calcBaccaratOdds(p, lpConfig, userCount)
    mode       = r.mode
    fee        = r.fee
    effectiveLP = Math.max(0, r.totalPool - totalBet)
    oddsResult = { player: r.playerOdds, banker: r.bankerOdds, tie: r.tieOdds }
    prediction = {
      playerProfit: Math.floor(r.fee + totalBet - p.player * r.playerOdds),
      bankerProfit: Math.floor(r.fee + totalBet - p.banker * r.bankerOdds),
      tieProfit:    Math.floor(r.fee + totalBet - p.tie    * r.tieOdds),
    }
  } else {
    const p = poolData as { bit: number; coin: number; tie: number }
    const r = calcRaceOdds(p, lpConfig, userCount)
    mode       = r.mode
    fee        = r.fee
    effectiveLP = Math.max(0, r.totalPool - totalBet)
    oddsResult = { bit: r.bitOdds, coin: r.coinOdds, tie: r.tieOdds }
    prediction = {
      bitProfit:  Math.floor(r.fee + totalBet - p.bit  * r.bitOdds),
      coinProfit: Math.floor(r.fee + totalBet - p.coin * r.coinOdds),
      tieProfit:  Math.floor(r.fee + totalBet - p.tie  * r.tieOdds),
    }
  }

  return {
    round: roundId,
    gameType,
    timestamp: new Date().toISOString(),
    pools: poolData,
    userCount,
    totalBet,
    lpAmount: effectiveLP,
    fee,          // 20% 수수료 금액
    feeRate: 0.20,
    mode,
    odds: oddsResult,
    prediction,
  }
}

// GET: 바카라 + 레이스 두 게임을 동시에 반환
export async function GET(request: Request) {
  try {
    const url   = new URL(request.url)
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const authUser = await getUserFromToken(token)
    if (!authUser) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

    const { data: profile } = await adminSupabase
      .from("profiles").select("role").eq("id", authUser.id).single()
    if (!profile || !["master", "super_admin", "branch_admin"].includes(profile.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    // 바카라: 30초 라운드 / 레이스: 300초(5분) 라운드
    const nowSec = Math.floor(Date.now() / 1000)
    const baccaratRound = url.searchParams.get("roundId") || String(Math.floor(nowSec / 30))
    const raceRound     = String(Math.floor(nowSec / 300))

    const [baccarat, race] = await Promise.all([
      buildStats("baccarat", baccaratRound),
      buildStats("race",     raceRound),
    ])

    return NextResponse.json({ baccarat, race })
  } catch (error) {
    console.error("[round-stats] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
