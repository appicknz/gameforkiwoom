import { adminSupabase as admin } from "@/lib/supabase-admin"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    // limit: 구간 필터 (0 = 전체)
    const limit = parseInt(searchParams.get("limit") ?? "200")
    // date: "YYYY-MM-DD" 형식 날짜 필터 (해당 날짜 00:00~23:59:59 UTC)
    const date = searchParams.get("date")

    let query = admin
      .from("rounds")
      .select("id, baccarat_result, result_digit, ended_at")
      .not("baccarat_result", "is", null)
      .order("ended_at", { ascending: false })

    if (date) {
      const from = `${date}T00:00:00.000Z`
      const to   = `${date}T23:59:59.999Z`
      query = query.gte("ended_at", from).lte("ended_at", to)
    }

    if (limit > 0) {
      query = query.limit(limit)
    }

    const { data: rounds, error } = await query
    if (error) throw error

    const rawRounds = (rounds || []).reverse() // 오래된 것부터
    const results = rawRounds.map((r) => r.baccarat_result as "player" | "banker" | "tie")
    const rows = rawRounds.map((r) => ({
      result: r.baccarat_result as "player" | "banker" | "tie",
      digit: r.result_digit as number,
      ended_at: r.ended_at as string,
    }))

    const pCount = results.filter((r) => r === "player").length
    const bCount = results.filter((r) => r === "banker").length
    const tCount = results.filter((r) => r === "tie").length
    const total  = results.length

    return NextResponse.json({
      road: results,
      rows,   // 상세 페이지용 (결과 + 끝자리 + 시각)
      stats: {
        total,
        player: pCount,
        banker: bCount,
        tie: tCount,
        playerPct: total > 0 ? Math.round((pCount / total) * 100) : 0,
        bankerPct: total > 0 ? Math.round((bCount / total) * 100) : 0,
        tiePct:    total > 0 ? Math.round((tCount / total) * 100) : 0,
      },
    })
  } catch (err) {
    console.error("[v0] BigRoad API error:", err)
    return NextResponse.json({ road: [], rows: [], stats: { total: 0, player: 0, banker: 0, tie: 0, playerPct: 0, bankerPct: 0, tiePct: 0 } }, { status: 500 })
  }
}
