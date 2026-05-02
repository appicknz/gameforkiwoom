import "server-only"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { requireAdmin } from "@/lib/auth"
import { cookies } from "next/headers"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/distributor-pnl
 *
 * 쿼리 파라미터:
 *   ?target_id=uuid  → 마스터가 특정 총판 조회
 *   ?all=1           → 마스터가 전체 총판 목록 조회
 *   ?period=month    → 이번달 | ?period=last_month → 지난달 | 없으면 전체
 *
 * 손익 계산:
 *   수익  = 요율차익(point-cash, 승인건) + 수수료(fee_logs)
 *   지출  = 환전지급(exchange_requests 승인건)
 *   순손익 = 수익 - 지출
 */
export async function GET(req: Request) {
  const cookieStore = await cookies()
  const token =
    req.headers.get("Authorization")?.replace("Bearer ", "") ??
    cookieStore.get("app_token")?.value ??
    ""

  // pw 파라미터로 마스터 직접 인증 허용 (mas 페이지 호환)
  const pw = searchParams.get("pw")
  const masterPw = process.env.SUPER_ADMIN_PASSWORD
  const isMasterByPw = pw && masterPw && pw === masterPw

  const auth = isMasterByPw ? { userId: process.env.SUPER_ADMIN_ID ?? "", role: "master" } : await requireAdmin(token)
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const targetId = searchParams.get("target_id")
  const all      = searchParams.get("all") === "1"
  const period   = searchParams.get("period") // "month" | "last_month" | null

  // 기간 필터
  const now      = new Date()
  let periodFrom: string | null = null
  let periodTo:   string | null = null

  if (period === "month") {
    periodFrom = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    periodTo   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString()
  } else if (period === "last_month") {
    periodFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()
    periodTo   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString()
  }

  // 조회 대상 결정
  const isMaster = auth.role === "master"

  if (all && isMaster) {
    // 마스터: 전체 총판(super_admin) 목록 손익 합산
    const { data: distributors } = await adminSupabase
      .from("profiles")
      .select("id, username, branch_id")
      .in("role", ["super_admin", "admin"])
      .order("username")

    if (!distributors) return NextResponse.json({ pnl: [] })

    const pnlList = await Promise.all(
      distributors.map(async (d) => {
        const pnl = await calcPnl(d.id, periodFrom, periodTo)
        return { ...d, ...pnl }
      })
    )
    return NextResponse.json({ pnl: pnlList })
  }

  // 본인 또는 마스터가 특정 총판 조회
  const subjectId = (isMaster && targetId) ? targetId : auth.userId
  const pnl = await calcPnl(subjectId, periodFrom, periodTo)

  // 현재 잔고
  const { data: balRow } = await adminSupabase
    .from("balances")
    .select("amount")
    .eq("user_id", subjectId)
    .maybeSingle()

  const { data: cashRow } = await adminSupabase
    .from("cash_balances")
    .select("amount")
    .eq("user_id", subjectId)
    .maybeSingle()

  return NextResponse.json({
    ...pnl,
    balance:      balRow?.amount  ?? 0,
    cash_balance: cashRow?.amount ?? 0,
  })
}

// ── 핵심 손익 계산 함수 ────────────────────────────────────────────
async function calcPnl(
  userId: string,
  from: string | null,
  to:   string | null
): Promise<{
  rate_profit:     number
  fee_total:       number
  exchange_payout: number
  net_pnl:         number
}> {
  // 1. 요율차익: 본인이 직접 충전 요청해 승인된 건 (point - cash)
  let ppQuery = adminSupabase
    .from("point_purchase_requests")
    .select("cash_amount, point_amount")
    .eq("requester_id", userId)
    .eq("status", "approved")

  if (from) ppQuery = ppQuery.gte("created_at", from)
  if (to)   ppQuery = ppQuery.lte("created_at", to)

  const { data: ppRows } = await ppQuery
  const rate_profit = (ppRows ?? []).reduce(
    (sum, r) => sum + ((r.point_amount ?? 0) - (r.cash_amount ?? 0)),
    0
  )

  // 2. 수수료: 산하 지점들(branch_id = userId)의 fee_logs 합산
  //    OR 본인 branch_id 매핑된 지점들
  let feeQuery = adminSupabase
    .from("fee_logs")
    .select("fee_amount")
    .eq("branch_id", userId)

  if (from) feeQuery = feeQuery.gte("created_at", from)
  if (to)   feeQuery = feeQuery.lte("created_at", to)

  const { data: feeRows } = await feeQuery
  const fee_total = (feeRows ?? []).reduce(
    (sum, r) => sum + (r.fee_amount ?? 0),
    0
  )

  // 3. 환전 지급: 본인이 승인자(approver)이거나 산하 지점 유저들의 환전
  //    exchange_requests에 approver_id 컬럼이 있으면 그걸로, 없으면 target_user_id 기준 산하 유저
  //    현재 스키마: requester_id(유저), target_user_id(지점관리자가 선택한 유저)
  //    총판 입장에서는 산하 지점관리자(branch_id = userId)가 승인한 환전액 합산
  const { data: branchAdmins } = await adminSupabase
    .from("profiles")
    .select("id")
    .eq("branch_id", userId)
    .in("role", ["branch_admin", "admin"])

  const branchAdminIds = (branchAdmins ?? []).map((b) => b.id)

  let exchangePayout = 0
  if (branchAdminIds.length > 0) {
    let exQuery = adminSupabase
      .from("exchange_requests")
      .select("point_amount")
      .in("target_user_id", branchAdminIds)
      .eq("status", "approved")

    if (from) exQuery = exQuery.gte("created_at", from)
    if (to)   exQuery = exQuery.lte("created_at", to)

    const { data: exRows } = await exQuery
    exchangePayout = (exRows ?? []).reduce(
      (sum, r) => sum + (r.point_amount ?? 0),
      0
    )
  }

  // 직접 자기 자신이 지급한 환전도 포함 (branch_admin이 본인인 경우)
  let selfExQuery = adminSupabase
    .from("exchange_requests")
    .select("point_amount")
    .eq("target_user_id", userId)
    .eq("status", "approved")

  if (from) selfExQuery = selfExQuery.gte("created_at", from)
  if (to)   selfExQuery = selfExQuery.lte("created_at", to)

  const { data: selfExRows } = await selfExQuery
  const selfExchangePayout = (selfExRows ?? []).reduce(
    (sum, r) => sum + (r.point_amount ?? 0),
    0
  )
  const exchange_payout = exchangePayout + selfExchangePayout

  const net_pnl = rate_profit + fee_total - exchange_payout

  return { rate_profit, fee_total, exchange_payout, net_pnl }
}
