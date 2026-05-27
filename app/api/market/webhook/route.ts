export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { redis } from "@/lib/redis"

export async function POST(req: Request) {
  // Malum 웹훅 검증 — X-Malum-Webhook 헤더에 WEBHOOK KEY가 들어옴
  const webhookKey = req.headers.get("x-malum-webhook") ?? ""
  const expectedKey = process.env.MALUM_WEBHOOK_KEY ?? ""

  if (expectedKey && webhookKey !== expectedKey) {
    console.error("[v0] Malum webhook: invalid key", webhookKey)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let event: any
  try {
    event = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Malum 웹훅 이벤트 구조: { status, transaction_id, metadata, ... }
  const txnId   = event.transaction_id as string | undefined
  const status  = event.status as string | undefined          // "COMPLETED" | "CANCELLED" | "PROCESSING"
  const metadata = (event.metadata ?? "") as string          // "item_id|buyer_id|publisher_id|tv_id|used_point"

  if (!txnId || status !== "COMPLETED") {
    // COMPLETED 아닌 이벤트는 무시 (PROCESSING 등)
    return NextResponse.json({ received: true })
  }

  // metadata 파싱
  const [item_id, buyer_id, publisher_id, , usedPointStr] = metadata.split("|")
  const usedPoint = Number(usedPointStr ?? 0)

  if (!item_id || !buyer_id) {
    console.error("[v0] Malum webhook: missing metadata fields", metadata)
    return NextResponse.json({ error: "Missing metadata" }, { status: 400 })
  }

  // 주문 업데이트 — malum_txn_id 기준
  const { data: updatedOrder } = await adminSupabase
    .from("market_orders")
    .update({
      paid_at:    new Date().toISOString(),
      status:     "pending",   // 발행자 승인 대기
    })
    .eq("malum_txn_id", txnId)
    .select("id, price_krw, bonus_credited")
    .single()

  if (!updatedOrder) {
    // malum_txn_id로 못 찾으면 item_id + buyer_id 로 fallback
    await adminSupabase
      .from("market_orders")
      .update({ paid_at: new Date().toISOString() })
      .eq("item_id", item_id)
      .eq("buyer_id", buyer_id)
      .eq("status", "pending")
      .is("paid_at", null)
  }

  // 상품 order_count 증가
  await adminSupabase.rpc("increment_order_count", { item_id })

  // 보너스 게임 잔고 자동 적립
  const orderId = updatedOrder?.id
  if (orderId && !updatedOrder?.bonus_credited) {
    const { data: item } = await adminSupabase
      .from("market_items")
      .select("game_bonus_rate, price_krw")
      .eq("id", item_id)
      .single()

    if (item && item.game_bonus_rate > 0) {
      const paidAmount  = updatedOrder.price_krw ?? item.price_krw
      const bonusAmount = Math.floor(paidAmount * item.game_bonus_rate / 100)

      if (bonusAmount > 0) {
        const { data: existing } = await adminSupabase
          .from("balances")
          .select("amount")
          .eq("user_id", buyer_id)
          .single()

        const newBalance = (existing?.amount ?? 0) + bonusAmount

        if (existing) {
          await adminSupabase.from("balances").update({ amount: newBalance }).eq("user_id", buyer_id)
        } else {
          await adminSupabase.from("balances").insert({ user_id: buyer_id, amount: newBalance })
        }

        await Promise.all([
          redis.set(`balance:${buyer_id}`, newBalance, { ex: 3600 }),
          redis.incr(`balance_version:${buyer_id}`),
        ])

        await adminSupabase
          .from("market_orders")
          .update({ bonus_credited: true })
          .eq("id", orderId)

        await adminSupabase
          .from("profiles")
          .update({ game_enabled: true })
          .eq("id", buyer_id)
      }
    }
  }

  return NextResponse.json({ received: true })
}
