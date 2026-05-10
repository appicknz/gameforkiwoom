export const dynamic = "force-dynamic"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"

// GET /api/user/trade/history
// 쿼리파람: date=YYYY-MM-DD (optional, 없으면 전체)
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { userId } = auth

  const { searchParams } = new URL(req.url)
  const date = searchParams.get("date") // "2026-05-09"

  let query = adminSupabase
    .from("bet_history")
    .select("id, bet_direction, bet_digit, bet_amount, payout, result, created_at")
    .eq("user_id", userId)
    .like("bet_digit", "trade:%")        // 모의매매 레코드만
    .order("created_at", { ascending: false })
    .limit(500)

  if (date) {
    // 해당 날짜 00:00:00 ~ 23:59:59 KST (UTC+9)
    const start = new Date(`${date}T00:00:00+09:00`).toISOString()
    const end   = new Date(`${date}T23:59:59+09:00`).toISOString()
    query = query.gte("created_at", start).lte("created_at", end)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // bet_digit 파싱: "trade:BTCUSDT:long:10x:80000:81000"
  const rows = (data ?? []).map((row) => {
    const parts = (row.bet_digit ?? "").split(":")
    return {
      id:          row.id,
      symbol:      parts[1] ?? "BTCUSDT",
      direction:   parts[2] ?? row.bet_direction ?? "long",
      leverage:    parseInt(parts[3] ?? "1"),
      entry_price: parseFloat(parts[4] ?? "0"),
      exit_price:  parseFloat(parts[5] ?? "0"),
      bet_amount:  row.bet_amount,
      payout:      row.payout,
      pnl:         row.payout - row.bet_amount,
      result:      row.result,
      created_at:  row.created_at,
    }
  })

  // 날짜별 통계 집계 (전체 조회일 때)
  const byDate: Record<string, { count: number; pnl: number; bet: number }> = {}
  rows.forEach((r) => {
    const d = new Date(r.created_at)
      .toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" })
      .replace(/\. /g, "-").replace(".", "").trim()
    if (!byDate[d]) byDate[d] = { count: 0, pnl: 0, bet: 0 }
    byDate[d].count++
    byDate[d].pnl += r.pnl
    byDate[d].bet += r.bet_amount
  })

  return NextResponse.json({ rows, byDate })
}
