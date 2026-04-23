import { adminSupabase as admin } from "@/lib/supabase-admin"
import { NextRequest, NextResponse } from "next/server"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const limit = parseInt(searchParams.get("limit") ?? "200")
    const date  = searchParams.get("date")

    // btc_closing_prices를 Single Source of Truth로 사용
    // b_raw_sum/p_raw_sum(클라이언트 카드 합산) 또는 b_score/p_score(끝자리)로 직접 결과 계산
    // baccarat_result 컬럼(서버 시뮬레이션)은 신뢰하지 않음
    let query = admin
      .from("btc_closing_prices")
      .select("time, price, b_score, p_score, b_raw_sum, p_raw_sum")
      .not("b_score", "is", null)
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

    // b_raw_sum/p_raw_sum이 있으면 % 10 비교, 없으면 b_score/p_score(이미 끝자리) 비교
    // closing-prices.tsx의 scoreToResult와 완전히 동일한 로직
    function computeResult(r: {
      b_score: number | null; p_score: number | null
      b_raw_sum: number | null; p_raw_sum: number | null
    }): "player" | "banker" | "tie" {
      const bVal = r.b_raw_sum !== null ? r.b_raw_sum : (r.b_score ?? 0)
      const pVal = r.p_raw_sum !== null ? r.p_raw_sum : (r.p_score ?? 0)
      const b = bVal % 10
      const p = pVal % 10
      if (p === b) return "tie"
      return p > b ? "player" : "banker"
    }

    const results = rawRows.map(computeResult)
    const rows = rawRows.map((r) => ({
      result:   computeResult(r),
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
