import { adminSupabase as admin } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const PAYOUT_RATIO = 1.95 // 배당률 (서버에서만 정의)

/**
 * 게임 정산 API - 서버에서 승패와 수익을 직접 계산 (위변조 방지)
 * 클라이언트가 보낸 profit 값을 절대 신뢰하지 않음
 *
 * Request body:
 *   basePrice: number       - 배팅 기준가
 *   closePrice: number      - 라운드 종료가
 *   bets: {
 *     direction?: "long" | "short"   - 배팅한 방향
 *     directionAmount?: number
 *     digit?: "over" | "under"       - 배팅한 자릿수
 *     digitAmount?: number
 *     parity?: "odd" | "even"        - 배팅한 홀짝
 *     parityAmount?: number
 *   }
 */
export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: { user }, error: authError } = await admin.auth.getUser(token)
    if (authError || !user) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

    const body = await request.json()
    const { basePrice, closePrice, bets } = body

    // 입력값 검증
    if (typeof basePrice !== "number" || typeof closePrice !== "number") {
      return NextResponse.json({ error: "Invalid price data" }, { status: 400 })
    }
    if (!bets || typeof bets !== "object") {
      return NextResponse.json({ error: "Invalid bets" }, { status: 400 })
    }

    // ── 서버에서 직접 승패 계산 ──────────────────────────────
    // 1) 롱/숏: 종료가 >= 기준가 → 롱 승
    const wonDirection = closePrice >= basePrice ? "long" : "short"

    // 2) 언더/오버: 종료가 소수점 첫째 자리 (0~4 언더, 5~9 오버)
    const lastDigit = Math.floor(Math.abs(closePrice * 10)) % 10
    const wonDigit = lastDigit <= 4 ? "under" : "over"

    // 3) 홀/짝: 같은 자릿수 기준
    const wonParity = lastDigit % 2 === 0 ? "even" : "odd"

    // 4) 바카라: 끝자리로 서버에서 결정적으로 계산 (모든 유저 동일)
    //    0~4 → player, 5~8 → banker, 9 → tie
    const baccaratResult: "player" | "banker" | "tie" =
      lastDigit <= 4 ? "player" : lastDigit <= 8 ? "banker" : "tie"

    // ── 수익 계산 (서버에서만) ───────────────────────────────
    let totalPayout = 0

    if (bets.direction && bets.directionAmount > 0) {
      if (bets.direction === wonDirection) {
        totalPayout += Math.floor(bets.directionAmount * PAYOUT_RATIO)
      }
    }

    if (bets.digit && bets.digitAmount > 0) {
      if (bets.digit === wonDigit) {
        totalPayout += Math.floor(bets.digitAmount * PAYOUT_RATIO)
      }
    }

    if (bets.parity && bets.parityAmount > 0) {
      if (bets.parity === wonParity) {
        totalPayout += Math.floor(bets.parityAmount * PAYOUT_RATIO)
      }
    }

    // 바카라 정산: baccaratSide = 유저가 배팅한 면, baccaratResult = 실제 결과
    if (bets.baccaratSide && bets.baccaratAmount > 0 && baccaratResult) {
      const side = bets.baccaratSide
      const wonBaccarat = side === baccaratResult
      const isTieResult = baccaratResult === "tie"
      // 타이 결과 시 player/banker 배팅은 반환 (패배 아님)
      if (wonBaccarat) {
        if (side === "player") totalPayout += Math.floor(bets.baccaratAmount * 2) // 1:1
        else if (side === "banker") totalPayout += Math.floor(bets.baccaratAmount * 1.95) // 5% 커미션
        else if (side === "tie") totalPayout += Math.floor(bets.baccaratAmount * 9) // 8:1 + 원금
      } else if (isTieResult && (side === "player" || side === "banker")) {
        // 타이 결과 시 원금 반환
        totalPayout += bets.baccaratAmount
      }
    }

    // ── 유저 profile (branch_id) 조회 ───────────────────────
    const { data: profileData } = await admin
      .from("profiles")
      .select("branch_id")
      .eq("id", user.id)
      .single()

    const branchId = profileData?.branch_id ?? null

    // ── rounds 테이블에 라운드 기록 ──────────────────────────
    const { data: roundData } = await admin
      .from("rounds")
      .insert({
        base_price: basePrice,
        result_price: closePrice,
        result_digit: lastDigit,
        baccarat_result: baccaratResult,
        started_at: new Date(Math.floor(Date.now() / 1000 / 30) * 30 * 1000 - 30000).toISOString(),
        ended_at: new Date(Math.floor(Date.now() / 1000 / 30) * 30 * 1000).toISOString(),
      })
      .select("id")
      .single()

    const roundId = roundData?.id ?? null

    // ── bet_history 각 종목별 INSERT ─────────────────────────
    const betHistoryRows: {
      user_id: string
      branch_id: string | null
      round_id: string | null
      bet_direction: string | null
      bet_digit: string | null
      bet_parity: string | null
      bet_amount: number
      payout: number
      result: string
    }[] = []

    if (bets.direction && bets.directionAmount > 0) {
      const won = bets.direction === wonDirection
      betHistoryRows.push({
        user_id: user.id,
        branch_id: branchId,
        round_id: roundId,
        bet_direction: bets.direction,
        bet_digit: null,
        bet_parity: null,
        bet_amount: bets.directionAmount,
        payout: won ? Math.floor(bets.directionAmount * PAYOUT_RATIO) : 0,
        result: won ? "win" : "lose",
      })
    }

    if (bets.digit && bets.digitAmount > 0) {
      const won = bets.digit === wonDigit
      betHistoryRows.push({
        user_id: user.id,
        branch_id: branchId,
        round_id: roundId,
        bet_direction: null,
        bet_digit: bets.digit,
        bet_parity: null,
        bet_amount: bets.digitAmount,
        payout: won ? Math.floor(bets.digitAmount * PAYOUT_RATIO) : 0,
        result: won ? "win" : "lose",
      })
    }

    if (bets.parity && bets.parityAmount > 0) {
      const won = bets.parity === wonParity
      betHistoryRows.push({
        user_id: user.id,
        branch_id: branchId,
        round_id: roundId,
        bet_direction: null,
        bet_digit: null,
        bet_parity: bets.parity,
        bet_amount: bets.parityAmount,
        payout: won ? Math.floor(bets.parityAmount * PAYOUT_RATIO) : 0,
        result: won ? "win" : "lose",
      })
    }

    if (bets.baccaratSide && bets.baccaratAmount > 0 && baccaratResult) {
      const won = bets.baccaratSide === baccaratResult
      const isTieResult = baccaratResult === "tie"
      const refund = isTieResult && (bets.baccaratSide === "player" || bets.baccaratSide === "banker")
      let payout = 0
      if (won) {
        if (bets.baccaratSide === "player") payout = Math.floor(bets.baccaratAmount * 2)
        else if (bets.baccaratSide === "banker") payout = Math.floor(bets.baccaratAmount * 1.95)
        else if (bets.baccaratSide === "tie") payout = Math.floor(bets.baccaratAmount * 9)
      } else if (refund) {
        payout = bets.baccaratAmount
      }
      betHistoryRows.push({
        user_id: user.id,
        branch_id: branchId,
        round_id: roundId,
        bet_direction: `baccarat_${bets.baccaratSide}`,
        bet_digit: null,
        bet_parity: null,
        bet_amount: bets.baccaratAmount,
        payout,
        result: won ? "win" : refund ? "tie" : "lose",
      })
    }

    if (betHistoryRows.length > 0) {
      await admin.from("bet_history").insert(betHistoryRows)
    }

    // ── 이긴 경우만 잔고에 수익 추가 ────────────────────────
    let newBalance: number | null = null
    if (totalPayout > 0) {
      const { data: balanceData } = await admin
        .from("balances")
        .select("amount")
        .eq("user_id", user.id)
        .single()

      const currentBalance = balanceData?.amount ?? 0
      newBalance = currentBalance + totalPayout

      await admin
        .from("balances")
        .update({ amount: newBalance })
        .eq("user_id", user.id)

      // 당첨 수익도 balance_transactions에 기록
      await admin.from("balance_transactions").insert({
        user_id: user.id,
        branch_id: branchId,
        type: "win",
        amount: totalPayout,
        balance_before: currentBalance,
        balance_after: newBalance,
        note: `게임 당첨 수익`,
      })

      // Redis 갱신 + version increment → 모든 기기의 SSE 스트림이 변경 감지
      await Promise.all([
        redis.set(`balance:${user.id}`, newBalance, { ex: 3600 }),
        redis.incr(`balance_version:${user.id}`),
      ])
    }

    return NextResponse.json({
      success: true,
      wonDirection,
      wonDigit,
      wonParity,
      totalPayout,
      newBalance,
    })
  } catch (err) {
    console.error("[v0] Game settle error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
