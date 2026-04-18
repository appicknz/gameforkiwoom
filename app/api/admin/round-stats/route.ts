import { adminSupabase } from "@/lib/supabase-admin"
import { createClient } from "@supabase/supabase-js"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds, branchToLpConfig, LpConfig, DEFAULT_LP_CONFIG } from "@/lib/lp-system"

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

// 한 게임 타입의 라운드 현황 계산 — lpConfig는 DB에서 미리 조회해 전달
async function buildStats(gameType: "baccarat" | "race", roundId: string, lpConfig: LpConfig) {
  const poolKey    = `pool:${gameType}:${roundId}`
  const userSetKey = `users:${gameType}:${roundId}`

  const [pools, userIds] = await Promise.all([
    redis.hgetall(poolKey).catch(() => null),
    redis.smembers(userSetKey).catch(() => []),
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

  let mode: "lp-dominant" | "hybrid" | "pari" = "lp-dominant"
  let effectiveLP = 0
  let prediction: Record<string, number> = {}
  let oddsResult: Record<string, number> = {}
  let fee = 0

  // 배팅 구간 여부 판단 (서버 UTC 기준)
  const nowSec2 = Math.floor(Date.now() / 1000)
  const roundInterval2 = gameType === "baccarat" ? 30 : 180
  const secInRound2 = nowSec2 % roundInterval2
  const inBetting = gameType === "baccarat"
    ? secInRound2 >= 5 && secInRound2 < 15
    : secInRound2 >= 10 && secInRound2 < 60

  // 배팅 마감 이후엔 odds:final(확정 배당)을 우선 반환 → 모니터와 /baka 배당 일치
  const finalOddsRaw = inBetting ? null : await redis.get<string>(`odds:final:${gameType}:${roundId}`).catch(() => null)
  let finalOdds: Record<string, number> | null = null
  if (finalOddsRaw) {
    try { finalOdds = typeof finalOddsRaw === "string" ? JSON.parse(finalOddsRaw) : finalOddsRaw } catch {}
  }

  if (gameType === "baccarat") {
    const p = poolData as { player: number; banker: number; tie: number }
    const r = calcBaccaratOdds(p, lpConfig, userCount)
    mode       = r.mode
    fee        = r.fee
    effectiveLP = Math.max(0, r.totalPool - totalBet)
    // 배팅 마감 후엔 확정 배당 사용, 배팅 중엔 실시간 계산
    oddsResult = finalOdds ?? { player: r.playerOdds, banker: r.bankerOdds, tie: r.tieOdds }
    const o = oddsResult as { player: number; banker: number; tie: number }
    prediction = {
      playerProfit: Math.floor(r.fee + totalBet - p.player * o.player),
      bankerProfit: Math.floor(r.fee + totalBet - p.banker * o.banker),
      tieProfit:    Math.floor(r.fee + totalBet - p.tie    * o.tie),
    }
  } else {
    const p = poolData as { bit: number; coin: number; tie: number }
    const r = calcRaceOdds(p, lpConfig, userCount)
    mode       = r.mode
    fee        = r.fee
    effectiveLP = Math.max(0, r.totalPool - totalBet)
    oddsResult = finalOdds ?? { bit: r.bitOdds, coin: r.coinOdds, tie: r.tieOdds }
    const o = oddsResult as { bit: number; coin: number; tie: number }
    prediction = {
      bitProfit:  Math.floor(r.fee + totalBet - p.bit  * o.bit),
      coinProfit: Math.floor(r.fee + totalBet - p.coin * o.coin),
      tieProfit:  Math.floor(r.fee + totalBet - p.tie  * o.tie),
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
      .from("profiles").select("role, branch_id").eq("id", authUser.id).single()
    if (!profile || !["master", "super_admin", "branch_admin"].includes(profile.role))
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    // 지점 LP 설정을 DB에서 직접 조회 — Redis 캐시 없이 항상 최신값 사용
    let lpConfig: LpConfig = { ...DEFAULT_LP_CONFIG, enabled: false }
    const branchId = profile.branch_id ?? url.searchParams.get("branchId")
    if (branchId) {
      const { data: branch } = await adminSupabase
        .from("branches")
        .select("lp_enabled, lp_amount_baccarat, lp_amount_race, lp_multiplier_baccarat, lp_multiplier_race")
        .eq("id", branchId)
        .single()
      if (branch) lpConfig = branchToLpConfig(branch)
    } else {
      // super_admin: 첫 번째 지점 LP 설정 사용
      const { data: firstBranch } = await adminSupabase
        .from("branches")
        .select("lp_enabled, lp_amount_baccarat, lp_amount_race, lp_multiplier_baccarat, lp_multiplier_race")
        .limit(1)
        .single()
      if (firstBranch) lpConfig = branchToLpConfig(firstBranch)
    }

    // 바카라: 30초 라운드 / 레이스: 180초(3분) 라운드
    // 라운드 경계 직후 타이밍 문제 방지:
    // 현재 라운드에 배팅이 없고 이전 라운드에 배팅이 있으면 이전 라운드를 표시
    const nowSec = Math.floor(Date.now() / 1000)
    const curBaccaratId  = Math.floor(nowSec / 30)
    const curRaceId      = Math.floor(nowSec / 180)

    const qRoundId = url.searchParams.get("roundId")

    // 현재 + 이전 라운드를 동시에 조회
    const [curBaccarat, prevBaccarat, curRace, prevRace] = await Promise.all([
      buildStats("baccarat", String(curBaccaratId),     lpConfig),
      buildStats("baccarat", String(curBaccaratId - 1), lpConfig),
      buildStats("race",     String(curRaceId),         lpConfig),
      buildStats("race",     String(curRaceId - 1),     lpConfig),
    ])

    // 명시적 roundId 지정이 없으면 배팅이 있는 라운드 우선
    const baccarat = qRoundId
      ? curBaccarat
      : (curBaccarat.totalBet === 0 && prevBaccarat.totalBet > 0 ? prevBaccarat : curBaccarat)
    const race = qRoundId
      ? curRace
      : (curRace.totalBet === 0 && prevRace.totalBet > 0 ? prevRace : curRace)

    return NextResponse.json({ baccarat, race })
  } catch (error) {
    console.error("[round-stats] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
