export const dynamic = "force-dynamic"
import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

export async function GET(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data, error } = await adminSupabase
    .from("game_round_participants")
    .select("id,round_number,game_type,bet_side,bet_amount,applied_odds,payout,profit,result,settled_at")
    .eq("user_id", session.userId)
    .order("settled_at", { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: "기록 조회 실패" }, { status: 500 })

  const records = data ?? []
  const total      = records.length
  const wins       = records.filter((r: any) => r.profit > 0).length
  const totalProfit = records.reduce((sum: number, r: any) => sum + (Number(r.profit) || 0), 0)

  return NextResponse.json({
    records,
    stats: { total, wins, totalProfit },
  })
}
