/**
 * lib/binance-klines.ts
 *
 * Binance Futures Klines API를 사용해 특정 날짜의 심볼 종가를 가져옵니다.
 * - 완전 무료, rate limit 1200 req/min
 * - 과거 날짜 응답은 변하지 않으므로 Next.js revalidate 캐시로 Binance 호출을 최소화합니다.
 */

const BINANCE_BASE = "https://fapi.binance.com"

export type DayClose = {
  symbol:     string  // BTCUSDT
  date:       string  // YYYY-MM-DD
  closePrice: number  // 해당 날짜 00:00 UTC 기준 일봉 종가
  openPrice:  number
}

/**
 * 특정 날짜(YYYY-MM-DD, UTC 기준)의 일봉 종가를 반환합니다.
 * 오늘 날짜면 null을 반환합니다 (아직 마감 전).
 */
export async function getDayClose(
  symbol: string,
  dateLabel: string  // YYYY-MM-DD
): Promise<DayClose | null> {
  // 날짜가 오늘이면 종가 없음
  const todayUtc = new Date().toISOString().slice(0, 10)
  if (dateLabel >= todayUtc) return null

  // 해당 날짜의 KST 자정(= UTC 전날 15:00)을 startTime으로 사용
  // date_label은 KST 기준이므로: KST 날짜 00:00 = UTC 전날 15:00
  const kstMidnight = new Date(`${dateLabel}T00:00:00+09:00`)
  const startTime   = kstMidnight.getTime()
  const endTime     = startTime + 24 * 60 * 60 * 1000  // +24h

  const sym = symbol.replace(/\.P$/, "").toUpperCase()
  // .P가 붙은 심볼은 Binance Futures 심볼 — fapi 사용
  const url = `${BINANCE_BASE}/fapi/v1/klines?symbol=${sym}&interval=1d&startTime=${startTime}&endTime=${endTime}&limit=1`

  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },  // 1시간 캐시 — 과거 데이터는 변하지 않음
    })
    if (!res.ok) return null

    const data: [number, string, string, string, string, ...unknown[]][] = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null

    const candle = data[0]
    return {
      symbol:     sym,
      date:       dateLabel,
      openPrice:  parseFloat(candle[1] as string),
      closePrice: parseFloat(candle[4] as string),
    }
  } catch {
    return null
  }
}

/**
 * 여러 심볼의 종가를 병렬로 가져옵니다.
 * Map<symbol, closePrice> 형태로 반환합니다.
 */
export async function getDayCloseMap(
  symbols: string[],
  dateLabel: string
): Promise<Map<string, number>> {
  const unique = [...new Set(symbols.map(s => s.replace(/\.P$/, "").toUpperCase()))]

  const results = await Promise.all(
    unique.map(sym => getDayClose(sym, dateLabel))
  )

  const map = new Map<string, number>()
  for (const r of results) {
    if (r) map.set(r.symbol, r.closePrice)
  }
  return map
}
