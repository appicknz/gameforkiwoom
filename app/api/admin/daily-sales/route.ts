import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"

// GET /api/admin/daily-sales?year=2024&month=12&branch_code=B001&date=2024-12-15
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: me } = await adminSupabase
    .from("profiles").select("role, branch_code").eq("id", auth.userId).single()
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ALLOWED = ["master", "super_admin", "branch_admin", "admin"]
  if (!ALLOWED.includes(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const year = url.searchParams.get("year") ?? new Date().getFullYear().toString()
  const month = url.searchParams.get("month") ?? String(new Date().getMonth() + 1).padStart(2, "0")
  const dateParam = url.searchParams.get("date")
  const branchParam = url.searchParams.get("branch_code")

  const paddedMonth = month.padStart(2, "0")
  const from = `${year}-${paddedMonth}-01`
  const toDate = new Date(Number(year), Number(paddedMonth), 0) // last day of month
  const to = `${year}-${paddedMonth}-${String(toDate.getDate()).padStart(2, "0")}`

  // branch_admin/admin은 자기 지점만
  const effectiveBranch = ["master", "super_admin"].includes(me.role)
    ? (branchParam ?? null)
    : (me.branch_code ?? null)

  // 달력용: 월별 일자별 집계
  let calQuery = adminSupabase
    .from("daily_sales_log")
    .select("log_date, branch_code, charge_count, charge_total, exchange_count, exchange_total, net_total")
    .gte("log_date", from)
    .lte("log_date", to)
    .order("log_date", { ascending: true })

  if (effectiveBranch) calQuery = calQuery.eq("branch_code", effectiveBranch)

  const { data: calData, error: calErr } = await calQuery
  if (calErr) return NextResponse.json({ error: calErr.message }, { status: 500 })

  // 특정 날짜 클릭 시 해당 지점 회원 상세
  let memberDetail = null
  if (dateParam) {
    const branchForDetail = effectiveBranch ?? branchParam
    if (!branchForDetail) {
      return NextResponse.json({ calendar: calData, memberDetail: null })
    }

    // 해당 날짜에 해당 지점에서 충전된 유저들의 게임 기록
    const { data: chargeReqs } = await adminSupabase
      .from("point_charge_requests")
      .select("temp_user_id, temp_username, point_amount, approved_at")
      .eq("branch_code", branchForDetail)
      .eq("status", "approved")
      .gte("approved_at", `${dateParam}T00:00:00`)
      .lte("approved_at", `${dateParam}T23:59:59`)

    const userIds = (chargeReqs ?? []).map((r: any) => r.temp_user_id).filter(Boolean)

    let gameStats: any[] = []
    if (userIds.length > 0) {
      // baka 게임 기록
      const { data: bakaRecs } = await adminSupabase
        .from("bets")
        .select("user_id, round_id, bet_side, payout_multiplier, amount, result, profit, created_at")
        .in("user_id", userIds)
        .gte("created_at", `${dateParam}T00:00:00`)
        .lte("created_at", `${dateParam}T23:59:59`)
        .order("created_at", { ascending: false })

      // race 게임 기록
      const { data: raceRecs } = await adminSupabase
        .from("race_bets")
        .select("user_id, round_id, bet_position, payout_multiplier, amount, result, profit, created_at")
        .in("user_id", userIds)
        .gte("created_at", `${dateParam}T00:00:00`)
        .lte("created_at", `${dateParam}T23:59:59`)
        .order("created_at", { ascending: false })

      // 유저별 통계 집계
      const statsMap: Record<string, any> = {}
      for (const uid of userIds) {
        const chargeInfo = chargeReqs?.find((r: any) => r.temp_user_id === uid)
        statsMap[uid] = {
          userId: uid,
          username: chargeInfo?.temp_username ?? uid,
          chargeAmount: chargeInfo?.point_amount ?? 0,
          totalBets: 0, wins: 0, losses: 0,
          totalWagered: 0, totalProfit: 0,
          winRate: 0, bets: [],
        }
      }

      for (const b of (bakaRecs ?? [])) {
        if (!statsMap[b.user_id]) continue
        const s = statsMap[b.user_id]
        s.totalBets++
        s.totalWagered += b.amount ?? 0
        s.totalProfit += b.profit ?? 0
        if (b.result === "win") s.wins++
        else if (b.result === "lose") s.losses++
        s.bets.push({ ...b, game: "baka" })
      }

      for (const b of (raceRecs ?? [])) {
        if (!statsMap[b.user_id]) continue
        const s = statsMap[b.user_id]
        s.totalBets++
        s.totalWagered += b.amount ?? 0
        s.totalProfit += b.profit ?? 0
        if (b.result === "win") s.wins++
        else if (b.result === "lose") s.losses++
        s.bets.push({ ...b, game: "race" })
      }

      gameStats = Object.values(statsMap).map((s: any) => ({
        ...s,
        winRate: s.totalBets > 0 ? Math.round((s.wins / s.totalBets) * 100) : 0,
      })).sort((a: any, b: any) => b.totalWagered - a.totalWagered)
    }

    memberDetail = {
      date: dateParam,
      branch: branchForDetail,
      members: gameStats,
    }
  }

  return NextResponse.json({ calendar: calData ?? [], memberDetail })
}
