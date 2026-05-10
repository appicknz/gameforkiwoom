export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase as admin } from "@/lib/supabase-admin"

export async function GET() {
  try {
    // 오늘 날짜 기준 game_round_history 집계
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const [bakaRes, raceRes] = await Promise.all([
      admin
        .from("game_round_history")
        .select("total_bet, participant_count, id")
        .eq("game_type", "baccarat")
        .gte("settled_at", todayStart.toISOString()),
      admin
        .from("game_round_history")
        .select("total_bet, participant_count, id")
        .eq("game_type", "race")
        .gte("settled_at", todayStart.toISOString()),
    ])

    const bakaRows = bakaRes.data ?? []
    const raceRows = raceRes.data ?? []

    const baka = {
      rounds:       bakaRows.length,
      totalBet:     bakaRows.reduce((s, r) => s + (r.total_bet ?? 0), 0),
      participants: bakaRows.reduce((s, r) => s + (r.participant_count ?? 0), 0),
    }
    const race = {
      rounds:       raceRows.length,
      totalBet:     raceRows.reduce((s, r) => s + (r.total_bet ?? 0), 0),
      participants: raceRows.reduce((s, r) => s + (r.participant_count ?? 0), 0),
    }

    return NextResponse.json({ baka, race })
  } catch (e) {
    return NextResponse.json({ baka: null, race: null }, { status: 500 })
  }
}
