export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { createHash } from "crypto"
import { adminSupabase } from "@/lib/supabase-admin"
import { redis } from "@/lib/redis"

export async function POST(req: Request) {
  let event: any
  try {
    event = await req.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  // Malum 웹훅 서명 검증: md5(txn + "|" + timestamp + "|" + webhook_key)
  const { txn, timestamp, signature, status, metadata } = event
  const webhookKey = process.env.MALUM_WEBHOOK_KEY ?? ""

  if (webhookKey) {
    const expected = createHash("md5")
      .update(`${txn}|${timestamp}|${webhookKey}`)
      .digest("hex")

    if (expected !== signature) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  // COMPLETED 이벤트만 처리
  if (status !== "COMPLETED") {
    return NextResponse.json({ received: true })
  }

  // metadata 파싱: "item_id|buyer_id|publisher_id|tv_id|used_point"
  const metaStr = typeof metadata === "string" ? metadata : JSON.stringify(metadata ?? "")
  const [item_id, buyer_id, publisher_id, , usedPointStr] = metaStr.split("|")

  if (!item_id || !buyer_id) {
    return NextResponse.json({ error: "Missing metadata" }, { status: 400 })
  }

  // 주문 업데이트 — malum_txn_id 기준으로 찾고, 없으면 item_id+buyer_id fallback
  const { data: updatedOrder } = await adminSupabase
    .from("market_orders")
    .update({
      paid_at: new Date().toISOString(),
      status:  "approved",
    })
    .eq("malum_txn_id", txn)
    .select("id, price_krw, bonus_credited")
    .single()

  if (!updatedOrder) {
    await adminSupabase
      .from("market_orders")
      .update({ paid_at: new Date().toISOString(), status: "approved" })
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
          .update({ bonus_credited: true, bonus_amount: bonusAmount })
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
