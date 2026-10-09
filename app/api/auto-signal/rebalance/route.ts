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
const CONFIRM_ONLY_USERS = ["mirea2131", "mirea21310", "soltest5"]
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

  const [{ data, error }, { data: adjustments, error: adjustmentsError }] = await Promise.all([
    adminSupabase
      .from("auto_signal_rebalance")
      .select("*")
      .gte("date_label", START_DATE)
      .order("date_label", { ascending: false })
      .limit(365),
    adminSupabase
      .from("auto_signal_capital_adjustments")
      .select("*")
      .gte("date_label", START_DATE)
      .order("created_at", { ascending: false })
      .limit(365),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (adjustmentsError) return NextResponse.json({ error: adjustmentsError.message }, { status: 500 })

  const latestRecord = data?.[0]
  let currentBalance: number | null = latestRecord ? Number(latestRecord.est_value) : null
  if (latestRecord?.rebalanced_at && currentBalance !== null) {
    currentBalance += (adjustments ?? [])
      .filter((row: { created_at: string }) => row.created_at > latestRecord.rebalanced_at)
      .reduce((sum: number, row: { amount: number }) => sum + Number(row.amount), 0)
  }

  return NextResponse.json({ records: data ?? [], adjustments: adjustments ?? [], current_balance: currentBalance, role })
}

export async function POST(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status })

  // role이 master/admin이거나, 반영 허용 username 목록에 포함된 경우 허용
  const isMasterRole = MASTER_ROLES.includes(session.role ?? "")
  const { data: prof } = await adminSupabase
    .from("profiles")
    .select("username")
    .eq("id", session.userId)
    .single()
  const callerUsername = (prof as { username?: string } | null)?.username ?? ""
  const isConfirmAllowed = CONFIRM_ONLY_USERS.includes(callerUsername)
  if (!isMasterRole && !isConfirmAllowed)
    return NextResponse.json({ error: "forbidden" }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const isConfirmAction = body.action === "confirm"
  const isResetAction = body.action === "reset_day"
  if (callerUsername === "soltest5" && !isConfirmAction)
    return NextResponse.json({ error: "soltest5 계정은 자동매매 반영만 가능합니다." }, { status: 403 })

  const date_label = body.date_label

  if (isResetAction) {
    if (!isMasterRole) return NextResponse.json({ error: "forbidden" }, { status: 403 })
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
    if (!date_label || date_label !== today)
      return NextResponse.json({ error: "오늘 매매만 초기화할 수 있습니다." }, { status: 400 })

    // 종료 기록은 마지막에 삭제한다. 앞 단계가 실패하면 매매 차단 상태를 유지해 부분 초기화 후 재진입을 막는다.
    const { count: deletedPositions, error: positionsError } = await adminSupabase
      .from("auto_signal_positions")
      .delete({ count: "exact" })
      .eq("date_label", date_label)
    if (positionsError) return NextResponse.json({ error: positionsError.message }, { status: 500 })

    const { error: stopError } = await adminSupabase
      .from("auto_signal_daily_record_stops")
      .delete()
      .eq("date_label", date_label)
    if (stopError) return NextResponse.json({ error: stopError.message }, { status: 500 })

    const { error: rebalanceError } = await adminSupabase
      .from("auto_signal_rebalance")
      .delete()
      .eq("date_label", date_label)
    if (rebalanceError) return NextResponse.json({ error: rebalanceError.message }, { status: 500 })

    return NextResponse.json({ ok: true, date_label, deleted_positions: deletedPositions ?? 0, daily_pnl: 0 })
  }

  const daily_pnl = body.daily_pnl
  const note = isConfirmAction ? "자동매매 반영" : body.note

  if (!date_label || daily_pnl == null)
    return NextResponse.json({ error: "date_label, daily_pnl 필수" }, { status: 400 })
  if (callerUsername === "soltest5" && date_label !== new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }))
    return NextResponse.json({ error: "오늘 자동매매 수익만 반영할 수 있습니다." }, { status: 403 })

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
    .select("est_value, rebalanced_at")
    .gte("date_label", START_DATE)
    .lt("date_label", date_label)
    .order("date_label", { ascending: false })
    .limit(1)
    .maybeSingle()

  let baseSeed = prev ? Number(prev.est_value) : seedCapital
  if (prev?.rebalanced_at) {
    const { data: pendingAdjustments, error: pendingError } = await adminSupabase
      .from("auto_signal_capital_adjustments")
      .select("amount")
      .gt("created_at", prev.rebalanced_at)
    if (pendingError) return NextResponse.json({ error: pendingError.message }, { status: 500 })
    baseSeed += (pendingAdjustments ?? []).reduce(
      (sum: number, row: { amount: number }) => sum + Number(row.amount),
      0,
    )
  }
  const estValue = baseSeed + Number(daily_pnl)

  const payload = {
    date_label,
    seed_capital:  baseSeed,
    est_value:     estValue,
    daily_pnl:     Number(daily_pnl),
    note:          note ?? "",
    rebalanced_at: new Date().toISOString(),
  }

  // date_label 유니크 인덱스 기반 원자적 UPSERT — 동시 요청이 와도 하루에 한 건만 유지
  const result = await adminSupabase
    .from("auto_signal_rebalance")
    .upsert(payload, { onConflict: "date_label" })
    .select()
    .single()

  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })
  return NextResponse.json({ ok: true, record: result.data })
}

export async function DELETE(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status })

  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("username")
    .eq("id", session.userId)
    .single()
  if ((profile as { username?: string } | null)?.username === "soltest5" || !MASTER_ROLES.includes(session.role ?? ""))
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
