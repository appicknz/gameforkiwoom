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
    // nowSec을 단 한 번만 읽어 phase 검증과 roundNumber 계산을 동일 시점으로 고정
    // 두 번 읽으면 경계(secInRound=19→0)에서 roundNumber가 N+1이 되는 레이스 컨디션 발생
    const nowSec     = Math.floor(Date.now() / 1000)
    const type       = (gameType ?? "baccarat") as "baccarat" | "race"
    const roundSec   = type === "race" ? 180 : 30
    const secInRound = nowSec % roundSec
    const roundNumber = Math.floor(nowSec / roundSec)   // phase 검증 직전 동일 nowSec 사용

    const inBettingPhase = type === "race"
      ? secInRound >= 10 && secInRound < 60
      : secInRound >= 5  && secInRound < 20
    if (!inBettingPhase)
      return NextResponse.json({ error: "Betting is closed for this round" }, { status: 400 })
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

    // ── 잔고 차감 성공 → 즉시 응답 후 나머지는 백그라운드 처리 ──
    // deduct_balance_for_bet RPC 완료 시점에 배팅은 확정됨
    // 풀 반영 / odds 재계산 / 로그는 응답을 블로킹하지 않음
    const response = NextResponse.json({ success: true, newBalance })

    // ── 백그라운드: 풀 반영 + odds 재계산 + 저장 (fire-and-forget) ──
    ;(async () => {
      try {
        // 1단계: 풀 반영 + 잔고 Redis 캐시 + bets 저장 (모두 병렬)
        const [poolPlayer, poolBanker, poolTie, poolBit, poolCoin] = await Promise.all([
          side === "player" ? redis.hincrby(poolKey, "player", betAmount) : redis.hget(poolKey, "player").then(v => parseInt((v as string) ?? "0") || 0),
          side === "banker" ? redis.hincrby(poolKey, "banker", betAmount) : redis.hget(poolKey, "banker").then(v => parseInt((v as string) ?? "0") || 0),
          side === "tie"    ? redis.hincrby(poolKey, "tie",    betAmount) : redis.hget(poolKey, "tie").then(v => parseInt((v as string) ?? "0") || 0),
          side === "bit"    ? redis.hincrby(poolKey, "bit",    betAmount) : redis.hget(poolKey, "bit").then(v => parseInt((v as string) ?? "0") || 0),
          side === "coin"   ? redis.hincrby(poolKey, "coin",   betAmount) : redis.hget(poolKey, "coin").then(v => parseInt((v as string) ?? "0") || 0),
        ])

        // 나머지 Redis ops 병렬
        const [userCount] = await Promise.all([
          redis.sadd(userSetKey, userId).then(() => redis.scard(userSetKey)),
          redis.set(betsKey, JSON.stringify(merged), { ex: ttl }),
          redis.set(userRoundKey, roundNumber, { ex: ttl }),
          redis.expire(poolKey, ttl),
          redis.expire(userSetKey, ttl),
          redis.set(`balance:${userId}`, newBalance as number, { ex: 3600 }),
          redis.incr(`balance_version:${userId}`),
        ])

        // 2단���: odds 재계산 (이미 위에서 pool 값 확보 — 추가 왕복 없음)
        let oddsSnap: Record<string, number> = {}
        if (type === "baccarat") {
          const pool = {
            player: poolPlayer as number,
            banker: poolBanker as number,
            tie:    poolTie    as number,
          }
          const r = calcBaccaratOdds(pool, lpConfig, (userCount as number) ?? 0)
          oddsSnap = {
            player: typeof r.playerOdds === "number" ? r.playerOdds : 1.95,
            banker: typeof r.bankerOdds === "number" ? r.bankerOdds : 1.95,
            tie:    typeof r.tieOdds    === "number" ? r.tieOdds    : 1.95,
          }
        } else {
          const pool = {
            bit:  poolBit  as number,
            coin: poolCoin as number,
            tie:  poolTie  as number,
          }
          const r = calcRaceOdds(pool, lpConfig, (userCount as number) ?? 0)
          oddsSnap = {
            bit:  typeof r.bitOdds  === "number" ? r.bitOdds  : 1.95,
            coin: typeof r.coinOdds === "number" ? r.coinOdds : 1.95,
            tie:  typeof r.tieOdds  === "number" ? r.tieOdds  : 1.95,
          }
        }

        // ── 디버그 로그: 버튼 배당 vs 서버 계산 배당 추적 ──────────
        // settle 시 실제 정산 배당(odds:final)과 비교하기 위해 저장
        const debugLogKey = `bet:debug:${type}:${roundNumber}:${userId}`
        const debugLog = {
          userId,
          gameType: type,
          roundNumber,
          side,
          betAmount,
          // 배팅 직후 서버가 계산한 배당 (내 배팅 포함 후 풀 기준)
          // 이 값은 참고용 — 실제 정산은 라운드 종료 후 Railway가 기록한 odds:final 사용
          serverOddsAfterBet: oddsSnap,
          pools: { player: poolPlayer, banker: poolBanker, tie: poolTie, bit: poolBit, coin: poolCoin },
          placedAt: new Date().toISOString(),
          finalOdds: null,
          settledOdds: null,
          payout: null,
          result: null,
        }
        redis.set(debugLogKey, JSON.stringify(debugLog), { ex: 3600 }).catch(() => {})

        // 3단계: 배팅 구간 재확인 후 odds:current / odds_version 갱신
        const nowSecFinal     = Math.floor(Date.now() / 1000)
        const secInRoundFinal = nowSecFinal % roundSec
        const stillBetting = type === "race"
          ? secInRoundFinal >= 10 && secInRoundFinal < 60
          : secInRoundFinal >= 5  && secInRoundFinal < 20
        const isLockZone = type === "race"
          ? secInRoundFinal >= 57 && secInRoundFinal < 60
          : secInRoundFinal >= 17 && secInRoundFinal < 20

        const currentKey = `odds:current:${type}:${roundNumber}`
        const lockedKey  = `odds:locked:${type}:${roundNumber}`
        const currentPayload = {
          gameType: type, roundNumber,
          userCount: (userCount as number) ?? 0,
          pools: { player: poolPlayer, banker: poolBanker, tie: poolTie, bit: poolBit, coin: poolCoin },
          odds: oddsSnap,
        }
        const balBefore = (newBalance as number) + betAmount

        await Promise.all([
          redis.set(oddsSnapKey, JSON.stringify(oddsSnap), { ex: ttl }),
          redis.set(activeBetKey, JSON.stringify({
            roundNumber, gameType: type, side, amount: betAmount,
            oddsAtBet: oddsSnap,
            placedAt: Date.now(),
          }), { ex: ttl + 10 }),
          // odds:final은 Railway odds/refresh만 기록 — 배팅마다 덮어쓰면 서로 다른 유저 개인 배당이 충돌함
          ...(stillBetting ? [
            redis.set(currentKey, JSON.stringify(currentPayload), { ex: ttl }),
            redis.incr(`odds_version:${type}`),
          ] : []),
          ...(isLockZone ? [redis.set(lockedKey, JSON.stringify(oddsSnap), { ex: 3600 })] : []),
          adminSupabase.from("balance_transactions").insert({
            user_id: userId, branch_id: branchId,
            type: "bet", amount: -betAmount,
            balance_before: balBefore, balance_after: newBalance,
            note: "배팅 차감",
          }),
        ])

        // odds_version incr 완료 후 Railway에 즉시 notify
        // → gatewayPoll 2초 대기 없이 WS push 즉각 발생 → 배팅 즉시 배당 화면 반영
        if (stillBetting) {
          const wsUrl = process.env.NEXT_PUBLIC_PRICE_SERVER_URL
          const secret = process.env.INTERNAL_SECRET ?? "tasko-internal"
          if (wsUrl) {
            // wss:// → https://, ws:// → http:// 로 변환
            const httpUrl = wsUrl.replace(/^wss?:\/\//, (m) => m === "wss://" ? "https://" : "http://")
            fetch(`${httpUrl}/notify`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-internal-secret": secret },
              body: JSON.stringify({ channel: "odds", gameType: type }),
            }).catch(() => {})
          }
        }
      } catch (bgErr) {
        console.error("[bet] background error:", bgErr)
      }
    })()

    return response
  } catch (error) {
    console.error("[bet] error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
