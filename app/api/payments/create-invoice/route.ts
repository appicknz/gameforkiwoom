import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

const adminSupabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

function decodeJwtSub(token: string): string | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    )
    return payload.sub ?? null
  } catch { return null }
}

export async function POST(req: NextRequest) {
  // 쿠키 또는 Authorization 헤더 중 하나로 인증 (다른 API 라우트와 동일한 패턴)
  const cookieStore = await cookies()
  const token =
    req.headers.get("authorization")?.replace("Bearer ", "").trim() ??
    cookieStore.get("app_token")?.value ??
    ""

  const userId = decodeJwtSub(token)
  if (!userId) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  // JWT 유효성 서버에서 검증
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
      price_amount:     amountUsd,
      price_currency:   "usd",
      // pay_currency 생략 → 결제 페이지에서 카드 포함 고객이 직접 선택
      ipn_callback_url: "https://dissig.com/api/payments/webhook",
      order_id:        `topup_${user.id}_${Date.now()}`,
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
