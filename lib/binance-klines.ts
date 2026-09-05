/**
 * lib/binance-klines.ts
 *
 * Binance Futures Klines API를 사용해 특정 날짜의 심볼 종가를 가져옵니다.
 * - 완전 무료, rate limit 1200 req/min
 * - 과거 날짜 응답은 변하지 않으므로 Next.js revalidate 캐시로 Binance 호출을 최소화합니다.
 */

const BINANCE_BASE = "https://fapi.binance.com"
const BINANCE_PUBLIC_DATA_BASE = "https://data-api.binance.vision"

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
  dateLabel: string  // YYYY-MM-DD (KST 기준)
): Promise<DayClose | null> {
  // 날짜가 오늘(KST 기준)이면 아직 마감 전이므로 종가 없음
  const todayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  if (dateLabel >= todayKST) return null

  // KST 날짜 23:59:00 = 해당 날짜가 바뀌기 직전 1분봉 시가
  // KST 23:59 = UTC 14:59 → endTime으로 해당 1분봉을 pinpoint
  const kstEnd  = new Date(`${dateLabel}T23:59:00+09:00`)  // KST 23:59:00
  const endTime = kstEnd.getTime() + 60_000  // +1분 (해당 봉 포함)
  const startTime = kstEnd.getTime()

  const sym = symbol.replace(/\.P$/, "").toUpperCase()
  const url = `${BINANCE_BASE}/fapi/v1/klines?symbol=${sym}&interval=1m&startTime=${startTime}&endTime=${endTime}&limit=1`

  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },  // 과거 데이터는 변하지 않으므로 1시간 캐시
    })
    if (!res.ok) return null

    const data: [number, string, string, string, string, ...unknown[]][] = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null

    const candle = data[0]
    // 1분봉 close 가격 = KST 23:59~24:00 사이 마지막 체결가
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
export async function getMinuteCloseAfter(symbol: string, targetTime: string) {
  const sym = symbol.replace(/^[A-Z]+:/, "").replace(/\.P$/, "").toUpperCase()
  const targetMs = new Date(targetTime).getTime()
  if (!Number.isFinite(targetMs)) return null

  const startTime = Math.ceil(targetMs / 60_000) * 60_000
  const query = `symbol=${encodeURIComponent(sym)}&interval=1m&startTime=${startTime}&limit=1`
  try {
    let res = await fetch(`${BINANCE_BASE}/fapi/v1/klines?${query}`, { next: { revalidate: 3600 } })
    if (!res.ok) {
      res = await fetch(`${BINANCE_PUBLIC_DATA_BASE}/api/v3/klines?${query}`, { next: { revalidate: 3600 } })
    }
    if (!res.ok) return res.status === 400 ? null : undefined
    const data: [number, string, string, string, string, ...unknown[]][] = await res.json()
    if (!Array.isArray(data) || !data.length) return null
    const closePrice = Number.parseFloat(data[0][4])
    if (!Number.isFinite(closePrice)) return null
    return { symbol: sym, openTime: new Date(data[0][0]).toISOString(), closePrice }
  } catch {
    return undefined
  }
}

export async function getCurrentFuturesPrices(symbols: string[]) {
  const unique = [...new Set(symbols.map((symbol) => symbol.replace(/^[A-Z]+:/, "").replace(/\.P$/, "").toUpperCase()))]
  const results = await Promise.all(unique.slice(0, 50).map(async (symbol) => {
    try {
      let res = await fetch(`${BINANCE_BASE}/fapi/v1/ticker/price?symbol=${encodeURIComponent(symbol)}`, { next: { revalidate: 5 } })
      if (!res.ok) {
        res = await fetch(`${BINANCE_PUBLIC_DATA_BASE}/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`, { next: { revalidate: 5 } })
      }
      if (!res.ok) return null
      const data = await res.json()
      const price = Number.parseFloat(data.price)
      return Number.isFinite(price) ? [symbol, price] as const : null
    } catch {
      return null
    }
  }))
  return new Map(results.filter((item): item is readonly [string, number] => Boolean(item)))
}

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
