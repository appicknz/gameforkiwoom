export const dynamic = "force-dynamic"
/**
 * GET /api/auto-signal/webhook-logs
 * 최근 수신된 웹훅(포지션) 로그 반환 — 관리자 전용
 * 인증: x-internal-secret 헤더
 */
import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "tasko-internal"

export async function GET(req: Request) {
  const secret = req.headers.get("x-internal-secret")
  if (secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const url    = new URL(req.url)
  const limit  = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200)

  const { data, error } = await adminSupabase
    .from("auto_signal_positions")
    .select("id, signal_type, symbol, direction, entry_price, size_usd, leverage, signal_time, date_label, is_closed, webhook_raw, created_at")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ logs: data ?? [] })
}

/**
 * POST /api/auto-signal/webhook-logs
 * 테스트용 웹훅 전송 — 실제 webhook route로 내부 전달
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-secret")
  if (secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  let body: Record<string, string>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }

  // 내부적으로 실제 webhook route 호출
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000"

  const res = await fetch(`${baseUrl}/api/auto-signal/webhook`, {
    method:  "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-internal-secret": INTERNAL_SECRET,
    },
    body: JSON.stringify(body),
  })

  const result = await res.json()
  return NextResponse.json({ status: res.status, ...result })
}
