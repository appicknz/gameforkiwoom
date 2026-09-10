export const dynamic = "force-dynamic"

const initializedQuotes = new Set<string>()
import { NextResponse } from "next/server"
import { getKisQuote, subscribeKisQuote, subscribeKisQuotes, getKisStreamSnapshot, parseKisMode, normalizeKisSymbol } from "@/lib/kis-domestic"
import { requireAutoTrading3User } from "@/lib/auto-trading3-auth"

export async function GET(req: Request) {
  const access = await requireAutoTrading3User(req)
  if (!access.ok) return access.response
  const url = new URL(req.url)
  const symbol = url.searchParams.get("symbol")
  const symbols = (url.searchParams.get("symbols") ?? "").split(",").map(normalizeKisSymbol).filter(Boolean)
  const mode = parseKisMode(url.searchParams.get("mode"))
  const allowRestFallback = url.searchParams.get("fallback") === "1"
  if (!symbol && symbols.length === 0) return NextResponse.json({ snapshots: getKisStreamSnapshot(), configured: Boolean(process.env.KIS_APP_KEY && process.env.KIS_APP_SECRET) })
  try {
    if (symbols.length > 0) {
      const stream = await subscribeKisQuotes(symbols, mode)
      const missingSymbols = symbols.filter(item => !stream.quotes[item] && !initializedQuotes.has(`${mode}:${item}`))
      const fallbackEntries: Array<readonly [string, Awaited<ReturnType<typeof getKisQuote>>]> = []
      for (const item of missingSymbols) {
        const key = `${mode}:${item}`
        initializedQuotes.add(key)
        try { fallbackEntries.push([item, await getKisQuote(item, mode)] as const) } catch { initializedQuotes.delete(key) }
        if (mode === "test") await new Promise(resolve => setTimeout(resolve, 550))
      }
      const quotes = { ...stream.quotes, ...Object.fromEntries(fallbackEntries) }
      return NextResponse.json({ quotes, stream })
    }
    const stream = await subscribeKisQuote(symbol!, mode)
    const cachedQuote = stream.quote ?? getKisStreamSnapshot(mode)[0]?.quotes.find(item => item.symbol === normalizeKisSymbol(symbol!))?.quote ?? null
    if (cachedQuote || !allowRestFallback) return NextResponse.json({ quote: cachedQuote, stream })
    const quote = await getKisQuote(symbol!, mode)
    return NextResponse.json({ quote, stream: await subscribeKisQuote(symbol!, mode) })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "시세 조회 실패", snapshots: getKisStreamSnapshot(mode) }, { status: 502 }) }
}
