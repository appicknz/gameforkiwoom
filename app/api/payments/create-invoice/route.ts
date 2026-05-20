import { NextRequest, NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

export async function POST(req: NextRequest) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { userId } = auth

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
      price_amount:     amountUsd,
      price_currency:   "usd",
      // pay_currency 생략 → 결제 페이지에서 카드 포함 고객이 직접 선택
      ipn_callback_url: "https://dissig.com/api/payments/webhook",
      order_id:        `topup_${userId}_${Date.now()}`,
      order_description: `Dissig 잔고 충전 $${amountUsd}`,
      success_url:     "https://dissig.com/?payment=success",
      cancel_url:      "https://dissig.com/?payment=cancel",
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
