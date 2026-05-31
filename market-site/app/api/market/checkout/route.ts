export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

// KRW → USD 환산율 (env에서 오버라이드 가능, 기본 1350)
const KRW_PER_USD = Number(process.env.KRW_PER_USD ?? 1350)

function krwToUsd(krw: number): number {
  return Math.max(0.5, Math.round((krw / KRW_PER_USD) * 100) / 100)
}

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
    .select("id, title, description, image_url, price_krw, publisher_id, is_active")
    .eq("id", itemId)
    .single()

  if (itemErr || !item?.is_active) {
    return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 })
  }

  // 중복 주문 확인
  const { data: existing } = await adminSupabase
    .from("market_orders")
    .select("id")
    .eq("item_id", itemId)
    .eq("buyer_id", auth.userId)
    .in("status", ["pending", "approved"])
    .not("paid_at", "is", null)
    .single()

  if (existing) {
    return NextResponse.json({ error: "이미 결제가 완료된 상품입니다." }, { status: 409 })
  }

  const origin = req.headers.get("origin") ?? `https://${process.env.VERCEL_URL}` ?? "http://localhost:3000"

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

  const finalKrw = item.price_krw - usedPoint
  const finalUsd = krwToUsd(finalKrw)

  // 구매자 이메일 조회 (auth.users RPC)
  let customerEmail = "customer@unknown.com"
  try {
    const { createClient } = await import("@supabase/supabase-js")
    const adminClient = createClient(
      process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: authUser } = await adminClient.auth.admin.getUserById(auth.userId)
    customerEmail = authUser?.user?.email ?? "customer@unknown.com"
  } catch {
    // 이메일 조회 실패 시 기본값 사용
  }

  // metadata: pipe-delimited (254자 제한)
  const metadata = [itemId, auth.userId, item.publisher_id ?? "", tvId ?? "", String(usedPoint)]
    .map(s => s.replace(/\|/g, "_"))
    .join("|")

  // MALUM 헤더: {BUSINESS_ID}:{SECRET_KEY}
  const malumMid    = process.env.MALUM_BUSINESS_ID
  const malumSecret = process.env.MALUM_SECRET_KEY
  if (!malumMid || !malumSecret) {
    return NextResponse.json({ error: "결제 설정 오류 (env)" }, { status: 500 })
  }
  const malumKey = `${malumMid}:${malumSecret}`

  const malumBody = {
    amount:          finalUsd,
    currency:        "USD",
    customer_email:  customerEmail,
    webhook_url:     `${origin}/api/market/webhook`,
    success_url:     `${origin}/market/order/success`,
    cancel_url:      `${origin}/market`,
    buyer_pays_fees: false,
    metadata,
    product_title:   item.title,
    ...(item.description ? { product_description: item.description } : {}),
    ...(item.image_url   ? { product_image: item.image_url }         : {}),
  }

  const malumRes = await fetch("https://malum.co/api/v2/payment/create", {
    method: "POST",
    headers: {
      "MALUM":        malumKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(malumBody),
  })

  const malumData = await malumRes.json()

  if (malumData.status !== "success" || !malumData.link) {
    return NextResponse.json({ error: malumData.message ?? "결제 생성 실패" }, { status: 502 })
  }

  const txnId = malumData.transaction_id as string

  // 주문 레코드 생성 (결제 완료 전 pending)
  await adminSupabase.from("market_orders").insert({
    item_id:      itemId,
    buyer_id:     auth.userId,
    publisher_id: item.publisher_id,
    price_krw:    item.price_krw,
    malum_txn_id: txnId,
    status:       "pending",
  })

  return NextResponse.json({ url: malumData.link })
}
