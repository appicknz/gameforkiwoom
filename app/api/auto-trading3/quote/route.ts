export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { getKisQuote, subscribeKisQuote, getKisStreamSnapshot, parseKisMode } from "@/lib/kis-domestic"
import { requireAutoTrading3User } from "@/lib/auto-trading3-auth"

export async function GET(req: Request) {
  const access = await requireAutoTrading3User(req)
  if (!access.ok) return access.response
  const url = new URL(req.url)
  const symbol = url.searchParams.get("symbol")
  const mode = parseKisMode(url.searchParams.get("mode"))
  if (!symbol) return NextResponse.json({ snapshots: getKisStreamSnapshot(), configured: Boolean(process.env.KIS_APP_KEY && process.env.KIS_APP_SECRET) })
  try {
    const quote = await getKisQuote(symbol, mode)
    const stream = await subscribeKisQuote(symbol, mode)
    return NextResponse.json({ quote, stream })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "시세 조회 실패", snapshots: getKisStreamSnapshot(mode) }, { status: 502 }) }
}
