import { redis } from "@/lib/redis"
import { adminSupabase as admin } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds, branchToLpConfig, DEFAULT_LP_CONFIG } from "@/lib/lp-system"

})

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

    const body = await request.json()
    const { bets, roundNumber: clientRoundNumber } = body

    if (!bets || typeof bets !== "object") {
      return NextResponse.json({ error: "Invalid bets" }, { status: 400 })
    }

    // ── 마감가를 서버 DB에서 직접 조회 (클라이언트 신뢰 제거) ──
    // btc_closing_prices 스키마: id, time(30초 버킷), price
    // basePrice = 라운드 시작 버킷(targetRound - 1)의 price
    // closePrice = 라운드 종료 버킷(targetRound)의 price
    const targetRound = typeof clientRoundNumber === "number"
      ? clientRoundNumber
      : Math.floor(Date.now() / 1000 / 30) - 1

    const { data: priceRows } = await admin
      .from("btc_closing_prices")
      .select("price, time")
      .in("time", [targetRound, targetRound - 1])
      .order("time", { ascending: false })

    if (!priceRows || priceRows.length < 1) {
      return NextResponse.json({ error: "Closing price not available yet. Retry in a moment." }, { status: 404 })
    }

    const parsePrice = (v: unknown) => typeof v === "string" ? parseFloat(v) : (v as number)

    // time이 더 큰 것이 closePrice, 작은 것이 basePrice
    const closeRow = priceRows[0]
    const baseRow  = priceRows[1] ?? priceRows[0]

    const closePrice = parsePrice(closeRow.price)
    const basePrice  = parsePrice(baseRow.price)

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

    // LP 설정 조회 — 배율 포함 전체 조회
    let lpConfig = { ...DEFAULT_LP_CONFIG }
    if (branchId) {
      const { data: branch } = await admin
        .from("branches")
        .select("lp_enabled, lp_amount_baccarat, lp_amount_race, lp_multiplier_baccarat, lp_multiplier_race")
        .eq("id", branchId)
        .single()
      if (branch) lpConfig = branchToLpConfig(branch)
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
      }
      // 타이 결과 시 player/banker는 LOSS — 반환 없음
      // 패배: baccaratPayout = 0 (배팅금은 bet API에서 이미 차감됨)

      totalPayout += baccaratPayout
    }

    // ── 잔고 지급 — atomic RPC (당첨 시에만, 패배는 bet API에서 이미 차감됨) ──
    let newBalance: number
    if (totalPayout > 0) {
      const { data: afterPayout, error: payoutError } = await admin
        .rpc("add_balance_for_payout", { p_user_id: user.id, p_amount: totalPayout })
      if (payoutError) {
        console.error("[game/play] add_balance_for_payout error:", payoutError)
        return NextResponse.json({ error: "Payout failed" }, { status: 500 })
      }
      newBalance = afterPayout as number
      await admin.from("balance_transactions").insert({
        user_id: user.id,
        branch_id: branchId,
        type: "win",
        amount: totalPayout,
        balance_before: newBalance - totalPayout,
        balance_after: newBalance,
        note: `게임 당첨 (LP 배당 ${baccaratOdds.mode})`,
      })
    } else {
      // 패배: DB에서 현재 잔고를 읽어 Redis 동기화
      const { data: balanceData } = await admin
        .from("balances").select("amount").eq("user_id", user.id).single()
      newBalance = balanceData?.amount ?? 0
    }

    // 항상 Redis 잔고 갱신 + SSE 트리거
    await Promise.all([
      redis.set(`balance:${user.id}`, newBalance, { ex: 3600 }),
      redis.incr(`balance_version:${user.id}`),
    ])

    // ── house_stats 업데이��� (atomic upsert RPC — 레이스 컨디션 없음) ──
    if (branchId && totalUserBet > 0) {
      const fee = Math.floor(totalUserBet * 0.2)
      const lpUsed = baccaratOdds.totalPool - baccaratPool.player - baccaratPool.banker - baccaratPool.tie
      await admin.rpc("upsert_house_stats", {
        p_branch_id: branchId,
        p_game_type: "baccarat",
        p_bet:       totalUserBet,
        p_payout:    totalPayout,
        p_fee:       fee,
        p_lp_used:   Math.max(0, lpUsed),
      })
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
      betHistoryRows.push({
        user_id: user.id, branch_id: branchId, round_id: roundId,
        bet_direction: `baccarat_${bets.baccaratSide}`, bet_digit: null, bet_parity: null,
        bet_amount: bets.baccaratAmount,
        payout: baccaratPayout,
        result: won ? "win" : "lose",
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
