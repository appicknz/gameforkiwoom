export const dynamic = "force-dynamic"
import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"

type RankingRow = {
  user_id: string
  username: string | null
  game_pnl: number
  game_count: number
  trading_pnl: number
  trading_count: number
  total_pnl: number
}

// GET /api/ranking — 바카라 + 레이스 + 트레이딩 통합 손익 랭킹
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await adminSupabase
    .from("combined_ranking")
    .select("user_id, username, game_pnl, game_count, trading_pnl, trading_count, total_pnl")
    .order("total_pnl", { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as RankingRow[]
  const myIndex = rows.findIndex((r) => r.user_id === auth.userId)

  return NextResponse.json({
    ranking: rows.map((r, i) => ({
      rank: i + 1,
      userId: r.user_id,
      username: r.username ?? "익명",
      gamePnl: r.game_pnl,
      gameCount: r.game_count,
      tradingPnl: r.trading_pnl,
      tradingCount: r.trading_count,
      totalPnl: r.total_pnl,
      isMe: r.user_id === auth.userId,
    })),
    myRank: myIndex >= 0 ? myIndex + 1 : null,
  })
}
