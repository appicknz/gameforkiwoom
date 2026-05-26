export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { stripe } from "@/lib/stripe"
import { verifySession } from "@/lib/auth"

export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })

  const body = await req.json()
  const { itemId, tvId } = body as { itemId?: string; tvId?: string }
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
  // 중복 주문 확인: approved(승인완료) 또는 결제 완료된 pending(paid_at 있음)만 막기
  const { data: existing } = await adminSupabase
    .from("market_orders")
    .select("id, status, paid_at")
    .eq("item_id", itemId)
    .eq("buyer_id", auth.userId)
    .in("status", ["pending", "approved"])
    .not("paid_at", "is", null)  // paid_at 있는 것만 = 실제 결제된 주문
    .single()

  if (existing) {
    return NextResponse.json({ error: "이미 결제가 완료된 상품입니다." }, { status: 409 })
  }

  const origin = req.headers.get("origin") ?? process.env.VERCEL_URL ?? "http://localhost:3000"

  // stripe_price_id 있으면 기존 Price 사용, 없으면 price_data로 직접 생성
  const lineItem = item.stripe_price_id
    ? { price: item.stripe_price_id, quantity: 1 }
    : {
        quantity: 1,
        price_data: {
          currency:     "krw",
          unit_amount:  item.price_krw,
          product_data: { name: item.title },
        },
      }

  const session = await stripe.checkout.sessions.create({
    mode:        "payment",
    line_items:  [lineItem],
    success_url: `${origin}/market/order/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url:  `${origin}/market`,
    metadata: {
      item_id:      itemId,
      buyer_id:     auth.userId,
      publisher_id: item.publisher_id ?? "",
      tv_id:        tvId ?? "",
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
