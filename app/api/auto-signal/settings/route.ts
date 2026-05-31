export const dynamic = "force-dynamic"
/**
 * GET  /api/auto-signal/settings       — 현재 설정 조회
 * PATCH /api/auto-signal/settings      — 설정 변경 (master 전용)
 *   body: { size_usd?, leverage?, enabled? }
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
    .from("auto_signal_settings")
    .select("*")
    .eq("id", 1)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: Request) {
  const role = getCallerRole(req)
  if (!MASTER_ROLES.includes(role ?? "")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.size_usd  !== undefined) update.size_usd  = Number(body.size_usd)
  if (body.leverage  !== undefined) update.leverage  = Number(body.leverage)
  if (body.enabled   !== undefined) update.enabled   = Boolean(body.enabled)

  const { data, error } = await adminSupabase
    .from("auto_signal_settings")
    .update(update)
    .eq("id", 1)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
