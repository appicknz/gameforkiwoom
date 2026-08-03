export const dynamic = "force-dynamic"
/**
 * POST /api/auto-signal/withdraw
 * 현재 잔고(seed_capital)에서 출금액 차감 + withdrawn_amount 누적 + 출금 기록 저장
 */
import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

const MASTER_ROLES = ["master"]

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

  // date_label: 클라이언트가 넘기면 그 날짜 사용, 없으면 KST 오늘
  const dateLabel: string = body.date_label ?? (() => {
    const kst = new Date(Date.now() + 9 * 3600 * 1000)
    return kst.toISOString().slice(0, 10)
  })()

  // 현재 설정 조회
  const { data: cfg, error: cfgErr } = await adminSupabase
    .from("auto_signal_settings")
    .select("seed_capital, withdrawn_amount")
    .eq("id", 1)
    .single()

  if (cfgErr) return NextResponse.json({ error: cfgErr.message }, { status: 500 })

  const currentBalance   = Number(cfg?.seed_capital ?? 0)
  const currentWithdrawn = Number(cfg?.withdrawn_amount ?? 0)

  if (amount > currentBalance) {
    return NextResponse.json({ error: `출금액($${amount.toFixed(2)})이 현재 잔고($${currentBalance.toFixed(2)})를 초과합니다.` }, { status: 400 })
  }

  const newBalance        = currentBalance - amount
  const newWithdrawnTotal = currentWithdrawn + amount

  // 1) 잔고 업데이트
  const { error: updateErr } = await adminSupabase
    .from("auto_signal_settings")
    .update({
      seed_capital:     newBalance,
      withdrawn_amount: newWithdrawnTotal,
      updated_at:       new Date().toISOString(),
    })
    .eq("id", 1)

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  // 2) 출금 기록 삽입
  const { error: insertErr } = await adminSupabase
    .from("auto_signal_withdrawals")
    .insert({ amount, date_label: dateLabel, note: body.note ?? null })

  if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 })

  return NextResponse.json({
    ok:              true,
    withdrawn:       amount,
    new_balance:     newBalance,
    withdrawn_total: newWithdrawnTotal,
    date_label:      dateLabel,
  })
}

// GET: 출금 기록 목록 조회
export async function GET(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status })

  const { data, error } = await adminSupabase
    .from("auto_signal_withdrawals")
    .select("id, amount, date_label, note, created_at")
    .order("date_label", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, withdrawals: data ?? [] })
}
