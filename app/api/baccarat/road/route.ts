import { adminSupabase as admin } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const { data: rounds, error } = await admin
      .from("rounds")
      .select("id, baccarat_result, result_digit, ended_at")
      .not("baccarat_result", "is", null)
      .order("ended_at", { ascending: false })
      .limit(200)

    if (error) throw error

    const results = (rounds || []).map((r) => r.baccarat_result as "player" | "banker" | "tie")

    const pCount = results.filter((r) => r === "player").length
    const bCount = results.filter((r) => r === "banker").length
    const tCount = results.filter((r) => r === "tie").length
    const total = results.length

    return NextResponse.json({
      road: results.reverse(), // 오래된 것부터
      stats: {
        total,
        player: pCount,
        banker: bCount,
        tie: tCount,
        playerPct: total > 0 ? Math.round((pCount / total) * 100) : 0,
        bankerPct: total > 0 ? Math.round((bCount / total) * 100) : 0,
        tiePct: total > 0 ? Math.round((tCount / total) * 100) : 0,
      },
    })
  } catch (err) {
    console.error("[v0] BigRoad API error:", err)
    return NextResponse.json({ road: [], stats: { total: 0, player: 0, banker: 0, tie: 0, playerPct: 0, bankerPct: 0, tiePct: 0 } }, { status: 500 })
  }
}
