export const dynamic = "force-dynamic"
/**
 * POST /api/auto-signal/day-close
 * KST 자정(00:00)에 호출 — 활성 포지션을 is_closed=true, close_reason="day_close"로 마킹
 * Vercel Cron: vercel.json에서 "0 15 * * *" (UTC 15:00 = KST 00:00)
 * 또는 트레이드 페이지 자정 트리거로도 호출
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "tasko-internal"

export async function GET(req: Request) {
  // Vercel Cron은 Authorization: Bearer <CRON_SECRET> 헤더를 자동 첨부
  const authHeader = req.headers.get("authorization") ?? ""
  const secret     = req.headers.get("x-internal-secret") ?? authHeader.replace("Bearer ", "")
  const cronSecret = process.env.CRON_SECRET ?? INTERNAL_SECRET
  if (secret !== cronSecret && secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  // KST 어제 날짜 계산 (자정 호출이므로 어제 = 방금 끝난 날)
  const kstNow  = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const kstYest = new Date(kstNow)
  kstYest.setDate(kstYest.getDate() - 1)
  const dateLabel = kstYest.toISOString().slice(0, 10)

  const now = new Date().toISOString()

  const { data, error } = await adminSupabase
    .from("auto_signal_positions")
    .update({ is_closed: true, closed_at: now, close_reason: "day_close" })
    .eq("date_label", dateLabel)
    .eq("is_closed", false)
    .select("id")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, date_label: dateLabel, closed_count: (data ?? []).length })
}
