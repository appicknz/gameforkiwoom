import { redis } from "@/lib/redis"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds, branchToLpConfig, DEFAULT_LP_CONFIG } from "@/lib/lp-system"

})

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
  const supabase = adminSupabase

  try {
    const { betAmount, gameType, side, bets: betsPayload } = await request.json()
    // gameType: "baccarat" | "race" (optional)
    // side: "player"|"banker"|"tie" for baccarat, "bit"|"coin"|"tie" for race (optional)
    // bets: 전체 배팅 내역 (settle API가 읽음 — direction/digit/parity/baccaratSide 포함)
    if (!betAmount || betAmount <= 0) {
      return NextResponse.json({ error: "Invalid bet amount" }, { status: 400 })
    }

    // ── 배팅 구간 서버 검증 (UTC 기준) ───────────────────────────
    // baccarat: 30초 라운드, 정산 0~4초, 배팅 5~19초, 게임중 20~29초
    // race:    180초 라운드, 정산 0~9초, 배팅 10~59초, 게임중 60~179초
    const nowSec = Math.floor(Date.now() / 1000)
    const type = (gameType ?? "baccarat") as "baccarat" | "race"
    const roundSec = type === "race" ? 180 : 30
    const secInRound = nowSec % roundSec
    const inBettingPhase = type === "race"
      ? secInRound >= 10 && secInRound < 60
      : secInRound >= 5  && secInRound < 20
    if (!inBettingPhase) {
      return NextResponse.json({ error: "Betting is closed for this round" }, { status: 400 })
    }

    // 토큰 검증 + 중복 세션 확인
    const authResult = await verifySession(request)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const userId = authResult.userId

    // atomic RPC로 잔고 차감 — SELECT→UPDATE 레이스 컨디션 완전 제거
    const { data: newBalance, error: deductError } = await supabase
      .rpc("deduct_balance_for_bet", { p_user_id: userId, p_amount: betAmount })

    if (deductError) {
      // INSUFFICIENT_BALANCE 또는 유저 없음
      const isInsufficient = deductError.message?.includes("INSUFFICIENT_BALANCE")
      return NextResponse.json(
        { error: isInsufficient ? "Insufficient balance" : "Failed to update balance" },
        { status: isInsufficient ? 400 : 500 }
      )
    }

    // 유저의 branch_id 조회 (balance_transactions FK 필요)
    const { data: profileData } = await supabase
      .from("profiles")
      .select("branch_id")
      .eq("id", userId)
      .single()

    // balance_transactions 기록 (배팅 차감 이력)
    // balance_before = 차감 후 잔고 + 배팅금 (atomic RPC가 차감 후 잔고를 반환하므로 역산)
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

    // Redis에 최신 잔고 저장 + version increment → balance SSE가 변경 감지
    // newBalance는 DB atomic RPC에서 반환한 실제 차감 후 잔고
    const redisOps: Promise<unknown>[] = [
      redis.set(`balance:${userId}`, newBalance as number, { ex: 3600 }),
      redis.incr(`balance_version:${userId}`),
    ]

      // 배팅 풀 집계 + 유저별 bets 저장 (settle API 사용)
      // baccarat: 30초 라운드, race: 180초(3분) 라운드 — SSE/settle/round-stats 동일 기준
      if (gameType && side) {
        const nowSec = Math.floor(Date.now() / 1000)
        const roundNumber = gameType === "race"
          ? Math.floor(nowSec / 180)
          : Math.floor(nowSec / 30)
        // TTL을 충분히 길게 유지 — settle-me가 라운드 종료 후 호출될 때도 배당 조회 가능
        const ttl = gameType === "race" ? 3600 : 3600

      const poolKey       = `pool:${gameType}:${roundNumber}`
      const userSetKey    = `users:${gameType}:${roundNumber}`
      const betsKey       = `bet:bets:${gameType}:${roundNumber}:${userId}`
      const oddsSnapKey   = `odds:snap:${gameType}:${roundNumber}:${userId}`

      // 기존 bets에 merge (여러 번 배팅 가능)
      const existing = await redis.get<string>(betsKey)
      const prev = existing ? (typeof existing === "string" ? JSON.parse(existing) : existing) : {}
      const merged = betsPayload ? { ...prev, ...betsPayload } : prev

      // baccaratSide / raceSide 누락 방어: side 파라미터로 강제 보정
      if (gameType === "baccarat" && side && !merged.baccaratSide) {
        merged.baccaratSide = side
        if (!merged.baccaratAmount) merged.baccaratAmount = betAmount
      }
      if (gameType === "race" && side && !merged.raceSide) {
        merged.raceSide = side
        if (!merged.raceAmount) merged.raceAmount = betAmount
      }

      const branchId: string | null = profileData?.branch_id ?? null

      // LP 설정 조회
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

      // 유저의 현재 진행중 배팅 roundNumber를 별도 키로 저장
      const userRoundKey = `bet:round:${gameType}:${userId}`

      // ── 배팅을 먼저 풀에 반영 ─────────────────────────────────
      await Promise.all([
        redis.hincrby(poolKey, side, betAmount),
        redis.sadd(userSetKey, userId),
        redis.set(betsKey, JSON.stringify(merged), { ex: ttl }),
        redis.set(userRoundKey, roundNumber, { ex: ttl }),
        redis.expire(poolKey, ttl),
        redis.expire(userSetKey, ttl),
      ])

      // ── 배팅 반영 후 풀로 odds 재계산 → 스냅샷 저장 ─────────────
      // 화면에 표시되는 odds와 동일한 값(배팅 반영 후 풀 기준)
      const poolDataAfter = await redis.hgetall(poolKey).catch(() => null)
      let oddsSnap: Record<string, number> = {}
      if (gameType === "baccarat") {
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

      // 유저 개인 odds 스냅샷만 저장 — 배팅 시점 기록용
      // odds:final은 SSE(배팅→게임중 전환 순간)만 저장 — 여기서 덮어쓰면 배당 오염됨
      await redis.set(oddsSnapKey, JSON.stringify(oddsSnap), { ex: ttl })

      // 활성 배팅 저장 — 새로고침 시 복원용 (TTL = 라운드 종료 후 약간 여유)
      const activeBetKey = `bet:active:${gameType}:${roundNumber}:${userId}`
      await redis.set(activeBetKey, JSON.stringify({
        roundNumber,
        gameType,
        side,
        amount: betAmount,
        oddsAtBet: oddsSnap,
        placedAt: Date.now(),
      }), { ex: ttl + 10 })

    }

    // pool 저장 완료 후 SSE 트리거 (버전 카운터 increment)
    await Promise.all(redisOps)

    const triggerOps: Promise<unknown>[] = []
    if (gameType && side) {
      triggerOps.push(redis.incr(`odds_version:${gameType}`))
    }
    if (triggerOps.length > 0) await Promise.all(triggerOps)

    return NextResponse.json({ success: true, newBalance })
  } catch (error) {
    console.error("[v0] Bet API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
