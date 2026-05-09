import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { stripe } from "@/lib/stripe"
import { verifySession } from "@/lib/auth"

export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })

  const { itemId } = await req.json()
  if (!itemId) return NextResponse.json({ error: "상품 ID가 없습니다." }, { status: 400 })

  // 상품 조회
  const { data: item, error: itemErr } = await adminSupabase
    .from("market_items")
    .select("id, title, price_krw, stripe_price_id, publisher_id, is_active")
    .eq("id", itemId)
    .single()

  if (itemErr || !item?.is_active) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 })
  }
  if (!item.stripe_price_id) {
    return NextResponse.json({ error: "결제 정보가 준비되지 않았습니다." }, { status: 400 })
  }

  // 중복 주문 확인 (paid 또는 pending 상태)
  const { data: existing } = await adminSupabase
    .from("market_orders")
    .select("id, status")
    .eq("item_id", itemId)
    .eq("buyer_id", auth.userId)
    .in("status", ["pending", "approved"])
    .single()

  if (existing) {
    return NextResponse.json({ error: "이미 구매했거나 대기 중인 주문이 있습니다." }, { status: 409 })
  }

  const origin = req.headers.get("origin") ?? process.env.VERCEL_URL ?? "http://localhost:3000"

  // Stripe Checkout 세션 생성
  const session = await stripe.checkout.sessions.create({
    mode:                "payment",
    line_items: [
      { price: item.stripe_price_id, quantity: 1 },
    ],
    currency:            "krw",
    success_url:         `${origin}/market/order/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:          `${origin}/market/${itemId}`,
    metadata: {
      item_id:      itemId,
      buyer_id:     auth.userId,
      publisher_id: item.publisher_id,
    },
  })

  // 주문 레코드 생성 (결제 완료 전 pending)
  await adminSupabase.from("market_orders").insert({
    item_id:           itemId,
    buyer_id:          auth.userId,
    publisher_id:      item.publisher_id,
    price_krw:         item.price_krw,
    stripe_session_id: session.id,
    status:            "pending",
  })

  return NextResponse.json({ url: session.url })
}
