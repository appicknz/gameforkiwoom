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

    // ── 수익 계산 (서버에서만) ───────────────────────────────
    let totalPayout = 0

    if (bets.direction && bets.directionAmount > 0) {
      if (bets.direction === wonDirection) {
        totalPayout += Math.floor(bets.directionAmount * PAYOUT_RATIO)
      }
      // 패배: 이미 bet API에서 차감됨, 추가 처리 없음
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
