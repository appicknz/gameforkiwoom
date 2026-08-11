/**
 * POST /api/auto-signal2/stop-loss
 * 자동매매2(역삼1 전용) 스탑로스 청산 전용 엔드포인트
 * body: { id, closed_roi, closed_price }
 * auto_signal_positions(기존 매매기록)에는 영향 없음 — auto_signal2_positions만 갱신
 */
import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}))
  const { id, closed_price } = body

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 })
  }

  const { data: cfg } = await adminSupabase
    .from("auto_signal2_settings")
    .select("stop_loss_pct, size_usd, leverage")
    .eq("id", 1)
    .single()

  const { data: pos } = await adminSupabase
    .from("auto_signal2_positions")
    .select("leverage, size_usd")
    .eq("id", id)
    .single()

  const sizeUsd  = Number(pos?.size_usd ?? cfg?.size_usd ?? 20)
  // 청산 기준: ROI -45% (기존 자동매매와 동일한 고정 기준)
  const fixedRoi = -45
  const fixedPnl = -(sizeUsd * 0.5)
  const fee      = sizeUsd * 0.0006

  const now = new Date().toISOString()

  const { error } = await adminSupabase
    .from("auto_signal2_positions")
    .update({
      is_closed:    true,
      closed_at:    now,
      close_reason: "stop_loss",
      closed_roi:   fixedRoi,
      closed_price: closed_price ?? null,
      final_pnl:    fixedPnl,
      final_roi:    fixedRoi,
      fee:          fee,
    })
    .eq("id", id)
    .eq("is_closed", false)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, closed_roi: fixedRoi, final_pnl: fixedPnl, fee })
}
