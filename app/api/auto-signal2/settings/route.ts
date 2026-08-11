export const dynamic = "force-dynamic"
/**
 * GET   /api/auto-signal2/settings   — 현재 설정 조회
 * PATCH /api/auto-signal2/settings   — 설정 변경 (master=역삼1 전용)
 *   body: { size_usd?, leverage?, enabled?, real_order_enabled?, stop_loss_pct? }
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

const MASTER_ROLES = ["master"]

export async function GET() {
  const { data, error } = await adminSupabase
    .from("auto_signal2_settings")
    .select("*")
    .eq("id", 1)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status })
  if (!MASTER_ROLES.includes(session.role ?? "")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.size_usd            !== undefined) update.size_usd            = Number(body.size_usd)
  if (body.leverage            !== undefined) update.leverage            = Number(body.leverage)
  if (body.enabled             !== undefined) update.enabled             = Boolean(body.enabled)
  if (body.real_order_enabled  !== undefined) update.real_order_enabled  = Boolean(body.real_order_enabled)
  if (body.stop_loss_pct       !== undefined) update.stop_loss_pct       = Number(body.stop_loss_pct)

  const { data, error } = await adminSupabase
    .from("auto_signal2_settings")
    .update(update)
    .eq("id", 1)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
