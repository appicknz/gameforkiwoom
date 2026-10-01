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
      const fallbackResults = await Promise.all(
        missingSymbols.map(async (item, index) => {
          const key = `${mode}:${item}`
          initializedQuotes.add(key)
          // 모의계좌는 초당 호출 제한이 있어 요청을 살짝 분산시키되, 순차 대기 없이 동시에 진행한다
          if (mode === "test" && index > 0) await new Promise(resolve => setTimeout(resolve, index * 150))
          try { return [item, await getKisQuote(item, mode)] as const } catch { initializedQuotes.delete(key); return null }
        })
      )
      const fallbackEntries = fallbackResults.filter((entry): entry is readonly [string, Awaited<ReturnType<typeof getKisQuote>>] => entry !== null)
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
