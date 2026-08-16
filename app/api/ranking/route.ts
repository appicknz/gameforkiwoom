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

type Agg = { gamePnl: number; gameCount: number; tradingPnl: number; tradingCount: number }

// GET /api/ranking?date=YYYY-MM-DD — 바카라 + 레이스 + 트레이딩 통합 손익 랭킹
// date가 있으면 해당 날짜(KST)의 손익만 집계, 없으면 전체 기간 누적 랭킹
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const url = new URL(req.url)
  const date = url.searchParams.get("date") // YYYY-MM-DD (KST)

  if (date) {
    return getDailyRanking(date, auth.userId)
  }

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

async function getDailyRanking(date: string, myUserId: string) {
  const kstStart = new Date(`${date}T00:00:00+09:00`).toISOString()
  const kstEnd = new Date(`${date}T23:59:59.999+09:00`).toISOString()

  const [betsRes, tradesRes] = await Promise.all([
    adminSupabase
      .from("bet_history")
      .select("user_id, bet_amount, payout")
      .gte("created_at", kstStart)
      .lte("created_at", kstEnd),
    adminSupabase
      .from("trade_positions")
      .select("user_id, pnl")
      .eq("status", "closed")
      .gte("closed_at", kstStart)
      .lte("closed_at", kstEnd),
  ])

  if (betsRes.error) return NextResponse.json({ error: betsRes.error.message }, { status: 500 })
  if (tradesRes.error) return NextResponse.json({ error: tradesRes.error.message }, { status: 500 })

  const agg = new Map<string, Agg>()

  for (const b of betsRes.data ?? []) {
    const cur = agg.get(b.user_id) ?? { gamePnl: 0, gameCount: 0, tradingPnl: 0, tradingCount: 0 }
    cur.gamePnl += (b.payout ?? 0) - (b.bet_amount ?? 0)
    cur.gameCount += 1
    agg.set(b.user_id, cur)
  }

  for (const t of tradesRes.data ?? []) {
    const cur = agg.get(t.user_id) ?? { gamePnl: 0, gameCount: 0, tradingPnl: 0, tradingCount: 0 }
    cur.tradingPnl += t.pnl ?? 0
    cur.tradingCount += 1
    agg.set(t.user_id, cur)
  }

  const userIds = [...agg.keys()]
  if (userIds.length === 0) {
    return NextResponse.json({ ranking: [], myRank: null })
  }

  const { data: profiles, error: profilesError } = await adminSupabase
    .from("profiles")
    .select("id, username")
    .in("id", userIds)

  if (profilesError) return NextResponse.json({ error: profilesError.message }, { status: 500 })

  const nameMap = new Map((profiles ?? []).map((p) => [p.id as string, p.username as string | null]))

  const rows = userIds
    .map((userId) => {
      const a = agg.get(userId)!
      return {
        userId,
        username: nameMap.get(userId) ?? "익명",
        gamePnl: a.gamePnl,
        gameCount: a.gameCount,
        tradingPnl: a.tradingPnl,
        tradingCount: a.tradingCount,
        totalPnl: a.gamePnl + a.tradingPnl,
      }
    })
    .sort((a, b) => b.totalPnl - a.totalPnl)
    .slice(0, 100)

  const myIndex = rows.findIndex((r) => r.userId === myUserId)

  return NextResponse.json({
    ranking: rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      username: r.username ?? "익명",
      gamePnl: r.gamePnl,
      gameCount: r.gameCount,
      tradingPnl: r.tradingPnl,
      tradingCount: r.tradingCount,
      totalPnl: r.totalPnl,
      isMe: r.userId === myUserId,
    })),
    myRank: myIndex >= 0 ? myIndex + 1 : null,
  })
}
