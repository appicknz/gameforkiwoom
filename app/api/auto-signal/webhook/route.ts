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
  try {
    await adminSupabase.from("webhook_request_logs").insert({
      status,
      status_code: statusCode,
      body_raw:    payload,       // DB 실제 컬럼명
      symbol:      opts.symbol    ?? null,
      signal_type: opts.signalType ?? null,
      error_msg:   opts.errorMsg  ?? null,
      ip:          opts.ip        ?? null,
      method:      "POST",
    })
  } catch (e) {
    console.error("[webhook] logRequest failed:", e)
  }
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

  // 인증 없음 — Flask/TradingView 호환 (공개 엔드포인트, payload 포맷으로 필터링)
  // secret 있으면 검증, 없으면 통과
  const headerSecret   = req.headers.get("x-internal-secret") ?? req.headers.get("x-webhook-secret")
  const bodySecret     = (body as Record<string, string>).secret
  const providedSecret = headerSecret ?? bodySecret
  if (providedSecret && providedSecret !== INTERNAL_SECRET) {
    await logRequest("auth_fail", 401, body, { ip, errorMsg: "wrong secret" })
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

  // 자동매매 전역 설정 + 시그널 규칙 병렬 조회
  const [{ data: settings }, { data: rule }] = await Promise.all([
    adminSupabase.from("auto_signal_settings").select("size_usd, leverage, enabled").eq("id", 1).single(),
    adminSupabase.from("auto_signal_rules").select("direction, enabled").eq("signal_type", type).single(),
  ])

  if (!settings?.enabled) {
    await logRequest("skipped", 200, body, { ip, symbol, signalType: type, errorMsg: "auto-signal disabled" })
    return NextResponse.json({ skipped: true, reason: "auto-signal disabled" })
  }

  // 규칙이 있으면 규칙 방향 사용, 없으면 이름에서 추론
  if (rule && !rule.enabled) {
    await logRequest("skipped", 200, body, { ip, symbol, signalType: type, errorMsg: "signal type disabled" })
    return NextResponse.json({ skipped: true, reason: "signal type disabled" })
  }
  const direction: string = rule?.direction ?? (type.toUpperCase().includes("DOWN") ? "short" : "long")

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
