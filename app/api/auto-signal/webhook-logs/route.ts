export const dynamic = "force-dynamic"
import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "tasko-internal"

/** GET /api/auto-signal/webhook-logs — 최근 수신 요청 로그 */
export async function GET(req: Request) {
  const secret = req.headers.get("x-internal-secret")
  if (secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const url   = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "100"), 200)
  const since = url.searchParams.get("since") // ISO 이후 새 항목만

  let query = adminSupabase
    .from("webhook_request_logs")
    .select("id, received_at, status, ip, headers, body_raw, response, error_msg")
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

/** POST /api/auto-signal/webhook-logs — 테스트 웹훅 내부 전달 */
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

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000"

  const res = await fetch(`${baseUrl}/api/auto-signal/webhook`, {
    method:  "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": INTERNAL_SECRET },
    body:    JSON.stringify(body),
  })

  const result = await res.json()
  return NextResponse.json({ status: res.status, ...result })
}
