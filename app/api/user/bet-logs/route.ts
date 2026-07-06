/**
 * GET /api/user/bet-logs?date=YYYY-MM-DD&page=1&limit=10&game_type=baccarat
 * 내 배팅 현황 조회 — bet_history 기준, 날짜 필터 + 페이징
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
  const auth = req.headers.get("authorization") ?? ""
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
  const date      = searchParams.get("date")      // YYYY-MM-DD (KST)
  const page      = Math.max(1, parseInt(searchParams.get("page") ?? "1"))
  const limit     = Math.min(50, parseInt(searchParams.get("limit") ?? "10"))
  const gameType  = searchParams.get("game_type") // "baccarat" | "race" | null
  const offset    = (page - 1) * limit

  // bet_history에서 조회 — settled 기준 (정산 완료된 배팅만)
  let query = adminSupabase
    .from("bet_history")
    .select(`
      id,
      created_at,
      bet_direction,
      bet_digit,
      bet_parity,
      bet_amount,
      payout,
      result,
      round_id,
      rounds!inner(baccarat_result, started_at, ended_at)
    `, { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (date) {
    // KST 기준 날짜 → UTC 범위
    const kstStart = new Date(`${date}T00:00:00+09:00`)
    const kstEnd   = new Date(`${date}T23:59:59+09:00`)
    query = query
      .gte("created_at", kstStart.toISOString())
      .lte("created_at", kstEnd.toISOString())
  }

  // game_type 필터: bet_direction에 "race_" 접두어가 있으면 레이스
  if (gameType === "baccarat") {
    query = query.not("bet_direction", "like", "race_%").not("bet_direction", "is", null)
    // baccaratSide가 있는 건 bet_direction이 null이고 round_id 존재
  } else if (gameType === "race") {
    query = query.like("bet_direction", "race_%")
  }

  const { data, count, error } = await query

  if (error) {
    // bet_history 조회 실패 시 빈 결과
    return NextResponse.json({ logs: [], total: 0, page, limit })
  }

  return NextResponse.json({
    logs: data ?? [],
    total: count ?? 0,
    page,
    limit,
    totalPages: Math.ceil((count ?? 0) / limit),
  })
}
