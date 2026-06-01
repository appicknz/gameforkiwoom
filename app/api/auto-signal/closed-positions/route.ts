export const dynamic = "force-dynamic"
/**
 * GET /api/auto-signal/closed-positions
 *   - 청산된(is_closed=true) 포지션 목록 반환
 *   - query: limit(default 100), offset(default 0)
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const limit      = Math.min(Number(searchParams.get("limit")  ?? 100), 200)
  const offset     = Number(searchParams.get("offset") ?? 0)
  const dateFilter = searchParams.get("date") // 특정 날짜 (YYYY-MM-DD), 없으면 전체

  // 청산기록 = stop_loss로 청산된 것만 (날짜별)
  let query = adminSupabase
    .from("auto_signal_positions")
    .select("*")
    .eq("is_closed", true)
    .eq("close_reason", "stop_loss")

  if (dateFilter) {
    query = query.eq("date_label", dateFilter)
  }

  const { data, error } = await query
    .order("closed_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ positions: data ?? [] })
}
