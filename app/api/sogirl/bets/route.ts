import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const { data: bets, error } = await supabaseAdmin
    .from("bet_history")
    .select(`
      id, user_id, bet_direction, bet_digit, bet_parity,
      bet_amount, payout, result, created_at,
      profiles(username)
    `)
    .order("created_at", { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ bets: bets ?? [] })
}
