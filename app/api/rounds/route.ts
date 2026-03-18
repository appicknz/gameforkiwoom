import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// anon 클라이언트 사용 — service role보다 빠르고 statement timeout 없음
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { db: { schema: "public" }, auth: { persistSession: false } }
)

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

