export const dynamic = "force-dynamic"
/**
 * POST /api/auto-signal/webhook
 * TradingView / 외부 시그널 서비스에서 호출
 * 모든 수신 요청을 webhook_request_logs 에 기록 (성공/실패 모두)
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "tasko-internal"

async function logRequest(params: {
  status:   string
  ip:       string
  headers:  Record<string, string>
  body:     Record<string, unknown>
  response: Record<string, unknown>
  error?:   string
}) {
  try {
    await adminSupabase.from("webhook_request_logs").insert({
      status:    params.status,
      ip:        params.ip,
      headers:   params.headers,
      body_raw:  params.body,
      response:  params.response,
      error_msg: params.error ?? null,
    })
  } catch (e) {
    console.error("[webhook] log write failed", e)
  }
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")
            ?? req.headers.get("x-real-ip")
            ?? "unknown"

  const headerMap: Record<string, string> = {}
  req.headers.forEach((v, k) => {
    // secret 값은 마스킹
    headerMap[k] = k.toLowerCase().includes("secret") ? "***" : v
  })

  // body 파싱
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    await logRequest({ status: "error", ip, headers: headerMap, body: {}, response: { error: "invalid json" }, error: "invalid json" })
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  // secret 마스킹 (로그용)
  const bodySafe = { ...body, secret: body.secret ? "***" : undefined, webhook_secret: body.webhook_secret ? "***" : undefined }

  // 인증: 헤더 OR body.secret
  const headerSecret = req.headers.get("x-internal-secret") ?? req.headers.get("x-webhook-secret")
  const bodySecret   = (body.secret ?? body.webhook_secret) as string | undefined
  if (headerSecret !== INTERNAL_SECRET && bodySecret !== INTERNAL_SECRET) {
    await logRequest({
      status: "auth_fail", ip, headers: headerMap, body: bodySafe,
      response: { error: "unauthorized" },
      error: `secret mismatch — header: ${headerSecret ? "provided" : "missing"}, body: ${bodySecret ? "provided" : "missing"}`,
    })
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const signal_type = (body.signal_type ?? body.alert_type) as string | undefined
  const symbol      = body.symbol as string | undefined
  const price       = body.price  as string | undefined
  const formatted_time_kst = body.formatted_time_kst as string | undefined

  if (!signal_type || !symbol || !price) {
    const missing = ["signal_type/alert_type", "symbol", "price"].filter((f, i) => [!signal_type, !symbol, !price][i])
    await logRequest({
      status: "missing_fields", ip, headers: headerMap, body: bodySafe,
      response: { error: "missing required fields", missing },
    })
    return NextResponse.json({ error: `missing required fields: ${missing.join(", ")}` }, { status: 400 })
  }

  const direction = signal_type.toUpperCase().includes("DOWN") ? "short" : "long"

  // 자동매매 설정 조회
  const { data: settings } = await adminSupabase
    .from("auto_signal_settings")
    .select("size_usd, leverage, enabled")
    .eq("id", 1)
    .single()

  if (!settings?.enabled) {
    await logRequest({ status: "disabled", ip, headers: headerMap, body: bodySafe, response: { skipped: true, reason: "auto-signal disabled" } })
    return NextResponse.json({ skipped: true, reason: "auto-signal disabled" })
  }

  // signal_time 파싱 (KST → UTC)
  let signalTime: string
  try {
    const raw = formatted_time_kst ?? new Date().toISOString()
    signalTime = new Date(raw.replace(" ", "T") + "+09:00").toISOString()
  } catch {
    signalTime = new Date().toISOString()
  }

  const dateLabel = signalTime.slice(0, 10)

  const { data, error } = await adminSupabase
    .from("auto_signal_positions")
    .insert({
      signal_type:  signal_type,
      symbol:       symbol.replace(/\.P$/, ""),
      direction,
      entry_price:  parseFloat(price),
      size_usd:     settings.size_usd,
      leverage:     settings.leverage,
      signal_time:  signalTime,
      date_label:   dateLabel,
      is_closed:    false,
      webhook_raw:  body,
    })
    .select("id")
    .single()

  if (error) {
    console.error("[auto-signal] insert error", error.message)
    await logRequest({ status: "error", ip, headers: headerMap, body: bodySafe, response: { error: error.message }, error: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logRequest({ status: "ok", ip, headers: headerMap, body: bodySafe, response: { ok: true, id: data.id } })
  return NextResponse.json({ ok: true, id: data.id })
}
