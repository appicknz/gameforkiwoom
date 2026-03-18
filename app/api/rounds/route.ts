import { adminSupabase as admin } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const { data: rounds, error } = await admin
      .from("rounds")
      .select(
        `
        id,
        base_price,
        result_price,
        result_digit,
        baccarat_result,
        started_at,
        ended_at,
        bet_history(bet_direction, bet_digit, bet_parity, result)
      `
      )
      .order("ended_at", { ascending: false })
      .limit(100)

    if (error) throw error

    return NextResponse.json({
      rounds: rounds || [],
    })
  } catch (err) {
    console.error("[v0] Rounds API error:", err)
    return NextResponse.json({ error: "Failed to fetch rounds", rounds: [] }, { status: 500 })
  }
}

