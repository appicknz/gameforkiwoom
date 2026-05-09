import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { stripe } from "@/lib/stripe"
import { verifySession } from "@/lib/auth"

export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })

  const { itemId, tradingViewId } = await req.json()
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

  // 중복 주문 확인
  const { data: existing } = await adminSupabase
    .from("market_orders")
    .select("id, status")
    .eq("item_id", itemId)
    .eq("buyer_id", auth.userId)
    .in("status", ["pending", "approved"])
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: "이미 구매했거나 대기 중인 주문이 있습니다." }, { status: 409 })
  }

  // stripe_price_id 없으면 동적 생성
  let priceId = item.stripe_price_id
  if (!priceId) {
    const product = await stripe.products.create({
      name: item.title,
    })
    const price = await stripe.prices.create({
      product:      product.id,
      unit_amount:  item.price_krw,
      currency:     "krw",
    })
    priceId = price.id
    // DB에 저장해서 다음번엔 재사용
    await adminSupabase
      .from("market_items")
      .update({ stripe_price_id: priceId })
      .eq("id", itemId)
  }

  const origin = req.headers.get("origin") ?? `https://${process.env.VERCEL_URL}` ?? "http://localhost:3000"

  // Stripe Checkout 세션 생성
  const session = await stripe.checkout.sessions.create({
    mode:       "payment",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/market/order/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${origin}/market`,
    metadata: {
      item_id:          itemId,
      buyer_id:         auth.userId,
      publisher_id:     item.publisher_id,
      trading_view_id:  tradingViewId ?? "",
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
