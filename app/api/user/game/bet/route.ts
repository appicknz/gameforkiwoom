export const dynamic = "force-dynamic"
import { redis } from "@/lib/redis"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds, branchToLpConfig, DEFAULT_LP_CONFIG } from "@/lib/lp-system"


/** 현재 라운드 활성 배팅 조회 — 새로고침 복원용 */
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { userId } = auth

  const url = new URL(req.url)
  const gameType = (url.searchParams.get("type") ?? "baccarat") as "baccarat" | "race"
  const roundInterval = gameType === "race" ? 180 : 30
  const nowSec = Math.floor(Date.now() / 1000)
  const currentRound = Math.floor(nowSec / roundInterval)

  // 현재 라운드 + 직전 라운드 모두 확인 (정산 구간에 새로고침 대비)
  const [cur, prev] = await Promise.all([
    redis.get(`bet:active:${gameType}:${currentRound}:${userId}`),
    redis.get(`bet:active:${gameType}:${currentRound - 1}:${userId}`),
  ])
  const raw = cur ?? prev
  if (!raw) return NextResponse.json({ activeBet: null })
  const activeBet = typeof raw === "string" ? JSON.parse(raw) : raw
  return NextResponse.json({ activeBet })
}

export async function POST(request: Request) {
  try {
    const [bodyJson, authResult] = await Promise.all([
      request.json(),
      verifySession(request),          // body parse와 토큰 검증을 병렬로
    ])
    const { betAmount, gameType, side, bets: betsPayload } = bodyJson

    if (!betAmount || betAmount <= 0)
      return NextResponse.json({ error: "Invalid bet amount" }, { status: 400 })

    if (!authResult.ok)
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })

    const userId = authResult.userId

    // ── 배팅 구간 서버 검증 ─────────────────────────────────────
    const nowSec     = Math.floor(Date.now() / 1000)
    const type       = (gameType ?? "baccarat") as "baccarat" | "race"
    const roundSec   = type === "race" ? 180 : 30
    const secInRound = nowSec % roundSec
    const inBettingPhase = type === "race"
      ? secInRound >= 10 && secInRound < 60
      : secInRound >= 5  && secInRound < 20
    if (!inBettingPhase)
      return NextResponse.json({ error: "Betting is closed for this round" }, { status: 400 })

    const roundNumber = type === "race"
      ? Math.floor(nowSec / 180)
      : Math.floor(nowSec / 30)
    const ttl = 3600

    const poolKey     = `pool:${type}:${roundNumber}`
    const userSetKey  = `users:${type}:${roundNumber}`
    const betsKey     = `bet:bets:${type}:${roundNumber}:${userId}`
    const oddsSnapKey = `odds:snap:${type}:${roundNumber}:${userId}`
    const userRoundKey = `bet:round:${type}:${userId}`
    const activeBetKey = `bet:active:${type}:${roundNumber}:${userId}`
    const lpCacheKey  = `lp:config:user:${userId}`

    // ── 잔고 차감 + profiles + 기존 bets + LP캐시를 동시에 처리 ──
    const [
      { data: newBalance, error: deductError },
      { data: profileData },
      existingBets,
      cachedLp,
    ] = await Promise.all([
      adminSupabase.rpc("deduct_balance_for_bet", { p_user_id: userId, p_amount: betAmount }),
      adminSupabase.from("profiles").select("branch_id").eq("id", userId).single(),
      redis.get<string>(betsKey),
      redis.get<string>(lpCacheKey),
    ])

    if (deductError) {
      const isInsufficient = deductError.message?.includes("INSUFFICIENT_BALANCE")
      return NextResponse.json(
        { error: isInsufficient ? "Insufficient balance" : "Failed to update balance" },
        { status: isInsufficient ? 400 : 500 }
      )
    }

    // ── LP 설정 (캐시 히트 or DB 조회) ────────────────────────
    let lpConfig = { ...DEFAULT_LP_CONFIG }
    const branchId: string | null = profileData?.branch_id ?? null
    if (cachedLp) {
      try { lpConfig = typeof cachedLp === "string" ? JSON.parse(cachedLp) : cachedLp } catch {}
    } else if (branchId) {
      const { data: branch } = await adminSupabase
        .from("branches")
        .select("lp_enabled, lp_amount_baccarat, lp_amount_race, lp_multiplier_baccarat, lp_multiplier_race")
        .eq("id", branchId).single()
      if (branch) {
        lpConfig = branchToLpConfig(branch)
        redis.set(lpCacheKey, JSON.stringify(lpConfig), { ex: 30 })  // fire-and-forget
      }
    }

    // ── bets merge ───────────────────────────────────────────
    const prev   = existingBets ? (typeof existingBets === "string" ? JSON.parse(existingBets) : existingBets) : {}
    const merged = betsPayload ? { ...prev, ...betsPayload } : prev
    if (type === "baccarat" && side && !merged.baccaratSide) {
      merged.baccaratSide = side
      if (!merged.baccaratAmount) merged.baccaratAmount = betAmount
    }
    if (type === "race" && side && !merged.raceSide) {
      merged.raceSide = side
      if (!merged.raceAmount) merged.raceAmount = betAmount
    }

    // ── 배팅 풀 반영 + 잔고 Redis 갱신을 한 번의 Promise.all로 ──
    await Promise.all([
      redis.hincrby(poolKey, side, betAmount),
      redis.sadd(userSetKey, userId),
      redis.set(betsKey, JSON.stringify(merged), { ex: ttl }),
      redis.set(userRoundKey, roundNumber, { ex: ttl }),
      redis.expire(poolKey, ttl),
      redis.expire(userSetKey, ttl),
      redis.set(`balance:${userId}`, newBalance as number, { ex: 3600 }),
      redis.incr(`balance_version:${userId}`),
    ])

    // ── odds 재계산 (poolData + userCount 병렬) ─────────────
    const [poolDataAfter, userCount] = await Promise.all([
      redis.hgetall(poolKey).catch(() => null),
      redis.scard(userSetKey).catch(() => 0),
    ])

    let oddsSnap: Record<string, number> = {}
    if (type === "baccarat") {
      const pool = {
        player: parseInt((poolDataAfter?.player as string) ?? "0") || 0,
        banker: parseInt((poolDataAfter?.banker as string) ?? "0") || 0,
        tie:    parseInt((poolDataAfter?.tie    as string) ?? "0") || 0,
      }
      const r = calcBaccaratOdds(pool, lpConfig, userCount as number)
      oddsSnap = {
        player: typeof r.playerOdds === "number" ? r.playerOdds : 1.95,
        banker: typeof r.bankerOdds === "number" ? r.bankerOdds : 1.95,
        tie:    typeof r.tieOdds    === "number" ? r.tieOdds    : 1.95,
      }
    } else {
      const pool = {
        bit:  parseInt((poolDataAfter?.bit  as string) ?? "0") || 0,
        coin: parseInt((poolDataAfter?.coin as string) ?? "0") || 0,
        tie:  parseInt((poolDataAfter?.tie  as string) ?? "0") || 0,
      }
      const r = calcRaceOdds(pool, lpConfig, userCount as number)
      oddsSnap = {
        bit:  typeof r.bitOdds  === "number" ? r.bitOdds  : 1.95,
        coin: typeof r.coinOdds === "number" ? r.coinOdds : 1.95,
        tie:  typeof r.tieOdds  === "number" ? r.tieOdds  : 1.95,
      }
    }

    // ── 최종 저장 + SSE 트리거 + odds:current 공유 캐시 갱신 ──
    const balBefore  = (newBalance as number) + betAmount
    const currentKey = `odds:current:${type}:${roundNumber}`
    const lockedKey  = `odds:locked:${type}:${roundNumber}`

    // 배팅마다 odds:current 갱신 → 관리자 패널과 /baka 배당이 항상 동일
    const currentPayload = {
      gameType: type,
      roundNumber,
      userCount: (userCount as number) ?? 0,
      pools: poolDataAfter,
      odds: oddsSnap,
    }

    // 배팅 구간 마지막 3초(baccarat: secInRound 17~19, race: secInRound 57~59)에
    // odds:locked를 저장 — 이 키가 존재하면 정산·패널이 이 값을 확정 배당으로 사용
    const isLockZone = type === "race"
      ? secInRound >= 57 && secInRound < 60
      : secInRound >= 17 && secInRound < 20
    const lockOps: Promise<unknown>[] = isLockZone
      ? [redis.set(lockedKey, JSON.stringify(oddsSnap), { ex: 3600 })]
      : []

    await Promise.all([
      redis.set(oddsSnapKey,  JSON.stringify(oddsSnap), { ex: ttl }),
      redis.set(currentKey,   JSON.stringify(currentPayload), { ex: ttl }),
      redis.set(activeBetKey, JSON.stringify({
        roundNumber, gameType: type, side, amount: betAmount,
        oddsAtBet: oddsSnap, placedAt: Date.now(),
      }), { ex: ttl + 10 }),
      redis.incr(`odds_version:${type}`),
      ...lockOps,
      // balance_transactions는 응답에 영향 없으므로 fire-and-forget
      adminSupabase.from("balance_transactions").insert({
        user_id: userId, branch_id: branchId,
        type: "bet", amount: -betAmount,
        balance_before: balBefore, balance_after: newBalance,
        note: "배팅 차감",
      }),
    ])

    return NextResponse.json({ success: true, newBalance })
  } catch (error) {
    console.error("[bet] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
