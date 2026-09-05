import "server-only"

export type SignalEnrichment = {
  volume_ratio_24h: number | null
  volume_24h_value: number | null
  trading_value: number | null
  volume_ratio_source: "payload" | "binance" | "unavailable"
  fire_count: number
  fire_volume_score: number | null
  fire_confluence_score: number | null
  signal_state: "confirmed" | "watch" | "breakout_watch" | "overheated" | "avoid" | "unknown"
  trade_bias: "long" | "short" | "neutral" | "unknown"
  signal_score: number | null
  signal_grade: "A" | "B" | "C" | "D" | "unknown"
  trade_guide: "관찰" | "추세추종 후보" | "돌파 확인 대기" | "과열 추격 주의" | "반대 신호/회피" | "데이터 부족"
  risk_flags: string[]
  enrichment_version: string
}

const ENRICHMENT_VERSION = "signal-enrichment-v1"
const MAX_FIRE_COUNT = 5
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

export function buildSignalEnrichment(payload: Record<string, unknown>, market: { volume24h?: number | null; source?: "payload" | "binance" | "unavailable" } = {}): SignalEnrichment {
  const bb = asRecord(payload.bollinger_band)
  const direction = String(payload.signal_type ?? payload.alert_type ?? "").toUpperCase().includes("DOWN") ? "short" : "long"
  const cci = firstNumber(payload, ["cci"])
  const confluence = firstNumber(payload, ["confluence"])
  const priceChange = firstNumber(payload, ["price_change_percent", "price_change"])
  const volumeRatioPayload = firstNumber(payload, ["volume_ratio_24h", "volume_ratio"])
  const volume24h = firstNumber(payload, ["volume_24h", "volume_24h_value", "quote_volume_24h"]) ?? market.volume24h ?? null
  const price = firstNumber(payload, ["price"])
  const volume = firstNumber(payload, ["volume"])
  const tradingValue = firstNumber(payload, ["trading_value", "current_trading_value"]) ?? (price != null && volume != null ? price * volume : null)
  const volumeRatio = volumeRatioPayload ?? (tradingValue != null && volume24h != null && volume24h > 0 ? tradingValue / volume24h * 100 : null)
  const ratioSource = volumeRatioPayload != null ? "payload" : volumeRatio != null && market.source ? market.source : "unavailable"
  const fire = scoreFire(volumeRatio, confluence)
  const timeframes = Array.isArray(payload.active_timeframes) ? payload.active_timeframes.length : 0
  const timeframeScore = timeframes ? Math.min(30, timeframes * 6) : 0
  const volumeScore = volumeRatio == null ? 0 : Math.min(25, Math.round(Math.min(1, volumeRatio / 5) * 25))
  const confluencePoints = confluence == null ? 0 : Math.min(20, Math.round(Math.min(1, confluence / 5) * 20))
  const cciScore = cci == null ? 0 : Math.min(10, Math.round(Math.abs(cci) >= 100 ? 10 : Math.abs(cci) / 10))
  const bbPosition = String(bb.position ?? payload.bb_position ?? "").toLowerCase()
  const bbAligned = direction === "long" ? /above|upper|breakout/.test(bbPosition) : /below|lower|breakout/.test(bbPosition)
  const bbScore = bbPosition ? (bbAligned ? 10 : 3) : 0
  const novelty = [payload.first_occurrence, payload.new_1m, payload.new_5m, payload.new_15m, payload.new_1h, payload.new_2h, payload.new_4h].some(Boolean) ? 5 : 0
  let score = timeframeScore + volumeScore + confluencePoints + cciScore + bbScore + novelty
  const riskFlags: string[] = []
  if (Boolean(bb.squeeze)) riskFlags.push("bollinger_squeeze")
  if (Boolean(bb.upper_breakout) || Boolean(bb.lower_breakout)) riskFlags.push("bollinger_breakout")
  if (volumeRatio != null && volumeRatio >= 5) riskFlags.push("volume_spike")
  if (cci != null && Math.abs(cci) >= 200) riskFlags.push("cci_extreme")
  if (!bbAligned && bbPosition) { score = Math.max(0, score - 10); riskFlags.push("counter_trend_indicator") }
  const dataSufficient = volumeRatio != null || (confluence != null && timeframes > 0 && priceChange != null)
  const signalState = !dataSufficient ? "unknown" : riskFlags.includes("volume_spike") || riskFlags.includes("bollinger_breakout") ? "breakout_watch" : score >= 70 ? "confirmed" : score >= 45 ? "watch" : "avoid"
  const signalGrade = !dataSufficient ? "unknown" : score >= 80 ? "A" : score >= 60 ? "B" : score >= 40 ? "C" : "D"
  const tradeGuide = !dataSufficient ? "데이터 부족" : signalState === "breakout_watch" ? "돌파 확인 대기" : signalState === "confirmed" ? "추세추종 후보" : signalState === "avoid" ? "반대 신호/회피" : score >= 65 ? "과열 추격 주의" : "관찰"
  return {
    volume_ratio_24h: volumeRatio,
    volume_24h_value: volume24h,
    trading_value: tradingValue,
    volume_ratio_source: ratioSource,
    fire_count: Math.min(MAX_FIRE_COUNT, Math.max(1, numberValue(payloadValue(payload, ["fire_count"])) ?? fire.fireCount ?? 1)),
    fire_volume_score: fire.volumeScore,
    fire_confluence_score: fire.confluenceScore,
    signal_state: signalState,
    trade_bias: dataSufficient ? direction : "unknown",
    signal_score: dataSufficient ? score : null,
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
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbol=${encodeURIComponent(symbol)}`, { signal: AbortSignal.timeout(1500), cache: "no-store" })
    if (!response.ok) throw new Error(`binance ${response.status}`)
    const data = await response.json() as { quoteVolume?: unknown }
    return buildSignalEnrichment(payload, { volume24h: numberValue(data.quoteVolume), source: "binance" })
  } catch {
    return buildSignalEnrichment(payload, { source: "unavailable" })
  }
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
