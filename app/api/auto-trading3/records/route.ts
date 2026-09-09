export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { calculateAutoTrading3Summary } from "@/lib/auto-trading3"
import { requireAutoTrading3User } from "@/lib/auto-trading3-auth"

export async function GET(req: Request) {
  const access = await requireAutoTrading3User(req)
  if (!access.ok) return access.response
  const url = new URL(req.url)
  const date = url.searchParams.get("date")
  let query = adminSupabase.from("auto_trading3_records").select("*").order("signal_time", { ascending: false }).limit(500)
  if (date) query = query.eq("trade_date", date)
  const { data: records, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ records: records ?? [], summary: calculateAutoTrading3Summary((records ?? []) as Array<Record<string, unknown>>) })
}
