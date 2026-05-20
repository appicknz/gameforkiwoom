import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import crypto from "crypto"

export const dynamic = "force-dynamic"

const adminSupabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// NOWPayments IPN 서명 검증
// x-nowpayments-sig 헤더: HMAC-SHA512(sorted JSON body, ipn_secret)
function verifySignature(body: string, signature: string, secret: string): boolean {
  try {
    const parsed   = JSON.parse(body)
    // 키를 알파벳 순으로 정렬한 JSON으로 서명 생성
    const sorted   = JSON.stringify(parsed, Object.keys(parsed).sort())
    const expected = crypto.createHmac("sha512", secret).update(sorted).digest("hex")
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature))
  } catch {
    return false
  }
}

// USD → KRW 환율 조회 (fallback: 1380)
async function getUsdToKrw(): Promise<number> {
  try {
    const res  = await fetch("https://open.er-api.com/v6/latest/USD", { next: { revalidate: 3600 } })
    const data = await res.json()
    return data?.rates?.KRW ?? 1380
  } catch {
    return 1380
  }
}

export async function POST(req: NextRequest) {
  const ipnSecret = process.env.NOWPAYMENTS_IPN_SECRET
  if (!ipnSecret) {
    console.log("[v0] NOWPAYMENTS_IPN_SECRET not set")
    return NextResponse.json({ error: "not configured" }, { status: 500 })
  }

  const rawBody  = await req.text()
  const signature = req.headers.get("x-nowpayments-sig") ?? ""

  // 서명 검증
  if (!verifySignature(rawBody, signature, ipnSecret)) {
    console.log("[v0] IPN signature mismatch")
    return NextResponse.json({ error: "invalid signature" }, { status: 403 })
  }

  const data = JSON.parse(rawBody)
  console.log("[v0] IPN received:", data.payment_status, data.order_id, data.price_amount)

  // "finished" 상태만 처리 (partially_paid, waiting 등은 무시)
  if (data.payment_status !== "finished") {
    return NextResponse.json({ ok: true, skipped: true })
  }

  // order_id 형식: topup_{userId}_{timestamp}
  const match = String(data.order_id ?? "").match(/^topup_([^_]+)_\d+$/)
  if (!match) {
    console.log("[v0] Invalid order_id format:", data.order_id)
    return NextResponse.json({ error: "invalid order_id" }, { status: 400 })
  }
  const userId = match[1]

  const paymentId = String(data.payment_id ?? data.order_id)

  // 중복 처리 방지: webhook_request_logs에서 동일 payment_id 처리 여부 확인
  const { data: existing } = await adminSupabase
    .from("webhook_request_logs")
    .select("id")
    .eq("status", "nowpayments_processed")
    .contains("body_raw", { payment_id: paymentId })
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  // 결제 금액(USD) → KRW 환산
  const amountUsd = Number(data.price_amount ?? 0)
  const usdToKrw  = await getUsdToKrw()
  const amountKrw = Math.floor(amountUsd * usdToKrw)

  if (amountKrw <= 0) {
    return NextResponse.json({ error: "invalid amount" }, { status: 400 })
  }

  // 잔고 충전: add_balance_for_payout(p_user_id uuid, p_amount bigint)
  const { error: rpcErr } = await adminSupabase.rpc("add_balance_for_payout", {
    p_user_id: userId,
    p_amount:  amountKrw,
  })

  if (rpcErr) {
    console.log("[v0] add_balance_for_payout error:", rpcErr.message)
    // 실패 이력 기록
    await adminSupabase.from("webhook_request_logs").insert({
      status:   "nowpayments_error",
      method:   "POST",
      body_raw: data,
      error_msg: rpcErr.message,
    }).catch(() => {})
    return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  }

  // 성공 이력 기록 (중복 방지 겸용)
  await adminSupabase.from("webhook_request_logs").insert({
    status:   "nowpayments_processed",
    method:   "POST",
    body_raw: data,
  }).catch(() => {})

  // Redis 캐시 삭제 → top-bar 잔고 즉시 반영
  try {
    const { Redis } = await import("@upstash/redis")
    const redis = Redis.fromEnv()
    await redis.del(`balance:${userId}`)
  } catch (e) {
    console.log("[v0] Redis cache clear failed:", e)
  }

  console.log("[v0] Balance topped up:", userId, amountKrw, "KRW")
  return NextResponse.json({ ok: true, amountKrw })
}
