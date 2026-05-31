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
import jwt from "jsonwebtoken"

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? ""

function getCallerId(req: Request): string | null {
  try {
    const auth  = req.headers.get("authorization") ?? ""
    const token = auth.replace("Bearer ", "").trim()
    if (!token) return null
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>
    return (decoded.sub as string) ?? null
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  // 로그인 유저면 누구나 호출 가능 (자신의 포지션 뷰어 역할)
  const callerId = getCallerId(req)
  if (!callerId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const { id, closed_roi, closed_price } = body

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 })
  }

  const now = new Date().toISOString()

  const { error } = await adminSupabase
    .from("auto_signal_positions")
    .update({
      is_closed:    true,
      closed_at:    now,
      close_reason: "stop_loss",
      closed_roi:   closed_roi  ?? null,
      closed_price: closed_price ?? null,
    })
    .eq("id", id)
    .eq("is_closed", false)  // 이미 청산된 건 중복 처리 방지

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
