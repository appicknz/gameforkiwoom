export const dynamic = "force-dynamic"
/**
 * GET  /api/auto-signal/rebalance             — 기록 목록 (최신순, 5월 31일 이후)
 * POST /api/auto-signal/rebalance             — 날짜별 수익 수동 입력 (UPSERT)
 *   body: { date_label: "YYYY-MM-DD", daily_pnl: number, note?: string }
 * DELETE /api/auto-signal/rebalance?id=N      — 기록 삭제
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

const MASTER_ROLES       = ["master", "admin"]
// 반영 버튼만 허용된 username 목록 (role 승격 없이 POST만 가능)
const CONFIRM_ONLY_USERS = ["mirea2131", "mirea21310"]
const START_DATE         = "2026-05-31"  // 기록 시작일

export async function GET(req: Request) {
  // role을 응답에 포함 — 마스터 여부를 클라이언트에서 판단하기 위해
  const session = await verifySession(req).catch(() => null)
  let role: string | null = null
  if (session?.ok) {
    // JWT에 role 클레임이 있으면 우선 사용, 없으면 DB에서 직접 조회
    if (session.role) {
      role = session.role
    } else {
      const { data: profile } = await adminSupabase
        .from("profiles")
        .select("role")
        .eq("id", session.userId)
        .single()
      role = profile?.role ?? "user"
    }
  }

  const { data, error } = await adminSupabase
    .from("auto_signal_rebalance")
    .select("*")
    .gte("date_label", START_DATE)
    .order("date_label", { ascending: false })
    .limit(365)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ records: data ?? [], role })
}

export async function POST(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status })

  // role이 master/admin이거나, 반영 허용 username 목록에 포함된 경우 허용
  const isMasterRole = MASTER_ROLES.includes(session.role ?? "")
  let isConfirmAllowed = false
  if (!isMasterRole) {
    const { data: prof } = await adminSupabase
      .from("profiles")
      .select("username")
      .eq("id", session.userId)
      .single()
    isConfirmAllowed = CONFIRM_ONLY_USERS.includes((prof as { username?: string } | null)?.username ?? "")
  }
  if (!isMasterRole && !isConfirmAllowed)
    return NextResponse.json({ error: "forbidden" }, { status: 403 })

  const body      = await req.json().catch(() => ({}))
  const { date_label, daily_pnl, note } = body

  if (!date_label || daily_pnl == null)
    return NextResponse.json({ error: "date_label, daily_pnl 필수" }, { status: 400 })

  // 초기 시드 조회
  const { data: cfg } = await adminSupabase
    .from("auto_signal_settings")
    .select("seed_capital")
    .eq("id", 1)
    .single()
  const seedCapital = Number(cfg?.seed_capital ?? 640)

  // 해당 날짜 이전 기록 중 가장 최근 잔고 → 누적 계산 기준
  const { data: prev } = await adminSupabase
    .from("auto_signal_rebalance")
    .select("est_value")
    .gte("date_label", START_DATE)
    .lt("date_label", date_label)
    .order("date_label", { ascending: false })
    .limit(1)
    .single()

  const baseSeed = prev ? Number(prev.est_value) : seedCapital
  const estValue = baseSeed + Number(daily_pnl)

  // UPSERT: 같은 날짜면 덮어씀
  const { data: existing } = await adminSupabase
    .from("auto_signal_rebalance")
    .select("id")
    .eq("date_label", date_label)
    .limit(1)
    .single()

  const payload = {
    date_label,
    seed_capital:  baseSeed,
    est_value:     estValue,
    daily_pnl:     Number(daily_pnl),
    note:          note ?? "",
    rebalanced_at: new Date().toISOString(),
  }

  let result
  if (existing) {
    result = await adminSupabase
      .from("auto_signal_rebalance")
      .update(payload)
      .eq("id", existing.id)
      .select()
      .single()
  } else {
    result = await adminSupabase
      .from("auto_signal_rebalance")
      .insert(payload)
      .select()
      .single()
  }

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
  return NextResponse.json({ ok: true, record: result.data })
}

export async function DELETE(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status })
  if (!MASTER_ROLES.includes(session.role ?? ""))
    return NextResponse.json({ error: "forbidden" }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id 필수" }, { status: 400 })

  const { error } = await adminSupabase
    .from("auto_signal_rebalance")
    .delete()
    .eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
