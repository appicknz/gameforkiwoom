export const dynamic = "force-dynamic"
/**
 * POST /api/auto-signal/deposit
 * 입금은 매매 손익/일 마감과 분리해 자본 조정 원장에만 기록한다.
 */
import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

const MASTER_ROLES = ["master"]

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
    return NextResponse.json({ error: "유효하지 않은 입금 금액입니다." }, { status: 400 })
  }

  const [{ data: settings, error: settingsError }, { data: latest, error: latestError }] = await Promise.all([
    adminSupabase
      .from("auto_signal_settings")
      .select("initial_seed, seed_capital")
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

  const previousInitialSeed = Number(settings.initial_seed ?? settings.seed_capital ?? 0)
  const newInitialSeed = previousInitialSeed + amount
  const newBalance = balanceBefore + amount

  const { data: adjustment, error: adjustmentError } = await adminSupabase
    .from("auto_signal_capital_adjustments")
    .insert({
      date_label: todayKST(),
      amount,
      previous_initial_seed: previousInitialSeed,
      new_initial_seed: newInitialSeed,
      balance_before: balanceBefore,
      balance_after: newBalance,
      note: `잔고 추가 +$${amount.toFixed(2)}`,
    })
    .select("id")
    .single()

  if (adjustmentError) {
    return NextResponse.json({ error: adjustmentError.message }, { status: 500 })
  }

  const { error: updateError } = await adminSupabase
    .from("auto_signal_settings")
    .update({
      initial_seed: newInitialSeed,
      seed_capital: newBalance,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1)

  if (updateError) {
    await adminSupabase.from("auto_signal_capital_adjustments").delete().eq("id", adjustment.id)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    deposited: amount,
    initial_seed: newInitialSeed,
    new_balance: newBalance,
  })
}
