export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { calculateAutoTrading3Summary } from "@/lib/auto-trading3"
import { requireAutoTrading3User } from "@/lib/auto-trading3-auth"
import { getKoreaStockName } from "@/lib/korea-stock-list"

export async function GET(req: Request) {
  const access = await requireAutoTrading3User(req)
  if (!access.ok) return access.response
  const url = new URL(req.url)
  const date = url.searchParams.get("date")
  let query = adminSupabase
    .from("auto_trading3_records")
    .select("*, sell_order_sent_at, sell_order_result")
    .order("signal_time", { ascending: false })
    .limit(500)
  if (date) query = query.eq("trade_date", date)
  const [{ data: records, error }, { data: settings }] = await Promise.all([
    query,
    adminSupabase.from("auto_signal_up8_settings").select("initial_seed").eq("id", 1).maybeSingle(),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const enrichedRecords = await Promise.all((records ?? []).map(async (record) => {
    const mappedName = getKoreaStockName(record.symbol)
    if (mappedName) {
      if (record.symbol_name !== mappedName) {
        await adminSupabase.from("auto_trading3_records").update({ symbol_name: mappedName, updated_at: new Date().toISOString() }).eq("id", record.id)
      }
      return { ...record, symbol_name: mappedName }
    }
    return record
  }))
  return NextResponse.json({ records: enrichedRecords, summary: calculateAutoTrading3Summary(enrichedRecords as Array<Record<string, unknown>>, Number(settings?.initial_seed ?? 2_000_000)) })
}
