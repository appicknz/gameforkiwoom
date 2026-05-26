export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { stripe } from "@/lib/stripe"
import { verifySession } from "@/lib/auth"

export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })

  const body = await req.json()
  const { itemId, tvId, pointAmount = 0 } = body as { itemId?: string; tvId?: string; pointAmount?: number }
  if (!itemId) return NextResponse.json({ error: "상품 ID가 없습니다." }, { status: 400 })
  const pointAmt = Math.max(0, Math.floor(pointAmount))

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

  // 포인트 차감 처리
  let usedPoint = 0
  if (pointAmt > 0) {
    const { data: balanceRow } = await adminSupabase
      .from("balances")
      .select("amount")
      .eq("user_id", auth.userId)
      .single()

    const currentBalance = balanceRow?.amount ?? 0
    usedPoint = Math.min(pointAmt, currentBalance, item.price_krw)

    if (usedPoint > 0) {
      const { redis } = await import("@/lib/redis")
      const newBalance = currentBalance - usedPoint
      await adminSupabase.from("balances").update({ amount: newBalance }).eq("user_id", auth.userId)
      await Promise.all([
        redis.set(`balance:${auth.userId}`, newBalance, { ex: 3600 }),
        redis.incr(`balance_version:${auth.userId}`),
      ])
    }
  }

  const finalAmount = item.price_krw - usedPoint

  // Stripe 결제 금액 = 포인트 차감 후 잔액
  const lineItem = {
    quantity: 1,
    price_data: {
      currency:     "krw",
      unit_amount:  finalAmount,
      product_data: { name: item.title + (usedPoint > 0 ? ` (포인트 ${usedPoint.toLocaleString("ko-KR")}원 적용)` : "") },
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
      used_point:   String(usedPoint),
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
