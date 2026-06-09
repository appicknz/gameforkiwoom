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

  // 청산기록 = is_closed=true 전체 (stop_loss + day_close + manual 모두 포함)
  // 날짜 필터: closed_at을 KST(+9h)로 변환한 날짜 기준
  // date_label은 포지션 생성일이라 청산일과 다를 수 있으므로 사용 안 함
  let query = adminSupabase
    .from("auto_signal_positions")
    .select("*")
    .eq("is_closed", true)

  if (dateFilter) {
    // KST 기준 해당 날 00:00 ~ 23:59:59 → UTC로 역산 (KST = UTC+9)
    const kstStart = new Date(`${dateFilter}T00:00:00+09:00`).toISOString()
    const kstEnd   = new Date(`${dateFilter}T23:59:59+09:00`).toISOString()
    query = query.gte("closed_at", kstStart).lte("closed_at", kstEnd)
  }

  const { data, error } = await query
    .order("closed_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ positions: data ?? [] })
}
