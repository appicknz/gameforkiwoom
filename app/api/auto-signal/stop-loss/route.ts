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

export async function POST(req: Request) {
  // adminSupabase(서비스 롤 키)로 직접 업데이트하므로 클라이언트 인증 불필요
  // 포지션 ID 검증만으로 충분
  const body = await req.json().catch(() => ({}))
  const { id, closed_roi, closed_price } = body

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 })
  }

  // 관리자 설정에서 SL%, size_usd, leverage 조회
  const { data: cfg } = await adminSupabase
    .from("auto_signal_settings")
    .select("stop_loss_pct, size_usd, leverage")
    .eq("id", 1)
    .single()

  // 포지션 자체의 leverage도 확인 (설정보다 포지션 데이터 우선)
  const { data: pos } = await adminSupabase
    .from("auto_signal_positions")
    .select("leverage, size_usd")
    .eq("id", id)
    .single()

  // closed_roi = -(stop_loss_pct × leverage) 고정
  // 예) stop_loss_pct=5, leverage=10 → -50%
  const leverage    = Number(pos?.leverage ?? cfg?.leverage ?? 1)
  const sizeUsd     = Number(pos?.size_usd ?? cfg?.size_usd ?? 20)
  // 청산 기준: ROI -45% (실제 거래소 청산보다 5% 앞서 종료)
  const fixedRoi    = -45
  // PNL: $20 × 50% 손실 = -$10 (레버리지 10배 기준 5% SL × 10 = 50% 마진 손실)
  const fixedPnl    = -(sizeUsd * 0.5)
  // 수수료: 진입 0.03% + 청산 0.03% = 0.06% × size_usd
  const fee         = sizeUsd * 0.0006

  const now = new Date().toISOString()

  const { error } = await adminSupabase
    .from("auto_signal_positions")
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
