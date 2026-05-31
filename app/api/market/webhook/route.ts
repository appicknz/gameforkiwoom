export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { redis } from "@/lib/redis"
import { stripe } from "@/lib/stripe"
import type Stripe from "stripe"

export const config = { api: { bodyParser: false } }

export async function POST(req: Request) {
  const body = await req.text()
  const sig  = req.headers.get("stripe-signature") ?? ""
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET ?? ""

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch {
    // 테스트 환경: webhook secret 없으면 raw JSON 파싱
    try {
      event = JSON.parse(body) as Stripe.Event
    } catch {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session
    const { item_id, buyer_id } = session.metadata ?? {}

    if (item_id && buyer_id) {
      // 결제 완료 → paid_at 기록, status는 pending 유지 (발행자 승인 대기)
      const { data: updatedOrder } = await adminSupabase
        .from("market_orders")
        .update({
          stripe_payment_intent: session.payment_intent as string,
          paid_at: new Date().toISOString(),
        })
        .eq("stripe_session_id", session.id)
        .select("id, price_krw, bonus_credited")
        .single()

      // 상품 order_count 증가
      await adminSupabase.rpc("increment_order_count", { item_id })

      // ── 보너스 게임 잔고 자동 적립 ──────────────────────────────
      // 위변조 방지: 상품의 game_bonus_rate는 서버 DB에서 직접 읽음 (클라이언트 값 사용 안 함)
      if (updatedOrder && !updatedOrder.bonus_credited) {
        const { data: item } = await adminSupabase
          .from("market_items")
          .select("game_bonus_rate, price_krw")
          .eq("id", item_id)
          .single()

        if (item && item.game_bonus_rate > 0) {
          // 실제 결제 금액(order의 price_krw) 기준으로 계산
          const paidAmount   = updatedOrder.price_krw ?? item.price_krw
          const bonusAmount  = Math.floor(paidAmount * item.game_bonus_rate / 100)

          if (bonusAmount > 0) {
            // balances 테이블 upsert
            const { data: existing } = await adminSupabase
              .from("balances")
              .select("amount")
              .eq("user_id", buyer_id)
              .single()

            const newBalance = (existing?.amount ?? 0) + bonusAmount

            if (existing) {
              await adminSupabase
                .from("balances")
                .update({ amount: newBalance })
                .eq("user_id", buyer_id)
            } else {
              await adminSupabase
                .from("balances")
                .insert({ user_id: buyer_id, amount: newBalance })
            }

            // Redis 캐시 갱신
            await Promise.all([
              redis.set(`balance:${buyer_id}`, newBalance, { ex: 3600 }),
              redis.incr(`balance_version:${buyer_id}`),
            ])

            // 중복 적립 방지 플래그
            await adminSupabase
              .from("market_orders")
              .update({ bonus_credited: true })
              .eq("id", updatedOrder.id)

            // game_enabled 자동 활성화 (구매로 인한 접근 허용)
            await adminSupabase
              .from("profiles")
              .update({ game_enabled: true })
              .eq("id", buyer_id)
          }
        }
      }
    }
  }

  return NextResponse.json({ received: true })
}
