/**
 * POST /api/auto-signal/stop-loss
 * 스탑로스 청산 전용 엔드포인트 — 로그인된 일반 유저도 호출 가능
 * body: { id, closed_roi, closed_price }
 */
import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

export async function POST(req: Request) {
  // lib/auth.ts의 표준 세션 검증 사용
  const session = await verifySession(req)
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status })
  }

  const body = await req.json().catch(() => ({}))
  const { id, closed_roi, closed_price } = body

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 })
  }

  // 포지션의 레버리지와 시스템 SL% 조회 → PNL 금액 고정을 위해
  const { data: pos } = await adminSupabase
    .from("auto_signal_positions")
    .select("leverage, size_usd")
    .eq("id", id)
    .single()

  const { data: cfg } = await adminSupabase
    .from("auto_signal_config")
    .select("stop_loss_pct")
    .order("created_at", { ascending: false })
    .limit(1)
    .single()

  // closed_roi는 SL 임계값으로 고정
  // 예) leverage=10, stop_loss_pct=5 → closed_roi = -(5*10) = -50%
  const leverage     = Number(pos?.leverage ?? 1)
  const stopLossPct  = Number(cfg?.stop_loss_pct ?? 5)
  const fixedRoi     = -(stopLossPct * leverage)   // e.g. -50%

  const now = new Date().toISOString()

  const { error } = await adminSupabase
    .from("auto_signal_positions")
    .update({
      is_closed:    true,
      closed_at:    now,
      close_reason: "stop_loss",
      closed_roi:   fixedRoi,         // SL 임계값으로 고정 (-50%)
      closed_price: closed_price ?? null,
    })
    .eq("id", id)
    .eq("is_closed", false)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 클라이언트에 고정된 ROI 반환해 UI도 즉시 반영
  return NextResponse.json({ ok: true, closed_roi: fixedRoi })
}
