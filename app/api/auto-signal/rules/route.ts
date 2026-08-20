export const dynamic = "force-dynamic"
/**
 * GET  /api/auto-signal/rules          — 전체 시그널 규칙 조회
 * PATCH /api/auto-signal/rules         — 규칙 변경 (master 전용)
 *   body: { signal_type, direction?, enabled?, stop_loss_enabled?, stop_loss_percent?, take_profit_enabled?, take_profit_percent? }
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import jwt from "jsonwebtoken"

const JWT_SECRET   = process.env.SUPABASE_JWT_SECRET ?? ""
const MASTER_ROLES = ["master"]

function getCallerRole(req: Request): string | null {
  try {
    const auth  = req.headers.get("authorization") ?? ""
    const token = auth.replace("Bearer ", "").trim()
    if (!token) return null
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>
    return (decoded.role as string) ?? null
  } catch {
    return null
  }
}

export async function GET() {
  const { data, error } = await adminSupabase
    .from("auto_signal_rules")
    .select("*")
    .order("signal_type")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function PATCH(req: Request) {
  const role = getCallerRole(req)
  if (!MASTER_ROLES.includes(role ?? "")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { signal_type, direction, enabled, stop_loss_enabled, stop_loss_percent, take_profit_enabled, take_profit_percent } = body

  if (!signal_type) {
    return NextResponse.json({ error: "signal_type required" }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (direction !== undefined) update.direction = direction
  if (enabled   !== undefined) update.enabled   = Boolean(enabled)
  if (stop_loss_enabled !== undefined) update.stop_loss_enabled = Boolean(stop_loss_enabled)
  if (stop_loss_percent !== undefined) update.stop_loss_percent = stop_loss_percent === null ? null : Number(stop_loss_percent)
  if (take_profit_enabled !== undefined) update.take_profit_enabled = Boolean(take_profit_enabled)
  if (take_profit_percent !== undefined) update.take_profit_percent = take_profit_percent === null ? null : Number(take_profit_percent)

  for (const key of ["stop_loss_percent", "take_profit_percent"]) {
    const value = update[key]
    if (value !== undefined && value !== null && (!Number.isFinite(value as number) || (value as number) <= 0 || (value as number) > 100)) {
      return NextResponse.json({ error: `${key} must be between 0 and 100` }, { status: 400 })
    }
  }

  const { data, error } = await adminSupabase
    .from("auto_signal_rules")
    .upsert({ signal_type, ...update }, { onConflict: "signal_type" })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
