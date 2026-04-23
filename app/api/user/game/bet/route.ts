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

    // 토큰 검증 먼저 — 인증 실패는 구간 체크보다 우선
    const authResult = await verifySession(request)
    if (!authResult.ok) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status })
    }
    const userId = authResult.userId

    // ── 배팅 구간 서버 검증 ────────────────────────────────────
    // baccarat: 0~4초=정산, 5~19초=배팅, 20~29초=게임중
    // race:     0~9초=정산, 10~59초=배팅, 60~179초=게임중
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

    // atomic RPC로 잔고 차감 — SELECT→UPDATE 레이스 컨디션 완전 제거
    const { data: newBalance, error: deductError } = await supabase
      .rpc("deduct_balance_for_bet", { p_user_id: userId, p_amount: betAmount })

    if (deductError) {
      const isInsufficient = deductError.message?.includes("INSUFFICIENT_BALANCE")
      console.error("[v0] deduct_balance_for_bet error:", deductError.message, deductError.code, "userId:", userId, "betAmount:", betAmount)
      return NextResponse.json(
        { error: isInsufficient ? "Insufficient balance" : "Failed to update balance" },
        { status: isInsufficient ? 400 : 500 }
      )
    }
    console.log("[v0] deduct ok, newBalance:", newBalance, "userId:", userId)

    // ── 응답에 필요한 최소한만 동기 처리, 나머지는 fire-and-forget ──

    const rNowSec = Math.floor(Date.now() / 1000)
    const roundNumber = type === "race"
      ? Math.floor(rNowSec / 180)
      : Math.floor(rNowSec / 30)
    const ttl = 3600
    const lpCacheKey = `lp:config:user:${userId}`
    const poolKey    = gameType && side ? `pool:${gameType}:${roundNumber}` : null
    const betsKey    = gameType && side ? `bet:bets:${gameType}:${roundNumber}:${userId}` : null

    // ── 1차: 응답에 꼭 필요한 것만 병렬 처리 (잔고 Redis 저장 + bets 읽기) ──
    const parallelReads: Promise<unknown>[] = [
      redis.set(`balance:${userId}`, newBalance as number, { ex: 3600 }),
      redis.incr(`balance_version:${userId}`),
    ]
    if (betsKey) parallelReads.push(redis.get<string>(betsKey))
    if (poolKey && side) parallelReads.push(redis.hincrby(poolKey, side, betAmount))

    let parallelResults: unknown[]
    try {
      parallelResults = await Promise.all(parallelReads)
    } catch (redisErr) {
      console.error("[v0] Redis parallel error:", redisErr)
      // Redis 실패해도 배팅은 성공 — 잔고는 이미 차감됨
      return NextResponse.json({ success: true, newBalance })
    }
    const existingBets = betsKey ? parallelResults[2] : null

    // ── 즉시 응답 반환 ────────────────────────────────────────
    // 나머지(pool집계/odds계산/balance_transactions/LP캐시)는 fire-and-forget
    const response = NextResponse.json({ success: true, newBalance })

    // ── 2차: 백그라운드 처리 (응답 후 실행, 지연 무관) ────────────────
    ;(async () => {
      try {
        // profile + LP 캐시 병렬 조회
        const [{ data: profileData }, cachedLpRaw] = await Promise.all([
          adminSupabase.from("profiles").select("branch_id").eq("id", userId).single(),
          redis.get<string>(lpCacheKey),
        ])
        const branchId: string | null = profileData?.branch_id ?? null

        // LP 설정
        let lpConfig = { ...DEFAULT_LP_CONFIG }
        if (cachedLpRaw) {
          try { lpConfig = typeof cachedLpRaw === "string" ? JSON.parse(cachedLpRaw) : cachedLpRaw } catch {}
        } else if (branchId) {
          const { data: branch } = await adminSupabase
            .from("branches")
            .select("lp_enabled, lp_amount_baccarat, lp_amount_race, lp_multiplier_baccarat, lp_multiplier_race")
            .eq("id", branchId).single()
          if (branch) {
            lpConfig = branchToLpConfig(branch)
            await redis.set(lpCacheKey, JSON.stringify(lpConfig), { ex: 300 }) // 5분 캐시
          }
        }

        // balance_transactions 기록
        const balBefore = (newBalance as number) + betAmount
        await adminSupabase.from("balance_transactions").insert({
          user_id: userId, branch_id: branchId, type: "bet",
          amount: -betAmount, balance_before: balBefore,
          balance_after: newBalance, note: "배팅 차감",
        })

        if (gameType && side && poolKey && betsKey) {
          const userSetKey  = `users:${gameType}:${roundNumber}`
          const userRoundKey = `bet:round:${gameType}:${userId}`
          const oddsSnapKey  = `odds:snap:${gameType}:${roundNumber}:${userId}`
          const finalOddsKey = `odds:final:${gameType}:${roundNumber}`

          // bets merge
          const prev = existingBets ? (typeof existingBets === "string" ? JSON.parse(existingBets as string) : existingBets) : {}
          const merged: Record<string, unknown> = betsPayload ? { ...prev, ...betsPayload } : { ...prev }
          if (gameType === "baccarat" && !merged.baccaratSide) {
            merged.baccaratSide = side; if (!merged.baccaratAmount) merged.baccaratAmount = betAmount
          }
          if (gameType === "race" && !merged.raceSide) {
            merged.raceSide = side; if (!merged.raceAmount) merged.raceAmount = betAmount
          }

          // pool 집계 + bets 저장 병렬
          const [poolDataAfter] = await Promise.all([
            redis.hgetall(poolKey),
            redis.sadd(userSetKey, userId),
            redis.set(betsKey, JSON.stringify(merged), { ex: ttl }),
            redis.set(userRoundKey, roundNumber, { ex: ttl }),
            redis.expire(poolKey, ttl),
            redis.expire(userSetKey, ttl),
          ])

          // odds 재계산 후 저장
          let oddsSnap: Record<string, number> = {}
          if (gameType === "baccarat") {
            const pool = {
              player: parseInt((poolDataAfter?.player as string) ?? "0") || 0,
              banker: parseInt((poolDataAfter?.banker as string) ?? "0") || 0,
              tie:    parseInt((poolDataAfter?.tie    as string) ?? "0") || 0,
            }
            const userCount = await redis.scard(userSetKey).catch(() => 0)
            const r = calcBaccaratOdds(pool, lpConfig, userCount as number)
            oddsSnap = { player: r.playerOdds ?? 1.95, banker: r.bankerOdds ?? 1.95, tie: r.tieOdds ?? 1.95 }
          } else {
            const pool = {
              bit:  parseInt((poolDataAfter?.bit  as string) ?? "0") || 0,
              coin: parseInt((poolDataAfter?.coin as string) ?? "0") || 0,
              tie:  parseInt((poolDataAfter?.tie  as string) ?? "0") || 0,
            }
            const userCount = await redis.scard(userSetKey).catch(() => 0)
            const r = calcRaceOdds(pool, lpConfig, userCount as number)
            oddsSnap = { bit: r.bitOdds ?? 1.95, coin: r.coinOdds ?? 1.95, tie: r.tieOdds ?? 1.95 }
          }

          await Promise.all([
            redis.set(oddsSnapKey, JSON.stringify(oddsSnap), { ex: ttl }),
            redis.set(finalOddsKey, JSON.stringify(oddsSnap), { ex: ttl }),
            redis.incr(`odds_version:${gameType}`),
          ])
        }
      } catch (bgErr) {
        console.error("[v0] Bet background processing error:", bgErr)
      }
    })()

    return response
  } catch (error) {
    console.error("[v0] Bet API 500 error:", error, (error as Error)?.message, (error as Error)?.stack?.split("\n")[1])
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
