export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })

  const { itemId, useBalance, balanceUsed } = (await req.json()) as { itemId?: string; useBalance?: boolean; balanceUsed?: number }
  if (!itemId) return NextResponse.json({ error: "상품 ID가 없습니다." }, { status: 400 })

  // 상품 조회 — 0원 확인
  const { data: item, error: itemErr } = await adminSupabase
    .from("market_items")
    .select("id, title, price_krw, publisher_id, is_active")
    .eq("id", itemId)
    .single()

  if (itemErr || !item?.is_active) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 })
  }

  if (item.price_krw !== 0) {
    return NextResponse.json({ error: "유료 상품은 이 경로로 구매할 수 없습니다." }, { status: 400 })
  }

  // 중복 구매 확인
  const { data: existing } = await adminSupabase
    .from("market_orders")
    .select("id")
    .eq("item_id", itemId)
    .eq("buyer_id", auth.userId)
    .not("paid_at", "is", null)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: "이미 구매한 상품입니다." }, { status: 409 })
  }

  // 주문 즉시 생성 (무료이므로 바로 approved + paid_at)
  const now = new Date().toISOString()
  const { error: insertErr } = await adminSupabase.from("market_orders").insert({
    item_id:        itemId,
    buyer_id:       auth.userId,
    publisher_id:   item.publisher_id,
    price_krw:      0,
    status:         "approved",
    paid_at:        now,
    bonus_credited: false,
    memo:           null,
  })

  if (insertErr) return NextResponse.json({ error: "주문 생성 실패" }, { status: 500 })

  // order_count 증가
  try { await adminSupabase.rpc("increment_order_count", { item_id: itemId }) } catch { /* ignore */ }

  return NextResponse.json({ success: true })
}
