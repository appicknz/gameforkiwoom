import { adminSupabase as admin } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds, calcLpUsed } from "@/lib/lp-system"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const FIXED_PAYOUT_RATIO = 1.95 // 고정 배당 모드

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

    const body = await request.json()
    const { basePrice, closePrice, bets } = body

    if (typeof basePrice !== "number" || typeof closePrice !== "number") {
      return NextResponse.json({ error: "Invalid price data" }, { status: 400 })
    }
    if (!bets || typeof bets !== "object") {
      return NextResponse.json({ error: "Invalid bets" }, { status: 400 })
    }

    // ── 서버에서 직접 승패 계산 ────────────────────────────
    const wonDirection = closePrice >= basePrice ? "long" : "short"
    const lastDigit = Math.floor(Math.abs(closePrice * 10)) % 10
    const wonDigit = lastDigit <= 4 ? "under" : "over"
    const wonParity = lastDigit % 2 === 0 ? "even" : "odd"
    const baccaratResult: "player" | "banker" | "tie" =
      lastDigit <= 4 ? "player" : lastDigit <= 8 ? "banker" : "tie"

    // ── 유저 profile + 지점 설정 조회 ─────────────────────
    const { data: profileData } = await admin
      .from("profiles")
      .select("branch_id")
      .eq("id", user.id)
      .single()
    const branchId = profileData?.branch_id ?? null

    // 지점 배팅 모드 + LP 설정 조회
    let bettingMode: "fixed" | "pari" = "fixed"
    let lpConfig = { enabled: false, lpAmountBaccarat: 50000, lpAmountRace: 50000 }
    if (branchId) {
      const { data: branch } = await admin
        .from("branches")
        .select("betting_mode, lp_enabled, lp_amount_baccarat, lp_amount_race")
        .eq("id", branchId)
        .single()
      if (branch) {
        bettingMode = branch.betting_mode ?? "fixed"
        lpConfig = {
          enabled: branch.lp_enabled ?? false,
          lpAmountBaccarat: branch.lp_amount_baccarat ?? 50000,
          lpAmountRace: branch.lp_amount_race ?? 50000,
        }
      }
    }

    // ── 파리뮤추얼 모드: Redis에서 현재 라운드 풀 조회 ─────
    const roundNumber = Math.floor(Date.now() / 1000 / 30)
    let baccaratOdds = { playerOdds: FIXED_PAYOUT_RATIO, bankerOdds: FIXED_PAYOUT_RATIO * 0.95, tieOdds: 9.0 }
    let userCount = 1

    if (bettingMode === "pari" && bets.baccaratSide && bets.baccaratAmount > 0) {
      const poolKey = `pool:baccarat:${roundNumber}`
      const userSetKey = `users:baccarat:${roundNumber}`
      const [poolData, userIds] = await Promise.all([
        redis.hgetall(poolKey).catch(() => null),
        redis.smembers(userSetKey).catch(() => []),
      ])
      const pool = {
        player: parseInt((poolData?.player as string) ?? "0") || 0,
        banker: parseInt((poolData?.banker as string) ?? "0") || 0,
        tie: parseInt((poolData?.tie as string) ?? "0") || 0,
      }
      userCount = Array.isArray(userIds) ? userIds.length : 1
      const result = calcBaccaratOdds(pool, lpConfig, userCount)
      baccaratOdds = {
        playerOdds: result.playerOdds,
        bankerOdds: result.bankerOdds,
        tieOdds: result.tieOdds,
      }
    }

    // ── 수익 계산 ──────────────────────────────────────────
    let totalPayout = 0
    let totalUserBet = 0

    if (bets.direction && bets.directionAmount > 0) {
      totalUserBet += bets.directionAmount
      if (bets.direction === wonDirection) {
        totalPayout += Math.floor(bets.directionAmount * FIXED_PAYOUT_RATIO)
      }
    }
    if (bets.digit && bets.digitAmount > 0) {
      totalUserBet += bets.digitAmount
      if (bets.digit === wonDigit) {
        totalPayout += Math.floor(bets.digitAmount * FIXED_PAYOUT_RATIO)
      }
    }
    if (bets.parity && bets.parityAmount > 0) {
      totalUserBet += bets.parityAmount
      if (bets.parity === wonParity) {
        totalPayout += Math.floor(bets.parityAmount * FIXED_PAYOUT_RATIO)
      }
    }

    // 바카라 정산 (파리뮤추얼 or 고정)
    let baccaratPayout = 0
    if (bets.baccaratSide && bets.baccaratAmount > 0) {
      totalUserBet += bets.baccaratAmount
      const side = bets.baccaratSide as "player" | "banker" | "tie"
      const won = side === baccaratResult
      const isTie = baccaratResult === "tie"

      if (won) {
        if (bettingMode === "pari") {
          // 파리뮤추얼: 실시간 배당 적용
          const odds = side === "player" ? baccaratOdds.playerOdds
                     : side === "banker" ? baccaratOdds.bankerOdds
                     : baccaratOdds.tieOdds
          baccaratPayout = Math.floor(bets.baccaratAmount * odds)
        } else {
          // 고정 배당
          if (side === "player") baccaratPayout = Math.floor(bets.baccaratAmount * 2)
          else if (side === "banker") baccaratPayout = Math.floor(bets.baccaratAmount * 1.95)
          else if (side === "tie") baccaratPayout = Math.floor(bets.baccaratAmount * 9)
        }
      } else if (isTie && (side === "player" || side === "banker")) {
        // 타이 결과 시 원금 반환
        baccaratPayout = bets.baccaratAmount
      }
      totalPayout += baccaratPayout
    }

    // ── LP 투입액 계산 (라운드별 기록용) ─────────────────
    const lpUsed = bettingMode === "pari"
      ? calcLpUsed(
          { player: 0, banker: 0, tie: 0 },
          lpConfig,
          userCount
        )
      : 0

    // ── house_stats 업데이트 (지점별 누적) ───────────────
    if (branchId && totalUserBet > 0) {
      const fee = bettingMode === "pari" ? Math.floor(totalUserBet * 0.2) : 0
      // UPSERT: 없으면 insert, 있으면 increment
      const { data: existing } = await admin
        .from("house_stats")
        .select("id, total_bet, total_payout, total_lp_used, total_fee")
        .eq("branch_id", branchId)
        .eq("game_type", "baccarat")
        .single()

      if (existing) {
        await admin.from("house_stats").update({
          total_bet: (existing.total_bet ?? 0) + totalUserBet,
          total_payout: (existing.total_payout ?? 0) + totalPayout,
          total_lp_used: (existing.total_lp_used ?? 0) + lpUsed,
          total_fee: (existing.total_fee ?? 0) + fee,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id)
      } else {
        await admin.from("house_stats").insert({
          branch_id: branchId,
          game_type: "baccarat",
          total_bet: totalUserBet,
          total_payout: totalPayout,
          total_lp_used: lpUsed,
          total_fee: fee,
          total_collected: 0,
        })
      }
    }

    // ── rounds 테이블 기록 ────────────────────────────────
    const { data: roundData } = await admin
      .from("rounds")
      .insert({
        base_price: basePrice,
        result_price: closePrice,
        result_digit: lastDigit,
        baccarat_result: baccaratResult,
        started_at: new Date(roundNumber * 30 * 1000 - 30000).toISOString(),
        ended_at: new Date(roundNumber * 30 * 1000).toISOString(),
      })
      .select("id")
      .single()

    const roundId = roundData?.id ?? null

    // ── bet_history INSERT ────────────────────────────────
    const betHistoryRows: {
      user_id: string; branch_id: string | null; round_id: string | null
      bet_direction: string | null; bet_digit: string | null; bet_parity: string | null
      bet_amount: number; payout: number; result: string
    }[] = []

    if (bets.direction && bets.directionAmount > 0) {
      const won = bets.direction === wonDirection
      betHistoryRows.push({
        user_id: user.id, branch_id: branchId, round_id: roundId,
        bet_direction: bets.direction, bet_digit: null, bet_parity: null,
        bet_amount: bets.directionAmount,
        payout: won ? Math.floor(bets.directionAmount * FIXED_PAYOUT_RATIO) : 0,
        result: won ? "win" : "lose",
      })
    }
    if (bets.digit && bets.digitAmount > 0) {
      const won = bets.digit === wonDigit
      betHistoryRows.push({
        user_id: user.id, branch_id: branchId, round_id: roundId,
        bet_direction: null, bet_digit: bets.digit, bet_parity: null,
        bet_amount: bets.digitAmount,
        payout: won ? Math.floor(bets.digitAmount * FIXED_PAYOUT_RATIO) : 0,
        result: won ? "win" : "lose",
      })
    }
    if (bets.parity && bets.parityAmount > 0) {
      const won = bets.parity === wonParity
      betHistoryRows.push({
        user_id: user.id, branch_id: branchId, round_id: roundId,
        bet_direction: null, bet_digit: null, bet_parity: bets.parity,
        bet_amount: bets.parityAmount,
        payout: won ? Math.floor(bets.parityAmount * FIXED_PAYOUT_RATIO) : 0,
        result: won ? "win" : "lose",
      })
    }
    if (bets.baccaratSide && bets.baccaratAmount > 0) {
      const won = bets.baccaratSide === baccaratResult
      const isTie = baccaratResult === "tie"
      const refund = isTie && (bets.baccaratSide === "player" || bets.baccaratSide === "banker")
      betHistoryRows.push({
        user_id: user.id, branch_id: branchId, round_id: roundId,
        bet_direction: `baccarat_${bets.baccaratSide}`, bet_digit: null, bet_parity: null,
        bet_amount: bets.baccaratAmount,
        payout: baccaratPayout,
        result: won ? "win" : refund ? "tie" : "lose",
      })
    }

    if (betHistoryRows.length > 0) {
      await admin.from("bet_history").insert(betHistoryRows)
    }

    // ── 잔고 지급 (당첨 시) ──────────────────────────────
    let newBalance: number | null = null
    if (totalPayout > 0) {
      const { data: balanceData } = await admin
        .from("balances")
        .select("amount")
        .eq("user_id", user.id)
        .single()

      const currentBalance = balanceData?.amount ?? 0
      newBalance = currentBalance + totalPayout

      await admin.from("balances").update({ amount: newBalance }).eq("user_id", user.id)

      await admin.from("balance_transactions").insert({
        user_id: user.id, branch_id: branchId, type: "win",
        amount: totalPayout, balance_before: currentBalance, balance_after: newBalance,
        note: `게임 당첨 (${bettingMode === "pari" ? "파리뮤추얼" : "고정"})`,
      })

      await Promise.all([
        redis.set(`balance:${user.id}`, newBalance, { ex: 3600 }),
        redis.incr(`balance_version:${user.id}`),
      ])
    }

    return NextResponse.json({
      success: true, wonDirection, wonDigit, wonParity,
      totalPayout, newBalance, bettingMode,
      baccaratOddsApplied: bettingMode === "pari" ? baccaratOdds : null,
    })
  } catch (err) {
    console.error("[game/play] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
