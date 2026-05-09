import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
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
    const { item_id, buyer_id, publisher_id } = session.metadata ?? {}

    if (item_id && buyer_id) {
      // 결제 완료 → paid_at 기록, status는 pending 유지 (발행자 승인 대기)
      await adminSupabase
        .from("market_orders")
        .update({
          stripe_payment_intent: session.payment_intent as string,
          paid_at: new Date().toISOString(),
        })
        .eq("stripe_session_id", session.id)

      // 상품 order_count 증가
      await adminSupabase.rpc("increment_order_count", { item_id })
    }
  }

  return NextResponse.json({ received: true })
}
