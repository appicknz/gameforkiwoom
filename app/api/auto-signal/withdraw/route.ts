export const dynamic = "force-dynamic"
/**
 * POST /api/auto-signal/withdraw
 * 출금은 입금(deposit)과 동일하게 매매 손익/일 마감과 분리해 자본 조정 원장
 * (auto_signal_capital_adjustments)에만 기록한다. (amount는 음수로 저장)
 *
 * 기존에는 날짜별 auto_signal_rebalance 레코드를 직접 수정했는데, 그 경우
 * 과거 날짜로 출금하면 이후 날짜들의 seed_capital/est_value 체인이 갱신되지
 * 않아 "현재 잔고"에 출금이 반영되지 않는 문제가 있었다. 자본 조정 원장 방식은
 * GET /api/auto-signal/rebalance 에서 마지막 확정 기록 이후의 조정액을 항상
 * 합산하므로, 출금 시점과 무관하게 현재 잔고에 즉시 반영된다.
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
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "유효하지 않은 출금 금액입니다." }, { status: 400 })
  }

  const requestedDate = typeof body.date === "string" ? body.date.trim() : ""
  const isValidDate = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)
  const dateLabel = isValidDate ? requestedDate : todayKST()

  const [{ data: settings, error: settingsError }, { data: latest, error: latestError }] = await Promise.all([
    adminSupabase
      .from("auto_signal_settings")
      .select("initial_seed, seed_capital, withdrawn_amount")
      .eq("id", 1)
      .single(),
    adminSupabase
      .from("auto_signal_rebalance")
      .select("est_value, rebalanced_at")
      .order("date_label", { ascending: false })
      .order("rebalanced_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (settingsError) {
    return NextResponse.json({ error: "시드 설정을 조회할 수 없습니다." }, { status: 500 })
  }
  if (latestError) {
    return NextResponse.json({ error: "현재 잔고를 조회할 수 없습니다." }, { status: 500 })
  }

  // 현재 잔고 = 마지막 확정 기록 + 그 이후 자본 조정(입금/출금) 누계
  let balanceBefore = latest ? Number(latest.est_value) : Number(settings.seed_capital ?? settings.initial_seed ?? 0)
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

  if (amount > balanceBefore) {
    return NextResponse.json({
      error: `출금액($${amount.toFixed(2)})이 현재 잔고($${balanceBefore.toFixed(2)})를 초과합니다.`,
    }, { status: 400 })
  }

  const previousInitialSeed = Number(settings.initial_seed ?? settings.seed_capital ?? 0)
  const newInitialSeed = previousInitialSeed - amount
  const newBalance = balanceBefore - amount
  const newWithdrawnTotal = Number(settings.withdrawn_amount ?? 0) + amount

  const { data: adjustment, error: adjustmentError } = await adminSupabase
    .from("auto_signal_capital_adjustments")
    .insert({
      date_label: dateLabel,
      amount: -amount,
      previous_initial_seed: previousInitialSeed,
      new_initial_seed: newInitialSeed,
      balance_before: balanceBefore,
      balance_after: newBalance,
      note: `출금 -$${amount.toFixed(2)}`,
    })
    .select("id")
    .single()

  if (adjustmentError) {
    return NextResponse.json({ error: adjustmentError.message }, { status: 500 })
  }

  const { error: updateError } = await adminSupabase
    .from("auto_signal_settings")
    .update({
      initial_seed:     newInitialSeed,
      seed_capital:     newBalance,
      withdrawn_amount: newWithdrawnTotal,
      updated_at:       new Date().toISOString(),
    })
    .eq("id", 1)

  if (updateError) {
    await adminSupabase.from("auto_signal_capital_adjustments").delete().eq("id", adjustment.id)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    ok:              true,
    withdrawn:       amount,
    new_balance:     newBalance,
    withdrawn_total: newWithdrawnTotal,
  })
}
