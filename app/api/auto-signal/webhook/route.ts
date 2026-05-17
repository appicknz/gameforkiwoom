export const dynamic = "force-dynamic"
/**
 * POST /api/auto-signal/webhook
 * TradingView / 외부 시그널 서비스에서 호출
 * Body: { alert_type, symbol, price, formatted_time_kst, signal_type, ... }
 *
 * 보안: x-internal-secret 헤더 검증
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "tasko-internal"

export async function POST(req: Request) {
  let body: Record<string, string>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  // 인증: 헤더 OR body.secret (TradingView는 커스텀 헤더 불가)
  const headerSecret = req.headers.get("x-internal-secret") ?? req.headers.get("x-webhook-secret")
  const bodySecret   = body.secret ?? body.webhook_secret
  if (headerSecret !== INTERNAL_SECRET && bodySecret !== INTERNAL_SECRET) {
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
    return NextResponse.json({ error: "missing required fields: signal_type, symbol, price" }, { status: 400 })
  }

  // UP 시그널만 LONG, DOWN은 SHORT
  const direction = type.toUpperCase().includes("DOWN") ? "short" : "long"

  // 자동매매 설정 조회
  const { data: settings } = await adminSupabase
    .from("auto_signal_settings")
    .select("size_usd, leverage, enabled")
    .eq("id", 1)
    .single()

  if (!settings?.enabled) {
    return NextResponse.json({ skipped: true, reason: "auto-signal disabled" })
  }

  // signal_time 파싱: "2026-05-17 10:25:00" KST → UTC
  let signalTime: string
  try {
    const raw = formatted_time_kst ?? new Date().toISOString()
    // KST = UTC+9 이므로 ISO 변환
    signalTime = new Date(raw.replace(" ", "T") + "+09:00").toISOString()
  } catch {
    signalTime = new Date().toISOString()
  }

  const dateLabel = signalTime.slice(0, 10) // YYYY-MM-DD

  const { data, error } = await adminSupabase
    .from("auto_signal_positions")
    .insert({
      signal_type:  type,
      symbol:       symbol.replace(".P", ""), // 선물 심볼 정리
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: data.id })
}
