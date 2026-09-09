export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { calculateAutoTrading3Summary } from "@/lib/auto-trading3"

export async function GET(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status })
  if (session.role !== "master") return NextResponse.json({ error: "forbidden" }, { status: 403 })
  const url = new URL(req.url)
  const date = url.searchParams.get("date")
  let query = adminSupabase.from("auto_trading3_records").select("*").order("signal_time", { ascending: false }).limit(500)
  if (date) query = query.eq("trade_date", date)
  const { data: records, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ records: records ?? [], summary: calculateAutoTrading3Summary((records ?? []) as Array<Record<string, unknown>>) })
}
