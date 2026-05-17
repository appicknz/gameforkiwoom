export const dynamic = "force-dynamic"
/**
 * GET  /api/auto-signal/positions?date=YYYY-MM-DD  — 날짜별 포지션 목록
 * DELETE /api/auto-signal/positions  — 삭제 (master 전용)
 *   body: { id } 단건 삭제 | { all: true } 전체 초기화
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import jwt from "jsonwebtoken"

const JWT_SECRET    = process.env.SUPABASE_JWT_SECRET ?? ""
const MASTER_ROLES  = ["master"]

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

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get("date") // YYYY-MM-DD

  let query = adminSupabase
    .from("auto_signal_positions")
    .select("*")
    .order("signal_time", { ascending: false })

  if (date) {
    query = query.eq("date_label", date)
  } else {
    // 기본: 최근 14일
    const since = new Date()
    since.setDate(since.getDate() - 14)
    query = query.gte("date_label", since.toISOString().slice(0, 10))
  }

  const { data, error } = await query.limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ positions: data ?? [] })
}

export async function DELETE(req: Request) {
  const role = getCallerRole(req)
  if (!MASTER_ROLES.includes(role ?? "")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))

  if (body.all === true) {
    // 전체 초기화
    const { error } = await adminSupabase
      .from("auto_signal_positions")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000") // 전체 삭제 트릭
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: "all" })
  }

  if (body.id) {
    const { error } = await adminSupabase
      .from("auto_signal_positions")
      .delete()
      .eq("id", body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: body.id })
  }

  return NextResponse.json({ error: "provide id or all:true" }, { status: 400 })
}
