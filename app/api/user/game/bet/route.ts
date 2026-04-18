import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds, branchToLpConfig, DEFAULT_LP_CONFIG } from "@/lib/lp-system"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export async function POST(request: Request) {
  const supabase = adminSupabase

  try {
    const { betAmount, gameType, side, bets: betsPayload } = await request.json()

    if (!betAmount || betAmount <= 0) {
      return NextResponse.json({ error: "Invalid bet amount" }, { status: 400 })
    }

    // ── 배팅 구간 서버 검증 (UTC 기준) ───────────────────────────
    // baccarat: secInRound 5~14초, race: secInRound 10~59초
    const nowSec = Math.floor(Date.now() / 1000)
    const type = (gameType ?? "baccarat") as "baccarat" | "race"
    const roundSec = type === "race" ? 180 : 30
    const secInRound = nowSec % roundSec
    const inBettingPhase = type === "race"
      ? secInRound >= 10 && secInRound < 60
      : secInRound >= 5 && secInRound < 15
    if (!inBettingPhase) {
      return NextResponse.json({ error: "Betting is closed for this round" }, { status: 400 })
    }

    // 토큰 검증
    const authResult = await verifySession(request)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const userId = authResult.userId

    // atomic RPC로 잔고 차감
    const { data: newBalance, error: deductError } = await supabase
      .rpc("deduct_balance_for_bet", { p_user_id: userId, p_amount: betAmount })

    if (deductError) {
      const isInsufficient = deductError.message?.includes("INSUFFICIENT_BALANCE")
      return NextResponse.json(
        { error: isInsufficient ? "Insufficient balance" : "Failed to update balance" },
        { status: isInsufficient ? 400 : 500 }
      )
    }

    // 유저의 branch_id 조회
    const { data: profileData } = await supabase
      .from("profiles")
      .select("branch_id")
      .eq("id", userId)
      .single()

    // balance_transactions 기록
    const balBefore = (newBalance as number) + betAmount
    await supabase.from("balance_transactions").insert({
      user_id: userId,
      branch_id: profileData?.branch_id ?? null,
      type: "bet",
      amount: -betAmount,
      balance_before: balBefore,
      balance_after: newBalance,
      note: `배팅 차감`,
    })

    // Redis에 최신 잔고 저장 + balance SSE 트리거
    await Promise.all([
      redis.set(`balance:${userId}`, newBalance as number, { ex: 3600 }),
      redis.incr(`balance_version:${userId}`),
    ])

    // ── 배팅 풀 집계 + 유저별 bets 저장 ─────────────────────────
    // baccarat: 30초 라운드, race: 180초(3분) 라운드 — SSE/settle과 동일 기준
    const roundNumber = type === "race"
      ? Math.floor(nowSec / 180)
      : Math.floor(nowSec / 30)
    const ttl = type === "race" ? 400 : 120

    const poolKey     = `pool:${type}:${roundNumber}`
    const userSetKey  = `users:${type}:${roundNumber}`
    const betsKey     = `bet:bets:${type}:${roundNumber}:${userId}`
    const oddsSnapKey = `odds:snap:${type}:${roundNumber}:${userId}`
    const userRoundKey = `bet:round:${type}:${userId}`

    // 기존 bets에 merge (여러 번 배팅 가능)
    const existing = await redis.get<string>(betsKey)
    const prev = existing ? (typeof existing === "string" ? JSON.parse(existing) : existing) : {}
    const merged = betsPayload ? { ...prev, ...betsPayload } : prev

    if (type === "baccarat" && side && !merged.baccaratSide) {
      merged.baccaratSide = side
      if (!merged.baccaratAmount) merged.baccaratAmount = betAmount
    }
    if (type === "race" && side && !merged.raceSide) {
      merged.raceSide = side
      if (!merged.raceAmount) merged.raceAmount = betAmount
    }

    const branchId: string | null = profileData?.branch_id ?? null

    // LP 설정 조회 (캐시 우선)
    let lpConfig = { ...DEFAULT_LP_CONFIG }
    const lpCacheKey = `lp:config:user:${userId}`
    const cachedLp = await redis.get<string>(lpCacheKey)
    if (cachedLp) {
      try { lpConfig = typeof cachedLp === "string" ? JSON.parse(cachedLp) : cachedLp } catch {}
    } else if (branchId) {
      const { data: branch } = await adminSupabase
        .from("branches")
        .select("lp_enabled, lp_amount_baccarat, lp_amount_race, lp_multiplier_baccarat, lp_multiplier_race")
        .eq("id", branchId).single()
      if (branch) {
        lpConfig = branchToLpConfig(branch)
        await redis.set(lpCacheKey, JSON.stringify(lpConfig), { ex: 30 })
      }
    }

    // 배팅을 풀에 반영
    await Promise.all([
      redis.hincrby(poolKey, side, betAmount),
      redis.sadd(userSetKey, userId),
      redis.set(betsKey, JSON.stringify(merged), { ex: ttl }),
      redis.set(userRoundKey, roundNumber, { ex: ttl }),
      redis.expire(poolKey, ttl),
      redis.expire(userSetKey, ttl),
    ])

    // 배팅 반영 후 풀로 odds 재계산 → 스냅샷 저장
    const poolDataAfter = await redis.hgetall(poolKey).catch(() => null)
    let oddsSnap: Record<string, number> = {}

    if (type === "baccarat") {
      const pool = {
        player: parseInt((poolDataAfter?.player as string) ?? "0") || 0,
        banker: parseInt((poolDataAfter?.banker as string) ?? "0") || 0,
        tie:    parseInt((poolDataAfter?.tie    as string) ?? "0") || 0,
      }
      const userCount = await redis.scard(`users:baccarat:${roundNumber}`).catch(() => 0)
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
      const userCount = await redis.scard(`users:race:${roundNumber}`).catch(() => 0)
      const r = calcRaceOdds(pool, lpConfig, userCount as number)
      oddsSnap = {
        bit:  typeof r.bitOdds  === "number" ? r.bitOdds  : 1.95,
        coin: typeof r.coinOdds === "number" ? r.coinOdds : 1.95,
        tie:  typeof r.tieOdds  === "number" ? r.tieOdds  : 1.95,
      }
    }

    // 유저별 odds 스냅샷 저장 (최신 풀 기준으로 항상 덮어씀)
    const existingSnap = await redis.get<string>(oddsSnapKey)
    const prevSnap = existingSnap
      ? (typeof existingSnap === "string" ? JSON.parse(existingSnap) : existingSnap)
      : {}
    const mergedSnap = { ...prevSnap, ...oddsSnap }
    await redis.set(oddsSnapKey, JSON.stringify(mergedSnap), { ex: ttl })

    // 라운드 단위 확정 배당 저장 (브랜치별 스코프 — settle이 동일 키로 읽음)
    const betBranchScope = branchId ?? "default"
    const finalOddsKey = `odds:final:${type}:${roundNumber}:${betBranchScope}`
    await redis.set(finalOddsKey, JSON.stringify(oddsSnap), { ex: ttl })

    // SSE 트리거 — odds/stream이 버전 변경 감지 후 클라이언트에 배당 푸시
    await redis.incr(`odds_version:${type}`)

    return NextResponse.json({ success: true, newBalance })
  } catch (error) {
    console.error("[bet] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
