export const dynamic = "force-dynamic"
/**
 * GET /api/auto-signal/webhook-logs
 * 최근 수신된 웹훅 요청 로그 반환 (성공/실패 모두)
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

  const url   = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 500)
  const since = url.searchParams.get("since") // ISO timestamp — 이것보다 최신만 반환

  let query = adminSupabase
    .from("webhook_request_logs")
    .select("id, received_at, status, status_code, symbol, signal_type, raw_payload, error_msg, ip")
    .order("received_at", { ascending: false })
    .limit(limit)

  if (since) {
    query = query.gt("received_at", since)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ logs: data ?? [] })
}
