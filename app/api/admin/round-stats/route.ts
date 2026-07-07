export const dynamic = "force-dynamic"
import { redis } from "@/lib/redis"
import { adminSupabase } from "@/lib/supabase-admin"
import { getUserIdFromToken } from "@/lib/auth"
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds, branchToLpConfig, LpConfig, DEFAULT_LP_CONFIG } from "@/lib/lp-system"


// 한 게임 타입의 라운드 현황 계산
// pool:hash를 직접 읽어 즉시 계산 — odds:current(Railway 500ms 지연)를 사용하지 않음
// 이렇게 해야 배팅 직후 관리자 패널 배당이 유저 버튼 배당과 100% 일치
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

  // 항상 실제 pool로 직접 계산 — Railway odds:current(500ms 지연) 사용 안 함
  let mode: "lp-dominant" | "hybrid" | "pari" = "lp-dominant"
  let effectiveLP = 0
  let prediction: Record<string, number> = {}
  let oddsResult: Record<string, number> = {}
  let fee = 0

  if (gameType === "baccarat") {
    const p = poolData as { player: number; banker: number; tie: number }
    const r = calcBaccaratOdds(p, lpConfig, userCount)
    mode = r.mode; fee = r.fee
    effectiveLP = Math.max(0, r.totalPool - totalBet)
    oddsResult = { player: r.playerOdds, banker: r.bankerOdds, tie: r.tieOdds }
    const o = oddsResult as { player: number; banker: number; tie: number }
    prediction = {
      playerProfit: Math.floor(r.fee + totalBet - p.player * o.player),
      bankerProfit: Math.floor(r.fee + totalBet - p.banker * o.banker),
      tieProfit:    Math.floor(r.fee + totalBet - p.tie    * o.tie),
    }
  } else {
    const p = poolData as { bit: number; coin: number; tie: number }
    const r = calcRaceOdds(p, lpConfig, userCount)
    mode = r.mode; fee = r.fee
    effectiveLP = Math.max(0, r.totalPool - totalBet)
    oddsResult = { bit: r.bitOdds, coin: r.coinOdds, tie: r.tieOdds }
    const o = oddsResult as { bit: number; coin: number; tie: number }
    prediction = {
      bitProfit:  Math.floor(r.fee + totalBet - p.bit  * o.bit),
      coinProfit: Math.floor(r.fee + totalBet - p.coin * o.coin),
      tieProfit:  Math.floor(r.fee + totalBet - p.tie  * o.tie),
    }
  }

  return {
    round: roundId, gameType,
    timestamp: new Date().toISOString(),
    pools: poolData, userCount, totalBet,
    lpAmount: effectiveLP, fee, feeRate: 0.20,
    mode, odds: oddsResult, prediction,
  }
}

// GET: 바카라 + 레이스 두 게임을 동시에 반환
export async function GET(request: Request) {
  try {
    const url   = new URL(request.url)
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userId = await getUserIdFromToken(token)
    if (!userId) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

    const { data: profile } = await adminSupabase
      .from("profiles").select("role, branch_id").eq("id", userId).single()
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

    // 현재 + 이전 라운드를 ��시에 조회 — odds:current 단일 키 읽음
    const [curBaccarat, prevBaccarat, curRace, prevRace] = await Promise.all([
      buildStats("baccarat", String(curBaccaratId),     lpConfig),
      buildStats("baccarat", String(curBaccaratId - 1), lpConfig),
      buildStats("race",     String(curRaceId),         lpConfig),
      buildStats("race",     String(curRaceId - 1),     lpConfig),
    ])

    // 항상 현재 라운드를 주 데이터로 사용 — 이전 라운드로 대체하지 않음
    // (이전 동작: 현재 라운드 배팅 없으면 이전 라운드 표시 → /baka와 라운드 번호 불일치 원인)
    const baccarat = qRoundId ? curBaccarat : curBaccarat
    const race     = qRoundId ? curRace     : curRace

    return NextResponse.json({ baccarat, race })
  } catch (error) {
    console.error("[round-stats] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
