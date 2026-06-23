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
  // date_label은 반드시 KST 기준 날짜로 저장 (UTC로 하면 자정 전후 1일 어긋남)
  let signalTime: string
  let dateLabel: string
  try {
    const raw    = formatted_time_kst ?? new Date().toISOString()
    const kstStr = raw.replace(" ", "T")
    // KST 날짜 문자열에서 날짜 부분만 추출 (YYYY-MM-DD)
    dateLabel  = kstStr.slice(0, 10)
    // DB signal_time은 UTC ISO 문자열로 저장
    signalTime = new Date(kstStr + "+09:00").toISOString()
  } catch {
    signalTime = new Date().toISOString()
    // fallback: KST 기준 오늘 날짜
    dateLabel  = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  }

  const cleanSymbol = symbol.replace(".P", "")

  // 반영(rebalance) 완료 체크 — 당일 rebalance 기록이 있으면 이미 하루 마감된 날
  // 반영 후에는 어떤 신호가 와도 새 포지션을 생성하지 않음
  const { data: todayRebalance } = await adminSupabase
    .from("auto_signal_rebalance")
    .select("id")
    .eq("date_label", dateLabel)
    .limit(1)
    .single()

  if (todayRebalance) {
    await logRequest("skipped", 200, body, {
      ip, symbol, signalType: type,
      errorMsg: `day already closed (rebalanced): ${dateLabel}`,
    })
    return NextResponse.json({ skipped: true, reason: "day_already_closed" })
  }

  // 코드 레벨 중복 체크 — 같은 날 같은 종목+방향이 이미 있으면 스킵
  const { data: existing } = await adminSupabase
    .from("auto_signal_positions")
    .select("id, signal_time")
    .eq("symbol",     cleanSymbol)
    .eq("direction",  direction)
    .eq("date_label", dateLabel)
    .maybeSingle()

  if (existing) {
    await logRequest("skipped", 200, body, {
      ip, symbol, signalType: type,
      errorMsg: `duplicate: ${cleanSymbol} ${direction} already exists for ${dateLabel} (id: ${existing.id})`,
    })
    return NextResponse.json({ skipped: true, reason: "duplicate_symbol_date", existing_id: existing.id })
  }

  const { data, error } = await adminSupabase
    .from("auto_signal_positions")
    .insert({
      signal_type:  type,
      symbol:       cleanSymbol,
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

  // 23505 = unique constraint violation (race condition 대비)
  if (error) {
    if (error.code === "23505") {
      await logRequest("skipped", 200, body, { ip, symbol, signalType: type, errorMsg: "duplicate (race)" })
      return NextResponse.json({ skipped: true, reason: "duplicate_race" })
    }
    await logRequest("error", 500, body, { ip, symbol, signalType: type, errorMsg: error.message })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logRequest("ok", 200, body, { ip, symbol, signalType: type })

  return NextResponse.json({ ok: true, id: data.id })
}
