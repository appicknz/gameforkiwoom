export const dynamic = "force-dynamic"
/**
 * POST /api/auto-signal/withdraw
 * 실제 현재 잔고(auto_signal_rebalance 최신 est_value)에서 출금액 차감
 * → 오늘 날짜로 auto_signal_rebalance에 음수 daily_pnl 레코드 UPSERT
 * → auto_signal_settings.withdrawn_amount 누적
 */
import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

const MASTER_ROLES = ["master"]

/** KST 기준 오늘 날짜 YYYY-MM-DD */
function todayKST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export async function POST(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status })
  if (!MASTER_ROLES.includes(session.role ?? "")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const amount = Number(body.amount)
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "유효하지 않은 출금 금액입니다." }, { status: 400 })
  }

  // 1. auto_signal_rebalance 최신 레코드에서 현재 잔고 조회
  const { data: latest, error: latestErr } = await adminSupabase
    .from("auto_signal_rebalance")
    .select("est_value, date_label")
    .order("date_label", { ascending: false })
    .limit(1)
    .single()

  if (latestErr || !latest) {
    return NextResponse.json({ error: "현재 잔고를 조회할 수 없습니다." }, { status: 500 })
  }

  const currentBalance = Number(latest.est_value)

  if (amount > currentBalance) {
    return NextResponse.json({
      error: `출금액($${amount.toFixed(2)})이 현재 잔고($${currentBalance.toFixed(2)})를 초과합니다.`,
    }, { status: 400 })
  }

  const newBalance = currentBalance - amount
  const dateLabel  = todayKST()

  // 2. 오늘 날짜로 출금 레코드 UPSERT (daily_pnl = -amount)
  //    같은 날 기록이 있으면 해당 기록에 출금분 반영
  const { data: existing } = await adminSupabase
    .from("auto_signal_rebalance")
    .select("id, daily_pnl, seed_capital")
    .eq("date_label", dateLabel)
    .limit(1)
    .single()

  let upsertResult
  if (existing) {
    // 기존 오늘 기록에 출금분 추가 반영
    const updatedPnl   = Number(existing.daily_pnl) - amount
    const updatedEst   = Number(existing.seed_capital) + updatedPnl
    upsertResult = await adminSupabase
      .from("auto_signal_rebalance")
      .update({
        daily_pnl:     updatedPnl,
        est_value:     updatedEst,
        note:          `출금 -$${amount.toFixed(2)}`,
        rebalanced_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single()
  } else {
    // 오늘 기록 없으면 새로 삽입
    upsertResult = await adminSupabase
      .from("auto_signal_rebalance")
      .insert({
        date_label:    dateLabel,
        seed_capital:  currentBalance,
        est_value:     newBalance,
        daily_pnl:     -amount,
        note:          `출금 -$${amount.toFixed(2)}`,
        rebalanced_at: new Date().toISOString(),
      })
      .select()
      .single()
  }

  if (upsertResult.error) {
    return NextResponse.json({ error: upsertResult.error.message }, { status: 500 })
  }

  // 3. settings.withdrawn_amount 누적 업데이트
  const { data: cfg } = await adminSupabase
    .from("auto_signal_settings")
    .select("withdrawn_amount")
    .eq("id", 1)
    .single()

  const newWithdrawn = Number(cfg?.withdrawn_amount ?? 0) + amount
  await adminSupabase
    .from("auto_signal_settings")
    .update({ withdrawn_amount: newWithdrawn, updated_at: new Date().toISOString() })
    .eq("id", 1)

  return NextResponse.json({
    ok:              true,
    withdrawn:       amount,
    new_balance:     newBalance,
    withdrawn_total: newWithdrawn,
  })
}
