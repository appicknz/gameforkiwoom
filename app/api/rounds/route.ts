import { adminSupabase as admin } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

export async function GET() {
  try {
    const { data: rounds, error } = await admin
      .from("rounds")
      .select("*")
      .order("created_at", { ascending: false })
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
