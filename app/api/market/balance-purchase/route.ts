export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { redis } from "@/lib/redis"
import { verifySession } from "@/lib/auth"

export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })

  const body = await req.json()
  const { itemId } = body as { itemId?: string }
  if (!itemId) return NextResponse.json({ error: "상품 ID가 없습니다." }, { status: 400 })

  // 상품 조회 — 카테고리 balance_only 여부도 함께 확인
  const { data: item, error: itemErr } = await adminSupabase
    .from("market_items")
    .select(`
      id, title, price_krw, publisher_id, is_active, category_id,
      market_categories(balance_only)
    `)
    .eq("id", itemId)
    .single()

  if (itemErr || !item?.is_active) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 })
  }

  // 이 API는 balance_only 카테고리 상품에만 허용
  const cat = item.market_categories as { balance_only: boolean } | null
  if (!cat?.balance_only) {
    return NextResponse.json({ error: "이 상품은 잔고 결제를 지원하지 않습니다." }, { status: 400 })
  }

  // 중복 구매 확인
  const { data: existing } = await adminSupabase
    .from("market_orders")
    .select("id")
    .eq("item_id", itemId)
    .eq("buyer_id", auth.userId)
    .in("status", ["pending", "approved"])
    .not("paid_at", "is", null)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: "이미 구매한 상품입니다." }, { status: 409 })
  }

  // 잔고 조회
  const { data: balanceRow } = await adminSupabase
    .from("balances")
    .select("amount")
    .eq("user_id", auth.userId)
    .single()

  const currentBalance = balanceRow?.amount ?? 0
  if (currentBalance < item.price_krw) {
    return NextResponse.json({
      error: `잔고가 부족합니다. (현재 잔고: ${currentBalance.toLocaleString("ko-KR")}원)`,
    }, { status: 402 })
  }

  // 잔고 차감
  const newBalance = currentBalance - item.price_krw

  const { error: updateErr } = await adminSupabase
    .from("balances")
    .update({ amount: newBalance })
    .eq("user_id", auth.userId)

  if (updateErr) return NextResponse.json({ error: "잔고 차감 실패" }, { status: 500 })

  // Redis 캐시 갱신
  await Promise.all([
    redis.set(`balance:${auth.userId}`, newBalance, { ex: 3600 }),
    redis.incr(`balance_version:${auth.userId}`),
  ])

  // 주문 생성 (즉시 approved + paid_at 설정)
  const now = new Date().toISOString()
  await adminSupabase.from("market_orders").insert({
    item_id:      itemId,
    buyer_id:     auth.userId,
    publisher_id: item.publisher_id,
    price_krw:    item.price_krw,
    status:       "approved",
    paid_at:      now,
    bonus_credited: false,
  })

  // order_count 증가
  await adminSupabase.rpc("increment_order_count", { item_id: itemId })

  return NextResponse.json({ success: true, newBalance })
}
