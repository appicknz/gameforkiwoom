import "server-only"

export type SignalEnrichment = {
  volume_ratio_24h: number | null
  volume_24h_value: number | null
  trading_value: number | null
  volume_ratio_source: "payload" | "binance" | "binance-futures" | "binance-spot-fallback" | "unavailable"
  fire_count: number
  fire_volume_score: number | null
  fire_confluence_score: number | null
  signal_state: "CONFIRM" | "PULLBACK" | "EXTENSION" | "IMPULSE" | "EXHAUSTION" | "NEUTRAL"
  trade_bias: "long" | "short" | "neutral"
  signal_score: number
  signal_grade: "A" | "B" | "C" | "D"
  trade_guide: "분할 진입 고려" | "조건 충족 시 진입" | "분할 익절/관리" | "관찰 대기" | "회피/관망" | "관망"
  risk_flags: string[]
  enrichment_version: string
}

const ENRICHMENT_VERSION = "signal-enrichment-v2-python-parity"
const MAX_FIRE_COUNT = 5
const BINANCE_VOLUME_CACHE_TTL_MS = 30_000
const binanceVolumeCache = new Map<string, { value: number; expiresAt: number }>()
const FIRE_RATIO_THRESHOLDS: Array<[number, number]> = [[20, 5], [10, 4], [5, 3], [3, 2], [0.1, 1]]

const numberValue = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""))
  return Number.isFinite(parsed) ? parsed : null
}

const textValue = (value: unknown): string | null => {
  if (value == null || value === "") return null
  return typeof value === "string" ? value.trim() : String(value)
}

const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {}

export function normalizeEnrichmentSymbol(value: unknown) {
  return (textValue(value) ?? "").toUpperCase().replace(/^BINANCE:/, "").replace(/\.P$/, "")
}

function firstNumber(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = numberValue(payload[key])
    if (value != null) return value
  }
  return null
}

function scoreFire(volumeRatio: number | null, confluence: number | null) {
  const volumeScore = volumeRatio == null ? null : FIRE_RATIO_THRESHOLDS.find(([threshold]) => volumeRatio >= threshold)?.[1] ?? 0
  const confluenceScore = confluence == null ? null : Math.max(0, Math.min(MAX_FIRE_COUNT, Math.round(confluence)))
  const fireCount = volumeScore == null && confluenceScore == null
    ? 1
    : Math.min(MAX_FIRE_COUNT, Math.max(1, Math.round(((volumeScore ?? 0) + (confluenceScore ?? 0)) / (volumeScore != null && confluenceScore != null ? 2 : 1))))
  return { volumeScore, confluenceScore, fireCount }
}

function payloadValue(payload: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = payload[key]
    if (value != null && value !== "") return value
  }
  return null
}

export function buildSignalEnrichment(payload: Record<string, unknown>, market: { volume24h?: number | null; source?: "payload" | "binance" | "binance-futures" | "binance-spot-fallback" | "unavailable" } = {}): SignalEnrichment {
  const rawBollinger = payload.bollinger_band ?? payload.bollinger
  const bb = typeof rawBollinger === "string"
    ? (() => {
        try { return asRecord(JSON.parse(rawBollinger)) } catch { return {} }
      })()
    : asRecord(rawBollinger)
  const direction = String(payload.signal_type ?? payload.alert_type ?? "").toUpperCase().includes("DOWN") ? "short" : "long"
  const cci = firstNumber(payload, ["cci"])
  const confluence = firstNumber(payload, ["confluence"])
  const priceChange = firstNumber(payload, ["price_change_percent", "price_change"])
  const volumeRatioPayload = firstNumber(payload, ["24h_volume_ratio", "volume_ratio_24h", "volume_ratio"])
  const volume24h = firstNumber(payload, ["volume_24h", "volume_24h_value", "quote_volume_24h"]) ?? market.volume24h ?? null
  const price = firstNumber(payload, ["price"])
  const volume = firstNumber(payload, ["volume"])
  const tradingValue = firstNumber(payload, ["trading_value", "current_trading_value"]) ?? (price != null && volume != null ? price * volume : null)
  const volumeRatio = volumeRatioPayload ?? (tradingValue != null && volume24h != null && volume24h > 0 ? tradingValue / volume24h * 100 : null)
  const ratioSource = volumeRatioPayload != null ? "payload" : volumeRatio != null && market.source ? market.source : "unavailable"
  const fire = scoreFire(volumeRatio, confluence)
  const currentVolume = firstNumber(payload, ["volume", "current_volume", "current_candle_volume"])
  const previousVolume = firstNumber(payload, ["prev_volume", "previous_volume", "previous_candle_volume", "reference_volume"])
  const derivedVolumeChange = currentVolume != null && previousVolume != null && previousVolume > 0
    ? (currentVolume - previousVolume) / previousVolume * 100
    : null
  const volumeChange = firstNumber(payload, ["volume_change", "volume_change_percent"]) ?? derivedVolumeChange ?? 0
  const cciValue = cci ?? 0
  const cciMagnitude = Math.abs(cciValue)
  const confluenceValue = confluence ?? 1
  const priceChangeValue = Math.abs(priceChange ?? 0)
  let score = 0
  if (cciMagnitude >= 200) score += 50
  else if (cciMagnitude >= 150) score += 40
  else if (cciMagnitude >= 100) score += 30
  else if (cciMagnitude >= 50) score += 20
  else if (cciMagnitude > 0) score += 10
  else score += 5
  if (volumeChange < -50) score -= 30
  else if (volumeChange < -30) score -= 20
  else if (volumeChange > 100) score += 25
  else if (volumeChange > 50) score += 15
  else if (volumeChange > 20) score += 10
  score += fire.fireCount * 10
  score += (confluenceValue - 1) * 5
  const boolValue = (value: unknown) => value === true || value === 1 || String(value).toLowerCase() === "true"
  if (boolValue(bb.upper_breakout)) score += 25
  if (boolValue(bb.expansion)) score += 10
  if (boolValue(bb.squeeze)) score -= 5
  if (boolValue(bb.middle_cross)) score += 15
  if (priceChangeValue >= 10) score += 20
  else if (priceChangeValue >= 5) score += 10
  else if (priceChangeValue >= 3) score += 5
  const signalState = score >= 100 ? "EXHAUSTION" : score >= 70 ? "EXTENSION" : score >= 40 && priceChangeValue >= 3 ? "IMPULSE" : score >= 30 && confluenceValue >= 2 ? "CONFIRM" : score >= 10 && score < 30 ? "PULLBACK" : "NEUTRAL"
  const stateMeta = ({
    CONFIRM: { risk: "변동성 확대", guide: "분할 진입 고려" },
    PULLBACK: { risk: "되돌림 실패", guide: "조건 충족 시 진입" },
    EXTENSION: { risk: "추격 매수", guide: "분할 익절/관리" },
    IMPULSE: { risk: "추세 착각", guide: "관찰 대기" },
    EXHAUSTION: { risk: "급락 가능성", guide: "회피/관망" },
    NEUTRAL: { risk: "비효율 매매", guide: "관망" },
  } as const)[signalState]
  const signalGrade = score >= 100 ? "A" : score >= 70 ? "B" : score >= 40 ? "C" : "D"
  const riskFlags: string[] = [stateMeta.risk]
  if (boolValue(bb.squeeze)) riskFlags.push("볼린저 스퀴즈")
  if (boolValue(bb.upper_breakout) || boolValue(bb.lower_breakout)) riskFlags.push("볼린저 돌파")
  if (volumeChange < -30) riskFlags.push("거래량 감소")
  if (cciValue >= 200) riskFlags.push("CCI 극도 과열")
  const tradeGuide = stateMeta.guide
  return {
    volume_ratio_24h: volumeRatio,
    volume_24h_value: volume24h,
    trading_value: tradingValue,
    volume_ratio_source: ratioSource,
    fire_count: Math.min(MAX_FIRE_COUNT, Math.max(1, fire.fireCount ?? 1)),
    fire_volume_score: fire.volumeScore,
    fire_confluence_score: fire.confluenceScore,
    signal_state: signalState,
    trade_bias: direction,
    signal_score: score,
    signal_grade: signalGrade,
    trade_guide: tradeGuide,
    risk_flags: riskFlags,
    enrichment_version: ENRICHMENT_VERSION,
  }
}

export async function enrichSignalPayload(payload: Record<string, unknown>): Promise<SignalEnrichment> {
  const provided = payload.enrichment_snapshot && typeof payload.enrichment_snapshot === "object" ? payload.enrichment_snapshot : null
  if (provided) return buildSignalEnrichment({ ...payload, ...asRecord(provided) }, { source: "payload" })
  const payloadVolume24h = firstNumber(payload, ["volume_24h", "volume_24h_value", "quote_volume_24h"])
  if (payloadVolume24h != null || firstNumber(payload, ["volume_ratio_24h", "volume_ratio"]) != null) {
    return buildSignalEnrichment(payload, { volume24h: payloadVolume24h, source: "payload" })
  }
  const symbol = normalizeEnrichmentSymbol(payload.symbol)
  if (!symbol || !symbol.endsWith("USDT")) return buildSignalEnrichment(payload, { source: "unavailable" })
  const cached = binanceVolumeCache.get(symbol)
  if (cached && cached.expiresAt > Date.now()) {
    return buildSignalEnrichment(payload, { volume24h: cached.value, source: "binance" })
  }
  const endpoints = [
    { url: `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${encodeURIComponent(symbol)}`, source: "binance-futures" as const },
    { url: `https://data-api.binance.vision/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`, source: "binance-spot-fallback" as const },
  ]
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint.url, {
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
        headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0" },
      })
      if (response.ok) {
        const data = await response.json() as { quoteVolume?: unknown }
        const volume24h = numberValue(data.quoteVolume)
        if (volume24h != null && volume24h > 0) {
          binanceVolumeCache.set(symbol, { value: volume24h, expiresAt: Date.now() + BINANCE_VOLUME_CACHE_TTL_MS })
          return buildSignalEnrichment(payload, { volume24h, source: endpoint.source })
        }
      }
    } catch {
      // Try the next endpoint before marking enrichment unavailable.
    }
  }
  return buildSignalEnrichment(payload, { source: "unavailable" })
}

export type { SignalEnrichment as EnrichmentSnapshot }

export function emptyEnrichment(): SignalEnrichment {
  return buildSignalEnrichment({}, { source: "unavailable" })
}

export function enrichmentFromPayload(payload: Record<string, unknown>) {
  return buildSignalEnrichment(payload, { source: "payload" })
}

export function pickEnrichmentFields(payload: Record<string, unknown>) {
  return payload.enrichment_snapshot && typeof payload.enrichment_snapshot === "object" ? asRecord(payload.enrichment_snapshot) : null
}

export function readEnrichmentValue(payload: Record<string, unknown>, key: keyof SignalEnrichment) {
  return pickEnrichmentFields(payload)?.[key] ?? payload[key]
}

export function enrichmentToPayload(enrichment: SignalEnrichment) {
  return { enrichment_snapshot: enrichment }
}

export function volumeRatioPercent(tradingValue: number | null, volume24h: number | null) {
  return tradingValue != null && volume24h != null && volume24h > 0 ? tradingValue / volume24h * 100 : null
}

export function isEnrichmentComplete(enrichment: SignalEnrichment) {
  return enrichment.volume_ratio_source !== "unavailable" && enrichment.signal_score != null
}

export { ENRICHMENT_VERSION }
