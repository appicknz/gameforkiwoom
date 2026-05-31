export const dynamic = "force-dynamic"
/**
 * GET  /api/auto-signal/rebalance        — 리밸런싱 기록 목록 (최신순)
 * POST /api/auto-signal/rebalance        — 수동 리밸런싱 스냅샷 저장 (master 전용)
 *   body: { date_label, seed_capital, est_value, daily_pnl, note? }
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

const MASTER_ROLES = ["master", "admin"]

export async function GET() {
  const { data, error } = await adminSupabase
    .from("auto_signal_rebalance")
    .select("*")
    .order("rebalanced_at", { ascending: false })
    .limit(365)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ records: data ?? [] })
}

export async function POST(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status })
  }
  if (!MASTER_ROLES.includes(session.role ?? "")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { date_label, seed_capital, est_value, daily_pnl, note } = body

  if (!date_label || est_value == null || seed_capital == null || daily_pnl == null) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 })
  }

  const { data, error } = await adminSupabase
    .from("auto_signal_rebalance")
    .insert({
      date_label:   date_label,
      seed_capital: Number(seed_capital),
      est_value:    Number(est_value),
      daily_pnl:    Number(daily_pnl),
      note:         note ?? "",
      rebalanced_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // seed_capital을 settings에도 업데이트 (다음 날 기준 시드로)
  await adminSupabase
    .from("auto_signal_settings")
    .update({ seed_capital: Number(est_value) })
    .eq("id", 1)

  return NextResponse.json({ ok: true, record: data })
}
