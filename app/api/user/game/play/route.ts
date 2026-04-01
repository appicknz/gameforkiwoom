import { adminSupabase as admin } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds } from "@/lib/lp-system"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

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

    // ── 서버에서 직접 승패 계산 ─────────────────────────────
    const wonDirection = closePrice >= basePrice ? "long" : "short"
    const lastDigit = Math.floor(Math.abs(closePrice * 10)) % 10
    const wonDigit = lastDigit <= 4 ? "under" : "over"
    const wonParity = lastDigit % 2 === 0 ? "even" : "odd"
    const baccaratResult: "player" | "banker" | "tie" =
      lastDigit <= 4 ? "player" : lastDigit <= 8 ? "banker" : "tie"

    // ── 유저 profile + 지점 설정 조회 ──────────────────────
    const { data: profileData } = await admin
      .from("profiles")
      .select("branch_id")
      .eq("id", user.id)
      .single()
    const branchId = profileData?.branch_id ?? null

    // LP 설정 조회 — betting_mode는 사용하지 않음, LP는 항상 적용
    let lpConfig = { enabled: true, lpAmountBaccarat: 50000, lpAmountRace: 50000 }
    if (branchId) {
      const { data: branch } = await admin
        .from("branches")
        .select("lp_enabled, lp_amount_baccarat, lp_amount_race")
        .eq("id", branchId)
        .single()
      if (branch) {
        lpConfig = {
          enabled: branch.lp_enabled ?? true,
          lpAmountBaccarat: branch.lp_amount_baccarat ?? 50000,
          lpAmountRace: branch.lp_amount_race ?? 50000,
        }
      }
    }

    // ── 현재 라운드 배팅 풀 조회 (LP 배당 계산용) ──────────
    const roundNumber = Math.floor(Date.now() / 1000 / 30)
    const poolKey = `pool:baccarat:${roundNumber}`
    const userSetKey = `users:baccarat:${roundNumber}`
    const [poolData, userIds] = await Promise.all([
      redis.hgetall(poolKey).catch(() => null),
      redis.scard(userSetKey).catch(() => 0),
    ])

    const userCount = (userIds as number) ?? 1
    const baccaratPool = {
      player: parseInt((poolData?.player as string) ?? "0") || 0,
      banker: parseInt((poolData?.banker as string) ?? "0") || 0,
      tie:    parseInt((poolData?.tie    as string) ?? "0") || 0,
    }

    // LP 배당률 계산 — 유저 수에 관계없이 항상 LP가 받쳐줌
    const baccaratOdds = calcBaccaratOdds(baccaratPool, lpConfig, userCount)

    // ── 수익 계산 ────────────────────────────────────────────
    // 방향/숫자/홀짝은 고정 1.6배 (수수료 20% 적용)
    const FIXED_ODDS = 1.6
    let totalPayout = 0
    let totalUserBet = 0

    if (bets.direction && bets.directionAmount > 0) {
      totalUserBet += bets.directionAmount
      if (bets.direction === wonDirection) {
        totalPayout += Math.floor(bets.directionAmount * FIXED_ODDS)
      }
    }
    if (bets.digit && bets.digitAmount > 0) {
      totalUserBet += bets.digitAmount
      if (bets.digit === wonDigit) {
        totalPayout += Math.floor(bets.digitAmount * FIXED_ODDS)
      }
    }
    if (bets.parity && bets.parityAmount > 0) {
      totalUserBet += bets.parityAmount
      if (bets.parity === wonParity) {
        totalPayout += Math.floor(bets.parityAmount * FIXED_ODDS)
      }
    }

    // 바카라 — LP 시스템 배당 적용 (수수료 20% 포함)
    let baccaratPayout = 0
    if (bets.baccaratSide && bets.baccaratAmount > 0) {
      totalUserBet += bets.baccaratAmount
      const side = bets.baccaratSide as "player" | "banker" | "tie"

      if (side === baccaratResult) {
        // 승리: LP 기반 배당 적용
        const odds =
          side === "player" ? baccaratOdds.playerOdds
          : side === "banker" ? baccaratOdds.bankerOdds
          : baccaratOdds.tieOdds
        baccaratPayout = Math.floor(bets.baccaratAmount * odds)
      } else if (baccaratResult === "tie" && (side === "player" || side === "banker")) {
        // 타이 결과 시 원금 반환
        baccaratPayout = bets.baccaratAmount
      }
      // 패배: baccaratPayout = 0 (배팅금은 bet API에서 이미 차감됨)

      totalPayout += baccaratPayout
    }

    // ── 현재 잔고 조회 ───────────────────────────────────────
    const cachedBalance = await redis.get<number>(`balance:${user.id}`)
    let currentBalance: number
    if (cachedBalance !== null) {
      currentBalance = cachedBalance
    } else {
      const { data: balanceData } = await admin
        .from("balances")
        .select("amount")
        .eq("user_id", user.id)
        .single()
      currentBalance = balanceData?.amount ?? 0
    }

    // ── 잔고 지급 (당첨 시에만 지급, 패배는 이미 bet API에서 차감) ──
    const newBalance = currentBalance + totalPayout
    if (totalPayout > 0) {
      await admin.from("balances").update({ amount: newBalance }).eq("user_id", user.id)
      await admin.from("balance_transactions").insert({
        user_id: user.id,
        branch_id: branchId,
        type: "win",
        amount: totalPayout,
        balance_before: currentBalance,
        balance_after: newBalance,
        note: `게임 당첨 (LP 배당 ${baccaratOdds.mode})`,
      })
    }

    // 항상 Redis 잔고 갱신 + SSE 트리거 (당첨/패배 무관)
    await Promise.all([
      redis.set(`balance:${user.id}`, newBalance, { ex: 3600 }),
      redis.incr(`balance_version:${user.id}`),
    ])

    // ── house_stats 업데이트 ─────────────────────────────────
    if (branchId && totalUserBet > 0) {
      const fee = Math.floor(totalUserBet * 0.2)
      const { data: existing } = await admin
        .from("house_stats")
        .select("id, total_bet, total_payout, total_fee")
        .eq("branch_id", branchId)
        .eq("game_type", "baccarat")
        .single()

      if (existing) {
        await admin.from("house_stats").update({
          total_bet: (existing.total_bet ?? 0) + totalUserBet,
          total_payout: (existing.total_payout ?? 0) + totalPayout,
          total_fee: (existing.total_fee ?? 0) + fee,
          updated_at: new Date().toISOString(),
        }).eq("id", existing.id)
      } else {
        await admin.from("house_stats").insert({
          branch_id: branchId,
          game_type: "baccarat",
          total_bet: totalUserBet,
          total_payout: totalPayout,
          total_fee: fee,
          total_lp_used: 0,
          total_collected: 0,
        })
      }
    }

    // ── rounds 테이블 기록 ────────────────────────────────────
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

    // ── bet_history INSERT ────────────────────────────────────
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
        payout: won ? Math.floor(bets.directionAmount * FIXED_ODDS) : 0,
        result: won ? "win" : "lose",
      })
    }
    if (bets.digit && bets.digitAmount > 0) {
      const won = bets.digit === wonDigit
      betHistoryRows.push({
        user_id: user.id, branch_id: branchId, round_id: roundId,
        bet_direction: null, bet_digit: bets.digit, bet_parity: null,
        bet_amount: bets.digitAmount,
        payout: won ? Math.floor(bets.digitAmount * FIXED_ODDS) : 0,
        result: won ? "win" : "lose",
      })
    }
    if (bets.parity && bets.parityAmount > 0) {
      const won = bets.parity === wonParity
      betHistoryRows.push({
        user_id: user.id, branch_id: branchId, round_id: roundId,
        bet_direction: null, bet_digit: null, bet_parity: bets.parity,
        bet_amount: bets.parityAmount,
        payout: won ? Math.floor(bets.parityAmount * FIXED_ODDS) : 0,
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

    return NextResponse.json({
      success: true,
      wonDirection,
      wonDigit,
      wonParity,
      baccaratResult,
      totalPayout,
      newBalance,
      baccaratOddsApplied: {
        player: baccaratOdds.playerOdds,
        banker: baccaratOdds.bankerOdds,
        tie: baccaratOdds.tieOdds,
        mode: baccaratOdds.mode,
      },
    })
  } catch (err) {
    console.error("[game/play] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
