import { adminSupabase as admin } from "@/lib/supabase-admin"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const limit = parseInt(searchParams.get("limit") ?? "200")
    const date  = searchParams.get("date")

    // btc_closing_prices를 Single Source of Truth로 사용
    // price-server가 카드 합산 시뮬레이션 결과를 baccarat_result로 저장
    // rounds 테이블은 game/settle API의 타이밍 문제로 결과가 어긋남
    let query = admin
      .from("btc_closing_prices")
      .select("time, price, b_score, p_score, baccarat_result")
      .not("baccarat_result", "is", null)
      .order("time", { ascending: false })

    if (date) {
      const fromTs = Math.floor(new Date(`${date}T00:00:00.000Z`).getTime() / 1000)
      const toTs   = Math.floor(new Date(`${date}T23:59:59.999Z`).getTime() / 1000)
      query = query.gte("time", fromTs).lte("time", toTs)
    }

    if (limit > 0) {
      query = query.limit(limit)
    }

    const { data: prices, error } = await query
    if (error) throw error

    // 오래된 것부터 정렬
    const rawRows = (prices || []).reverse()

    function getResult(r: { baccarat_result: string | null }): "player" | "banker" | "tie" {
      return (r.baccarat_result ?? "player") as "player" | "banker" | "tie"
    }

    const results = rawRows.map(getResult)
    const rows = rawRows.map((r) => ({
      result:   getResult(r),
      digit:    Number(r.p_score ?? 0),
      ended_at: new Date(Number(r.time) * 1000).toISOString(),
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
