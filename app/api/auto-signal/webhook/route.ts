export const dynamic = "force-dynamic"
/**
 * POST /api/auto-signal/webhook
 * TradingView / Flask 등 외부 시그널에서 호출
 * 모든 요청(성공/실패)을 webhook_request_logs 테이블에 기록
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "tasko-internal"

async function logRequest(
  status: string,
  statusCode: number,
  payload: Record<string, unknown>,
  opts: { symbol?: string; signalType?: string; errorMsg?: string; ip?: string } = {}
) {
  await adminSupabase.from("webhook_request_logs").insert({
    status,
    status_code: statusCode,
    raw_payload: payload,
    symbol:      opts.symbol,
    signal_type: opts.signalType,
    error_msg:   opts.errorMsg,
    ip:          opts.ip,
  })
}

export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for") ?? req.headers.get("x-real-ip") ?? "unknown"

  let body: Record<string, string> = {}
  try {
    body = await req.json()
  } catch {
    await logRequest("error", 400, {}, { ip, errorMsg: "invalid json" })
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  // 인증: 헤더 OR body.secret (TradingView는 커스텀 헤더 불가)
  const headerSecret = req.headers.get("x-internal-secret") ?? req.headers.get("x-webhook-secret")
  const bodySecret   = body.secret ?? body.webhook_secret
  if (headerSecret !== INTERNAL_SECRET && bodySecret !== INTERNAL_SECRET) {
    await logRequest("auth_fail", 401, body, { ip, errorMsg: "unauthorized" })
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const {
    alert_type,
    signal_type,
    symbol,
    price,
    formatted_time_kst,
  } = body

  const type = signal_type ?? alert_type

  if (!type || !symbol || !price) {
    const msg = "missing required fields: signal_type, symbol, price"
    await logRequest("error", 400, body, { ip, symbol, signalType: type, errorMsg: msg })
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  const direction = type.toUpperCase().includes("DOWN") ? "short" : "long"

  // 자동매매 설정 조회
  const { data: settings } = await adminSupabase
    .from("auto_signal_settings")
    .select("size_usd, leverage, enabled")
    .eq("id", 1)
    .single()

  if (!settings?.enabled) {
    await logRequest("skipped", 200, body, { ip, symbol, signalType: type, errorMsg: "auto-signal disabled" })
    return NextResponse.json({ skipped: true, reason: "auto-signal disabled" })
  }

  // signal_time 파싱 KST → UTC
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
      signal_type:  type,
      symbol:       symbol.replace(".P", ""),
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
    await logRequest("error", 500, body, { ip, symbol, signalType: type, errorMsg: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logRequest("ok", 200, body, { ip, symbol, signalType: type })

  return NextResponse.json({ ok: true, id: data.id })
}
