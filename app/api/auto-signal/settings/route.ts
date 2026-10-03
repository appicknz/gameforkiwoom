export const dynamic = "force-dynamic"
/**
 * GET  /api/auto-signal/settings       — 현재 설정 조회
 * PATCH /api/auto-signal/settings      — 설정 변경 (master 전용)
 *   body: { size_usd?, leverage?, enabled? }
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

const MASTER_ROLES = ["master"]

export async function GET() {
  const { data, error } = await adminSupabase
    .from("auto_signal_settings")
    .select("*")
    .eq("id", 1)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status })
  if (!MASTER_ROLES.includes(session.role ?? "")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  // 초기 시드 직접 수정은 ROI 기준값 정정용이다. 실제 입금은 deposit API에서 별도 원장에 기록한다.
  if (body.initial_seed !== undefined) {
    const nextSeed = Number(body.initial_seed)
    if (!Number.isFinite(nextSeed) || nextSeed <= 0) {
      return NextResponse.json({ error: "유효하지 않은 초기 시드입니다." }, { status: 400 })
    }
    update.initial_seed = nextSeed
  }

  if (body.size_usd      !== undefined) update.size_usd      = Number(body.size_usd)
  if (body.leverage      !== undefined) update.leverage      = Number(body.leverage)
  if (body.enabled       !== undefined) update.enabled       = Boolean(body.enabled)
  if (body.real_order_enabled !== undefined) update.real_order_enabled = Boolean(body.real_order_enabled)
  if (body.stop_loss_pct    !== undefined) update.stop_loss_pct    = body.stop_loss_pct === null ? null : Number(body.stop_loss_pct)
  // 일일 손익 한도(달러) — 도달 시 자동으로 금일매매 종료(반영)됨. null이면 비활성.
  if (body.day_loss_limit_usd   !== undefined) update.day_loss_limit_usd   = body.day_loss_limit_usd   === null ? null : Number(body.day_loss_limit_usd)
  if (body.day_profit_limit_usd !== undefined) update.day_profit_limit_usd = body.day_profit_limit_usd === null ? null : Number(body.day_profit_limit_usd)
  if (body.seed_capital !== undefined && body.initial_seed === undefined) {
    update.seed_capital = Number(body.seed_capital)
  }
  if (body.initial_seed !== undefined) update.initial_seed = Number(body.initial_seed)
  if (body.withdrawn_amount !== undefined) update.withdrawn_amount = Number(body.withdrawn_amount)
  if (body.profit_dist      !== undefined) update.profit_dist      = body.profit_dist
  if (body.show_profit_dist !== undefined) update.show_profit_dist = Boolean(body.show_profit_dist)

  const { data, error } = await adminSupabase
    .from("auto_signal_settings")
    .update(update)
    .eq("id", 1)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
