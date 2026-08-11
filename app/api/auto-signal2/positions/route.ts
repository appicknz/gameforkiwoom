export const dynamic = "force-dynamic"
/**
 * GET /api/auto-signal2/positions?date=YYYY-MM-DD
 * 자동매매2(역삼1 전용, UP3 제외 신호) 포지션 조회
 * auto_signal_positions(기존 매매기록)와 완전히 분리된 테이블만 조회
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get("date")

  let query = adminSupabase
    .from("auto_signal2_positions")
    .select("*")
    .order("signal_time", { ascending: true })

  if (date) {
    query = query.eq("date_label", date)
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ positions: data ?? [] })
}
