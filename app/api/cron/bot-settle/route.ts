/**
 * /api/cron/bot-settle
 *
 * 자동배팅 봇 전용 정산 라우트.
 * 실제 유저는 클라이언트(baka-betting-game)에서 settle-me를 호출하지만,
 * 봇은 서버에서만 동작하므로 라운드 종료 직후 이 엔드포인트로 정산합니다.
 *
 * 승패 판정: 마감가 소수점 d1(뱅커), d2(플레이어) 직접 비교
 *   - 봇은 카드 UI가 없으므로 카드 합산 대신 소수점 끝자리 사용
 *   - 실제 게임 승패 기준과 다를 수 있으나 봇 통계용으로 충분
 *
 * POST body: { roundNumber: number, gameType: "baccarat"|"race", closePrice: number, basePrice: number }
 * 헤더: x-internal-secret: CRON_SECRET
 */

import { adminSupabase as admin } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds, DEFAULT_LP_CONFIG } from "@/lib/lp-system"

export const runtime = "nodejs"
export const maxDuration = 55

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const AUTO_BET_USERNAMES = Array.from({ length: 29 }, (_, i) => `사용자${i + 2}`)
const roundTo100 = (v: number) => Math.floor(v / 100) * 100

export async function POST(request: Request) {
  const secret = request.headers.get("x-internal-secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { roundNumber, gameType = "baccarat", closePrice, basePrice } = await request.json()
  if (typeof roundNumber !== "number" || typeof closePrice !== "number") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  // ── 승패 결과 계산 ─────────────────────────────────────────
  const effectiveBase: number = typeof basePrice === "number" ? basePrice : closePrice
  const decStr = closePrice.toFixed(2).split(".")[1] ?? "00"
  const d1     = parseInt(decStr[0] ?? "0")   // 소수점 첫째 자리 = 뱅커
  const d2     = parseInt(decStr[1] ?? "0")   // 소수점 둘째 자리 = 플레이어

  const wonDirection: "long" | "short" = closePrice >= effectiveBase ? "long" : "short"
  const wonDigit:     "under" | "over" = d2 <= 4 ? "under" : "over"
  const wonParity:    "odd"   | "even" = d2 % 2 === 0 ? "even" : "odd"
  // 봇은 카드 없으므로 소수점 끝자리로 승패 판정
  const baccaratResult: "player" | "banker" | "tie" =
    d1 === d2 ? "tie" : d1 > d2 ? "banker" : "player"

  // race 승패
  let raceWinner: "bit" | "coin" | "tie" = "tie"
  if (gameType === "race") {
    const raceScoreKey = `race:score:${roundNumber}`
    const scoreData = await redis.hgetall(raceScoreKey).catch(() => null)
    const bitScore  = parseInt((scoreData?.bit  as string) ?? "0") || 0
    const coinScore = parseInt((scoreData?.coin as string) ?? "0") || 0
    raceWinner = bitScore > coinScore ? "bit" : coinScore > bitScore ? "coin" : "tie"
  }

  // ── 중복 정산 방어: 이미 이 라운드를 정산했으면 skip ──────────
  const settleKey = `bot:settled:${gameType}:${roundNumber}`
  const alreadySettled = await redis.get(settleKey)
  if (alreadySettled) {
    return NextResponse.json({ ok: true, skipped: true, reason: "already settled" })
  }
  // 정산 잠금 (120초 TTL — 다음 라운드 종료 전에 만료)
  await redis.set(settleKey, 1, { ex: 120 })

  // ── 봇 유저 조회 ───────────────────────────────────────────
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, username, branch_id")
    .in("username", AUTO_BET_USERNAMES)

  if (!profiles || profiles.length === 0) {
    return NextResponse.json({ settled: 0 })
  }

  // 게임 타입별 필터
  const targetProfiles = profiles.filter(p => {
    const num = parseInt(p.username.replace("사용자", ""))
    return gameType === "baccarat" ? num % 2 !== 0 : num % 2 === 0
  })

  // ── 풀 배당 계산 ───────────────────────────────────────────
  const poolKey  = `pool:${gameType}:${roundNumber}`
  const [poolData, userCount] = await Promise.all([
    redis.hgetall(poolKey).catch(() => null),
    redis.scard(`users:${gameType}:${roundNumber}`).catch(() => 0),
  ])
  const safeCount = (userCount as number) ?? 0

  let oddsSnap: Record<string, number> = {}
  if (gameType === "baccarat") {
    const pool = {
      player: parseInt((poolData?.player as string) ?? "0") || 0,
      banker: parseInt((poolData?.banker as string) ?? "0") || 0,
      tie:    parseInt((poolData?.tie    as string) ?? "0") || 0,
    }
    if (pool.player + pool.banker + pool.tie > 0) {
      const r = calcBaccaratOdds(pool, DEFAULT_LP_CONFIG, safeCount)
      oddsSnap = { player: r.playerOdds, banker: r.bankerOdds, tie: r.tieOdds }
    }
  } else {
    const pool = {
      bit:  parseInt((poolData?.bit  as string) ?? "0") || 0,
      coin: parseInt((poolData?.coin as string) ?? "0") || 0,
      tie:  parseInt((poolData?.tie  as string) ?? "0") || 0,
    }
    if (pool.bit + pool.coin + pool.tie > 0) {
      const r = calcRaceOdds(pool, DEFAULT_LP_CONFIG, safeCount)
      oddsSnap = { bit: r.bitOdds, coin: r.coinOdds, tie: r.tieOdds }
    }
  }

  // ── 유저별 정산 ────────────────────────────────────────────
  const FIXED_ODDS = 1.6
  let settledCount = 0
  const errors: string[] = []

  await Promise.all(targetProfiles.map(async (p) => {
    try {
      const betsKey = `bet:bets:${gameType}:${roundNumber}:${p.id}`
      const betsRaw = await redis.get<string>(betsKey)
      if (!betsRaw) return  // 이 라운드에 배팅 없음

      const bets = typeof betsRaw === "string" ? JSON.parse(betsRaw) : betsRaw
      const branchId = p.branch_id ?? null

      let totalPayout = 0
      const historyRows: Record<string, unknown>[] = []

      if (gameType === "baccarat") {
        // 방향 배팅
        if (bets.directionAmount > 0) {
          const won = bets.direction === wonDirection
          const payout = won ? roundTo100(bets.directionAmount * FIXED_ODDS) : 0
          totalPayout += payout
          historyRows.push({
            user_id: p.id, branch_id: branchId, round_id: null,
            bet_direction: bets.direction, bet_digit: null, bet_parity: null,
            bet_amount: bets.directionAmount, payout,
            result: won ? "win" : "lose",
          })
        }
        // 숫자 배팅
        if (bets.digitAmount > 0) {
          const won = bets.digit === wonDigit
          const payout = won ? roundTo100(bets.digitAmount * FIXED_ODDS) : 0
          totalPayout += payout
          historyRows.push({
            user_id: p.id, branch_id: branchId, round_id: null,
            bet_direction: null, bet_digit: bets.digit, bet_parity: null,
            bet_amount: bets.digitAmount, payout,
            result: won ? "win" : "lose",
          })
        }
        // 홀짝 배팅
        if (bets.parityAmount > 0) {
          const won = bets.parity === wonParity
          const payout = won ? roundTo100(bets.parityAmount * FIXED_ODDS) : 0
          totalPayout += payout
          historyRows.push({
            user_id: p.id, branch_id: branchId, round_id: null,
            bet_direction: null, bet_digit: null, bet_parity: bets.parity,
            bet_amount: bets.parityAmount, payout,
            result: won ? "win" : "lose",
          })
        }
        // 바카라 배팅
        if (bets.baccaratSide && bets.baccaratAmount > 0) {
          const side = bets.baccaratSide as "player" | "banker" | "tie"
          const won = side === baccaratResult
          const odds = oddsSnap[side] ?? FIXED_ODDS
          const payout = won ? roundTo100(bets.baccaratAmount * odds) : 0
          totalPayout += payout
          historyRows.push({
            user_id: p.id, branch_id: branchId, round_id: null,
            bet_direction: `baccarat_${side}`, bet_digit: null, bet_parity: null,
            bet_amount: bets.baccaratAmount, payout,
            result: won ? "win" : "lose",
          })
        }
      } else {
        // race 배팅
        if (bets.raceSide && bets.raceAmount > 0) {
          const side = bets.raceSide as "bit" | "coin" | "tie"
          const won = side === raceWinner
          const odds = oddsSnap[side] ?? FIXED_ODDS
          const payout = won ? roundTo100(bets.raceAmount * odds) : 0
          totalPayout += payout
          historyRows.push({
            user_id: p.id, branch_id: branchId, round_id: null,
            bet_direction: `race_${side}`, bet_digit: null, bet_parity: null,
            bet_amount: bets.raceAmount, payout,
            result: won ? "win" : "lose",
          })
        }
      }

      if (historyRows.length === 0) return

      // bet_history INSERT
      await admin.from("bet_history").insert(historyRows).catch(() => {})

      // 잔고 업데이트
      if (totalPayout > 0) {
        await admin.rpc("add_balance_for_payout", { p_user_id: p.id, p_amount: totalPayout }).catch(() => {})
      }

      // Redis 배팅 키 삭제 (재정산 방지)
      await redis.del(betsKey).catch(() => {})

      settledCount++
    } catch (e) {
      errors.push(`${p.username}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }))

  return NextResponse.json({
    ok: true,
    gameType,
    roundNumber,
    closePrice,
    baccaratResult,
    settled: settledCount,
    errors: errors.length > 0 ? errors : undefined,
  })
}
