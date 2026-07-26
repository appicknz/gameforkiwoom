export const dynamic = "force-dynamic"
/**
 * GET   /api/auto-trading/settings   — 글로벌 설정 조회
 * PATCH /api/auto-trading/settings   — 글로벌 설정 수정 (master 전용)
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

export async function GET() {
  const { data, error } = await adminSupabase
    .from("auto_trading_global_settings")
    .select("*")
    .eq("id", 1)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status })
  if (session.role !== "master") return NextResponse.json({ error: "forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.webhook_url !== undefined) update.webhook_url = body.webhook_url
  if (body.enabled     !== undefined) update.enabled     = Boolean(body.enabled)

  const { data, error } = await adminSupabase
    .from("auto_trading_global_settings")
    .update(update)
    .eq("id", 1)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
