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
    // gameType: "baccarat" | "race" (optional)
    // side: "player"|"banker"|"tie" for baccarat, "bit"|"coin"|"tie" for race (optional)
    // bets: 전체 배팅 내역 (settle API가 읽음 — direction/digit/parity/baccaratSide 포함)
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
      : secInRound >= 5  && secInRound < 15
    if (!inBettingPhase) {
      return NextResponse.json({ error: "Betting is closed for this round" }, { status: 400 })
    }

    // 토큰 검증 + 중복 세션 확인
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

    // ── RPC 성공 → 즉시 응답, 나머지 처리는 백그라운드 ──────────
    // 잔고 차감 후 후속 처리 실패로 500 반환하는 문제 방지
    const finalBalance = newBalance as number

    // 백그라운드: Redis 잔고 갱신 + 배팅 풀 집계 + balance_transactions 기록
    ;(async () => {
      try {
        // 잔고 Redis 저장 + version increment (SSE 트리거)
        await Promise.all([
          redis.set(`balance:${userId}`, finalBalance, { ex: 3600 }),
          redis.incr(`balance_version:${userId}`),
        ])
      } catch {}

      try {
        // profile 조회 (branch_id)
        const { data: profileData } = await adminSupabase
          .from("profiles").select("branch_id").eq("id", userId).single()
        const branchId: string | null = profileData?.branch_id ?? null

        // balance_transactions 기록
        await adminSupabase.from("balance_transactions").insert({
          user_id: userId, branch_id: branchId, type: "bet",
          amount: -betAmount,
          balance_before: finalBalance + betAmount,
          balance_after: finalBalance,
          note: "배팅 차감",
        })

        if (!gameType || !side) return

        const roundNumber = gameType === "race"
          ? Math.floor(Math.floor(Date.now() / 1000) / 180)
          : Math.floor(Math.floor(Date.now() / 1000) / 30)
        const ttl = 3600
        const poolKey    = `pool:${gameType}:${roundNumber}`
        const userSetKey = `users:${gameType}:${roundNumber}`
        const betsKey    = `bet:bets:${gameType}:${roundNumber}:${userId}`
        const userRoundKey = `bet:round:${gameType}:${userId}`

        // 기존 bets merge (raw 값을 안전하게 파싱)
        const existingRaw = await redis.get(betsKey)
        let prev: Record<string, unknown> = {}
        if (existingRaw) {
          try { prev = typeof existingRaw === "string" ? JSON.parse(existingRaw) : existingRaw as Record<string, unknown> } catch {}
        }
        const merged: Record<string, unknown> = betsPayload ? { ...prev, ...betsPayload } : { ...prev }
        if (gameType === "baccarat" && !merged.baccaratSide) {
          merged.baccaratSide = side
          if (!merged.baccaratAmount) merged.baccaratAmount = betAmount
        }
        if (gameType === "race" && !merged.raceSide) {
          merged.raceSide = side
          if (!merged.raceAmount) merged.raceAmount = betAmount
        }

        // 풀 집계 + bets 저장 병렬
        await Promise.all([
          redis.hincrby(poolKey, side, betAmount),
          redis.sadd(userSetKey, userId),
          redis.set(betsKey, JSON.stringify(merged), { ex: ttl }),
          redis.set(userRoundKey, roundNumber, { ex: ttl }),
          redis.expire(poolKey, ttl),
          redis.expire(userSetKey, ttl),
        ])

        // LP 설정 (캐시 우선)
        let lpConfig = { ...DEFAULT_LP_CONFIG }
        const lpCacheKey = `lp:config:user:${userId}`
        const cachedLpRaw = await redis.get(lpCacheKey)
        if (cachedLpRaw) {
          try { lpConfig = typeof cachedLpRaw === "string" ? JSON.parse(cachedLpRaw) : cachedLpRaw as typeof lpConfig } catch {}
        } else if (branchId) {
          const { data: branch } = await adminSupabase
            .from("branches")
            .select("lp_enabled, lp_amount_baccarat, lp_amount_race, lp_multiplier_baccarat, lp_multiplier_race")
            .eq("id", branchId).single()
          if (branch) {
            lpConfig = branchToLpConfig(branch)
            await redis.set(lpCacheKey, JSON.stringify(lpConfig), { ex: 300 })
          }
        }

        // odds 재계산
        const poolDataAfter = await redis.hgetall(poolKey).catch(() => null)
        const toInt = (v: unknown) => parseInt((v as string) ?? "0") || 0
        let oddsSnap: Record<string, number> = {}
        if (gameType === "baccarat") {
          const pool = { player: toInt(poolDataAfter?.player), banker: toInt(poolDataAfter?.banker), tie: toInt(poolDataAfter?.tie) }
          const userCount = Number(await redis.scard(userSetKey).catch(() => 0))
          const r = calcBaccaratOdds(pool, lpConfig, userCount)
          oddsSnap = { player: r.playerOdds ?? 1.95, banker: r.bankerOdds ?? 1.95, tie: r.tieOdds ?? 1.95 }
        } else {
          const pool = { bit: toInt(poolDataAfter?.bit), coin: toInt(poolDataAfter?.coin), tie: toInt(poolDataAfter?.tie) }
          const userCount = Number(await redis.scard(userSetKey).catch(() => 0))
          const r = calcRaceOdds(pool, lpConfig, userCount)
          oddsSnap = { bit: r.bitOdds ?? 1.95, coin: r.coinOdds ?? 1.95, tie: r.tieOdds ?? 1.95 }
        }

        await Promise.all([
          redis.set(`odds:snap:${gameType}:${roundNumber}:${userId}`, JSON.stringify(oddsSnap), { ex: ttl }),
          redis.set(`odds:final:${gameType}:${roundNumber}`, JSON.stringify(oddsSnap), { ex: ttl }),
          redis.incr(`odds_version:${gameType}`),
        ])
      } catch (bgErr) {
        console.error("[bet bg]", bgErr)
      }
    })()

    return NextResponse.json({ success: true, newBalance: finalBalance })
  } catch (error) {
    console.error("[v0] Bet API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
