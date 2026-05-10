export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase as supabase } from "@/lib/supabase-admin"

export async function GET() {
  try {
    // RPC 함수 호출 — 인덱스를 직접 활용해 timeout 방지
    const { data, error } = await supabase.rpc("get_recent_rounds", { p_limit: 10 })

    if (error) {
      console.error("[v0] Rounds API error:", error)
      return NextResponse.json({ error: "Failed to fetch rounds", rounds: [] }, { status: 500 })
    }

    return NextResponse.json({ rounds: data || [] })
  } catch (err) {
    console.error("[v0] Rounds API error:", err)
    return NextResponse.json({ error: "Failed to fetch rounds", rounds: [] }, { status: 500 })
  }
}

