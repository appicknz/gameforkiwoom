/**
 * GET /api/user/round-bet-logs?date=YYYY-MM-DD&page=1&game_type=baccarat
 * 나의 라운드별 배팅 현황 조회 — round_bet_logs.bets 배열에서 내 항목 필터
 * 테이블 없으면 bet_history fallback
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import jwt from "jsonwebtoken"

const adminSupabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

function getUserId(req: NextRequest): string | null {
  const auth  = req.headers.get("authorization") ?? ""
  const token = auth.replace("Bearer ", "").trim()
  if (!token) return null
  try {
    const decoded = jwt.verify(token, process.env.SUPABASE_JWT_SECRET!) as { sub?: string }
    return decoded.sub ?? null
  } catch { return null }
}

export async function GET(req: NextRequest) {
  const userId = getUserId(req)
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const date     = searchParams.get("date")       // YYYY-MM-DD (KST)
  const page     = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit    = 10
  const gameType = searchParams.get("game_type")  // "baccarat" | "race" | null
  const offset   = (page - 1) * limit

  // bet_history에서 내 배팅 기록 조회 (round_bet_logs가 없어도 동작)
  let query = adminSupabase
    .from("bet_history")
    .select("id, created_at, bet_direction, bet_digit, bet_parity, bet_amount, payout, result", { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (date) {
    const kstStart = new Date(`${date}T00:00:00+09:00`)
    const kstEnd   = new Date(`${date}T23:59:59+09:00`)
    query = query.gte("created_at", kstStart.toISOString()).lte("created_at", kstEnd.toISOString())
  }

  if (gameType === "race") {
    query = query.like("bet_direction", "race_%")
  } else if (gameType === "baccarat") {
    query = query.or("bet_direction.not.like.race_%,bet_direction.is.null")
  }

  const { data, count } = await query

  return NextResponse.json({
    logs: (data ?? []).map(r => ({
      id:         r.id,
      created_at: r.created_at,
      side:       r.bet_direction ?? "바카라",
      amount:     r.bet_amount,
      payout:     r.payout,
      result:     r.result,
    })),
    total:      count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  })
}
