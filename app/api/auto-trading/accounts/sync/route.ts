export const dynamic = "force-dynamic"
/**
 * POST /api/auto-trading/accounts/sync
 * 모든 계정의 base_amount / leverage / stop_loss 를 자동매매 설정값으로 일괄 동기화
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

export async function POST(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status })
  if (!["master"].includes(session.role ?? ""))
    return NextResponse.json({ error: "권한 없음" }, { status: 403 })

  const body = await req.json()
  const { base_amount, leverage, stop_loss_enabled, stop_loss_percent } = body

  if (base_amount == null || leverage == null)
    return NextResponse.json({ error: "base_amount, leverage 필수" }, { status: 400 })

  const update: Record<string, unknown> = {
    base_amount:  Number(base_amount),
    leverage:     Number(leverage),
  }
  if (stop_loss_enabled !== undefined) update.stop_loss_enabled = Boolean(stop_loss_enabled)
  if (stop_loss_percent  !== undefined) update.stop_loss_percent = stop_loss_percent === null ? null : Number(stop_loss_percent)

  const { error } = await adminSupabase
    .from("auto_trading_accounts")
    .update(update)
    .neq("id", 0) // 전체 업데이트

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, updated: update })
}
