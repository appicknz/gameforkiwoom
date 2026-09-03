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

  // 초기 시드 조정은 일별 매매 손익과 완전히 분리된 자본 조정 원장에만 기록한다.
  if (body.initial_seed !== undefined) {
    const nextSeed = Number(body.initial_seed)
    if (!Number.isFinite(nextSeed) || nextSeed <= 0) {
      return NextResponse.json({ error: "유효하지 않은 초기 시드입니다." }, { status: 400 })
    }

    const { data: current } = await adminSupabase
      .from("auto_signal_settings")
      .select("initial_seed, seed_capital")
      .eq("id", 1)
      .single()
    const previousSeed = Number(current?.initial_seed ?? 0)
    const delta = nextSeed - previousSeed

    if (delta !== 0) {
      const { data: latest } = await adminSupabase
        .from("auto_signal_rebalance")
        .select("est_value, rebalanced_at")
        .order("date_label", { ascending: false })
        .order("rebalanced_at", { ascending: false })
        .limit(1)
        .maybeSingle()

      let balanceBefore = latest ? Number(latest.est_value) : Number(current?.seed_capital ?? previousSeed)
      if (latest?.rebalanced_at) {
        const { data: pendingAdjustments, error: pendingError } = await adminSupabase
          .from("auto_signal_capital_adjustments")
          .select("amount")
          .gt("created_at", latest.rebalanced_at)
        if (pendingError) return NextResponse.json({ error: pendingError.message }, { status: 500 })
        balanceBefore += (pendingAdjustments ?? []).reduce(
          (sum: number, row: { amount: number }) => sum + Number(row.amount),
          0,
        )
      }

      const balanceAfter = balanceBefore + delta
      const { error: adjustmentError } = await adminSupabase
        .from("auto_signal_capital_adjustments")
        .insert({
          date_label: new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10),
          amount: delta,
          previous_initial_seed: previousSeed,
          new_initial_seed: nextSeed,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          note: `초기 시드 조정 ${delta >= 0 ? "+" : ""}$${delta.toFixed(2)}`,
        })
      if (adjustmentError) return NextResponse.json({ error: adjustmentError.message }, { status: 500 })

      update.seed_capital = balanceAfter
    }
    update.initial_seed = nextSeed
  }

  if (body.size_usd      !== undefined) update.size_usd      = Number(body.size_usd)
  if (body.leverage      !== undefined) update.leverage      = Number(body.leverage)
  if (body.enabled       !== undefined) update.enabled       = Boolean(body.enabled)
  if (body.real_order_enabled !== undefined) update.real_order_enabled = Boolean(body.real_order_enabled)
  if (body.stop_loss_pct    !== undefined) update.stop_loss_pct    = body.stop_loss_pct === null ? null : Number(body.stop_loss_pct)
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
