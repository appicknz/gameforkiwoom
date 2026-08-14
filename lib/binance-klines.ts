/**
 * lib/binance-klines.ts
 *
 * Binance Futures Klines API를 사용해 특정 날짜의 심볼 종가를 가져옵니다.
 * - 완전 무료, rate limit 1200 req/min
 * - 과거 날짜 응답은 변하지 않으므로 Next.js revalidate 캐시로 Binance 호출을 최소화합니다.
 */

const BINANCE_FUTURES_BASE = "https://fapi.binance.com"
// data-api.binance.vision: Binance가 공식으로 제공하는, 지역 차단이 없는 시장데이터 미러.
// 배포 리전에 따라 fapi.binance.com/api.binance.com이 451(Restricted Location)로 막히는 경우가 있어
// 이 미러를 1차 소스로 사용하고, 여기 없는 선물 전용 심볼만 fapi로 fallback한다.
const BINANCE_VISION_BASE = "https://data-api.binance.vision"

async function fetchKline(
  base: string,
  path: string,
  sym: string,
  startTime: number,
  endTime: number,
): Promise<[number, string, string, string, string, ...unknown[]][] | null> {
  const url = `${base}${path}?symbol=${sym}&interval=1m&startTime=${startTime}&endTime=${endTime}&limit=1`
  try {
    const res = await fetch(url, {
      next: { revalidate: 3600 },  // 과거 데이터는 변하지 않으므로 1시간 캐시
    })
    if (!res.ok) return null
    const data = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null
    return data
  } catch {
    return null
  }
}

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

  // 1차: 지역 차단 없는 spot 미러 (대부분의 심볼이 현물에도 상장돼 있어 커버됨)
  // 2차: 선물 전용 심볼(예: 1000PEPEUSDT 등)은 spot에 없으므로 fapi로 fallback
  const data =
    (await fetchKline(BINANCE_VISION_BASE, "/api/v3/klines", sym, startTime, endTime)) ??
    (await fetchKline(BINANCE_FUTURES_BASE, "/fapi/v1/klines", sym, startTime, endTime))

  if (!data) return null

  const candle = data[0]
  // 1분봉 close 가격 = KST 23:59~24:00 사이 마지막 체결가
  return {
    symbol:     sym,
    date:       dateLabel,
    openPrice:  parseFloat(candle[1] as string),
    closePrice: parseFloat(candle[4] as string),
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
