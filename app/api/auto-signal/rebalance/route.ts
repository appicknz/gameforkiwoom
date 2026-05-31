export const dynamic = "force-dynamic"
/**
 * GET  /api/auto-signal/rebalance        — 리밸런싱 기록 목록 (최신순)
 * POST /api/auto-signal/rebalance        — 수동 리밸런싱 스냅샷 저장 (master 전용)
 *   body: { date_label, seed_capital, est_value, daily_pnl, note? }
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

const MASTER_ROLES = ["master", "admin"]

export async function GET() {
  const { data, error } = await adminSupabase
    .from("auto_signal_rebalance")
    .select("*")
    .order("rebalanced_at", { ascending: false })
    .limit(365)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ records: data ?? [] })
}

export async function POST(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status })
  }
  if (!MASTER_ROLES.includes(session.role ?? "")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const body    = await req.json().catch(() => ({}))
  const { note } = body

  const now       = new Date()
  const dateLabel = now.toISOString().slice(0, 10) // "2025-05-31"

  // 이미 오늘 기록이 있으면 덮어쓰지 않음
  const { data: existing } = await adminSupabase
    .from("auto_signal_rebalance")
    .select("id")
    .eq("date_label", dateLabel)
    .limit(1)
    .single()

  if (existing) {
    return NextResponse.json({ error: "오늘 날짜 기록이 이미 존재합니다." }, { status: 409 })
  }

  // 관리자 설정 조회
  const { data: cfg } = await adminSupabase
    .from("auto_signal_settings")
    .select("seed_capital, stop_loss_pct, size_usd, leverage")
    .eq("id", 1)
    .single()

  const seedCapital = Number(cfg?.seed_capital ?? 640)
  const stopLossPct = Number(cfg?.stop_loss_pct ?? 5)
  const sizeUsd     = Number(cfg?.size_usd ?? 10)
  const leverage    = Number(cfg?.leverage ?? 10)

  // 오늘 SL 청산 PNL (설정값 기준 고정)
  const { data: slPos } = await adminSupabase
    .from("auto_signal_positions")
    .select("leverage, size_usd")
    .eq("date_label", dateLabel)
    .eq("close_reason", "stop_loss")
    .eq("is_closed", true)

  const slPnl = (slPos ?? []).reduce((s: number, p: { leverage: number; size_usd: number }) => {
    const lev  = Number(p.leverage ?? leverage)
    const size = Number(p.size_usd ?? sizeUsd)
    return s - (size * stopLossPct * lev / 100)
  }, 0)

  // 오늘 활성 포지션 수 기반 마진 (실시간 PNL 없이 마진만 반영)
  const { data: activePosData } = await adminSupabase
    .from("auto_signal_positions")
    .select("size_usd")
    .eq("date_label", dateLabel)
    .eq("is_closed", false)

  const marginTotal = (activePosData ?? []).reduce((s: number, p: { size_usd: number }) =>
    s + Number(p.size_usd ?? sizeUsd), 0)

  const dailyPnl = slPnl  // 수동 스냅샷은 SL 손실만 반영 (활성 포지션 PNL은 실시간이라 제외)
  const estValue = seedCapital + marginTotal + dailyPnl

  const { data, error } = await adminSupabase
    .from("auto_signal_rebalance")
    .insert({
      date_label:    dateLabel,
      seed_capital:  seedCapital,
      est_value:     estValue,
      daily_pnl:     dailyPnl,
      note:          note ?? "수동 리밸런싱",
      rebalanced_at: now.toISOString(),
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, est_value: estValue, daily_pnl: dailyPnl, record: data })
}
