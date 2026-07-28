export const dynamic = "force-dynamic"
/**
 * GET /api/auto-signal/snapshots?date=YYYY-MM-DD
 * 특정 날짜의 daily_snapshot 조회.
 * date 없으면 최근 60개 반환.
 */
import "server-only"
import { adminSupabase as _admin } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = _admin as any
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get("date")

  if (date) {
    const { data, error } = await admin
      .from("daily_snapshots")
      .select("*")
      .eq("date_label", date)
      .single()

    if (error && error.code !== "PGRST116") {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ snapshot: data ?? null })
  }

  // 전체 목록 (최근 60일)
  const { data, error } = await admin
    .from("daily_snapshots")
    .select("*")
    .order("date_label", { ascending: false })
    .limit(60)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ snapshots: data ?? [] })
}
