import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const adminSupabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(req: NextRequest) {
  // 로그인 확인
  const auth = req.headers.get("authorization") ?? ""
  const token = auth.replace("Bearer ", "").trim()
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: { user }, error: authErr } = await adminSupabase.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const body = await req.json()
  const amountUsd: number = body.amount_usd

  if (!amountUsd || amountUsd < 1) {
    return NextResponse.json({ error: "invalid amount" }, { status: 400 })
  }

  const apiKey = process.env.NOWPAYMENTS_API_KEY
  if (!apiKey) return NextResponse.json({ error: "payment not configured" }, { status: 500 })

  // NOWPayments 인보이스 생성
  // https://documenter.getpostman.com/view/7907941/2s93JusNJt
  const invoiceRes = await fetch("https://api.nowpayments.io/v1/invoice", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      price_amount:    amountUsd,
      price_currency:  "usd",
      pay_currency:    "btc",       // 기본값, 결제 페이지에서 변경 가능
      ipn_callback_url: `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://dissig.com"}/api/payments/webhook`,
      order_id:        `topup_${user.id}_${Date.now()}`,
      order_description: `Dissig 잔고 충전 $${amountUsd}`,
      success_url:     `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://dissig.com"}/?payment=success`,
      cancel_url:      `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://dissig.com"}/?payment=cancel`,
      is_fee_paid_by_user: false,
    }),
  })

  if (!invoiceRes.ok) {
    const errText = await invoiceRes.text()
    console.log("[v0] NOWPayments invoice error:", errText)
    return NextResponse.json({ error: "invoice creation failed", detail: errText }, { status: 502 })
  }

  const invoice = await invoiceRes.json()

  return NextResponse.json({
    invoice_url: invoice.invoice_url,
    invoice_id:  invoice.id,
    amount_usd:  amountUsd,
  })
}
