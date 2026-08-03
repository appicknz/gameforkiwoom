export const dynamic = "force-dynamic"
/**
 * POST /api/auto-signal/deposit
 * 입금 — 오늘 날짜 레코드에 +amount 반영
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
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "유효하지 않은 입금 금액입니다." }, { status: 400 })
  }

  // 1. 최신 잔고 조회
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
  const newBalance     = currentBalance + amount
  const dateLabel      = todayKST()

  // 2. 오늘 날짜 레코드 UPSERT (+daily_pnl)
  const { data: existing } = await adminSupabase
    .from("auto_signal_rebalance")
    .select("id, daily_pnl, seed_capital")
    .eq("date_label", dateLabel)
    .limit(1)
    .single()

  let upsertResult
  if (existing) {
    const updatedPnl = Number(existing.daily_pnl) + amount
    const updatedEst = Number(existing.seed_capital) + updatedPnl
    upsertResult = await adminSupabase
      .from("auto_signal_rebalance")
      .update({
        daily_pnl:     updatedPnl,
        est_value:     updatedEst,
        note:          `입금 +$${amount.toFixed(2)}`,
        rebalanced_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single()
  } else {
    upsertResult = await adminSupabase
      .from("auto_signal_rebalance")
      .insert({
        date_label:    dateLabel,
        seed_capital:  currentBalance,
        est_value:     newBalance,
        daily_pnl:     amount,
        note:          `입금 +$${amount.toFixed(2)}`,
        rebalanced_at: new Date().toISOString(),
      })
      .select()
      .single()
  }

  if (upsertResult.error) {
    return NextResponse.json({ error: upsertResult.error.message }, { status: 500 })
  }

  // 3. settings.seed_capital도 최신값으로 업데이트
  await adminSupabase
    .from("auto_signal_settings")
    .update({ seed_capital: newBalance, updated_at: new Date().toISOString() })
    .eq("id", 1)

  return NextResponse.json({
    ok:          true,
    deposited:   amount,
    new_balance: newBalance,
  })
}
