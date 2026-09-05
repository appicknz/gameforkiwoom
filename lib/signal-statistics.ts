import "server-only"

import { createHash } from "node:crypto"
import { adminSupabase } from "@/lib/supabase-admin"

export const OUTCOME_HORIZONS = [5, 15, 30, 60, 240] as const

const numberValue = (value: unknown): number | null => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""))
  return Number.isFinite(parsed) ? parsed : null
}

const booleanValue = (value: unknown): boolean | null => {
  if (typeof value === "boolean") return value
  if (value === 1 || String(value).toLowerCase() === "true") return true
  if (value === 0 || String(value).toLowerCase() === "false") return false
  return null
}

const textValue = (value: unknown): string | null => {
  if (value == null || value === "") return null
  return typeof value === "string" ? value.trim() : JSON.stringify(value)
}

export function normalizeSignalTime(payload: Record<string, unknown>, receivedAt: string) {
  const candidate = payload.formatted_time_kst ?? payload.current_time_kst ?? payload.time
  if (typeof candidate === "number" || /^\d{10,13}$/.test(String(candidate ?? ""))) {
    const raw = Number(candidate)
    return new Date(raw < 1e12 ? raw * 1000 : raw).toISOString()
  }
  if (typeof candidate === "string" && candidate.trim()) {
    const value = candidate.trim()
    const date = new Date(/(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ? value : `${value.replace(" ", "T")}+09:00`)
    if (!Number.isNaN(date.getTime())) return date.toISOString()
  }
  return new Date(receivedAt).toISOString()
}

export function normalizeSignalPayload(payload: Record<string, unknown>, receivedAt: string) {
  const signalType = textValue(payload.signal_type ?? payload.alert_type)?.toUpperCase()
  const rawSymbol = textValue(payload.symbol)?.toUpperCase()
  const entryPrice = numberValue(payload.price)
  if (!signalType || !rawSymbol || !entryPrice || entryPrice <= 0) return null

  const exchange = textValue(payload.exchange)?.toUpperCase() ?? "BINANCE"
  const symbol = rawSymbol.replace(/^[A-Z]+:/, "").replace(/\.P$/, "")
  const direction = signalType.includes("DOWN") || signalType.includes("SHORT") ? "short" : "long"
  const signalTime = normalizeSignalTime(payload, receivedAt)
  const bb = payload.bollinger_band && typeof payload.bollinger_band === "object"
    ? payload.bollinger_band as Record<string, unknown>
    : {}
  const groupKey = createHash("sha256")
    .update(`${exchange}|${symbol}|${signalType}|${signalTime}`)
    .digest("hex")

  return {
    received_at: receivedAt,
    signal_time: signalTime,
    exchange,
    symbol,
    signal_type: signalType,
    direction,
    entry_price: entryPrice,
    duplicate_group_key: groupKey,
    cci: numberValue(payload.cci),
    cci_signal: textValue(payload.cci_signal),
    confluence: textValue(payload.confluence),
    price_change_percent: numberValue(payload.price_change_percent),
    volume_change: numberValue(payload.volume_change),
    active_timeframes: Array.isArray(payload.active_timeframes) ? payload.active_timeframes : [],
    first_occurrence: booleanValue(payload.first_occurrence),
    new_1m: booleanValue(payload.new_1m),
    new_5m: booleanValue(payload.new_5m),
    new_15m: booleanValue(payload.new_15m),
    new_1h: booleanValue(payload.new_1h),
    new_2h: booleanValue(payload.new_2h),
    new_4h: booleanValue(payload.new_4h),
    ultimate_plot: textValue(payload.ultimate_plot),
    signal_timeframe: textValue(payload.signal_timeframe),
    interval_label: textValue(payload.interval),
    bb_position: textValue(bb.position),
    bb_trend: textValue(bb.trend),
    bb_expansion: booleanValue(bb.expansion),
    bb_squeeze: booleanValue(bb.squeeze),
    bb_upper_touch: booleanValue(bb.upper_touch),
    bb_lower_touch: booleanValue(bb.lower_touch),
    bb_upper_breakout: booleanValue(bb.upper_breakout),
    bb_lower_breakout: booleanValue(bb.lower_breakout),
    bb_middle_cross: booleanValue(bb.middle_cross),
    bb_upper_distance: numberValue(bb.upper_distance),
    bb_middle_distance: numberValue(bb.middle_distance),
    bb_lower_distance: numberValue(bb.lower_distance),
    bb_width: numberValue(bb.width),
    payload,
  }
}

export async function recordSignalStatistics(input: {
  webhookLogId: string
  receivedAt: string
  status: string
  reason?: string | null
  payload: Record<string, unknown>
}) {
  if (input.status === "auth_fail") return null
  const normalized = normalizeSignalPayload(input.payload, input.receivedAt)
  if (!normalized) return null

  const { data: existing } = await adminSupabase
    .from("signal_statistics_entries")
    .select("id")
    .eq("webhook_log_id", input.webhookLogId)
    .maybeSingle()
  if (existing) return existing.id as string

  const { data: siblings } = await adminSupabase
    .from("signal_statistics_entries")
    .select("duplicate_index")
    .eq("duplicate_group_key", normalized.duplicate_group_key)
    .order("duplicate_index", { ascending: false })
    .limit(1)

  const duplicateIndex = siblings?.length ? Number(siblings[0].duplicate_index) + 1 : 0
  const { data: entry, error } = await adminSupabase
    .from("signal_statistics_entries")
    .insert({
      ...normalized,
      webhook_log_id: input.webhookLogId,
      duplicate_index: duplicateIndex,
      processing_status: input.status,
      processing_reason: input.reason?.slice(0, 240) ?? null,
    })
    .select("id, signal_time")
    .single()
  if (error) throw error

  await adminSupabase.from("signal_statistics_outcomes").upsert(
    OUTCOME_HORIZONS.map((horizon) => ({
      entry_id: entry.id,
      horizon_minutes: horizon,
      target_time: new Date(new Date(entry.signal_time).getTime() + horizon * 60_000).toISOString(),
    })),
    { onConflict: "entry_id,horizon_minutes", ignoreDuplicates: true },
  )
  return entry.id as string
}

export function duplicateLabel(index: number) {
  return index === 0 ? "원본" : `중복${index}`
}

export function calculateReturns(entryPrice: number, exitPrice: number, direction: "long" | "short") {
  const priceReturn = ((exitPrice - entryPrice) / entryPrice) * 100
  const directionalReturn = direction === "short" ? -priceReturn : priceReturn
  return {
    priceReturn,
    directionalReturn,
    result: directionalReturn > 0 ? "win" : directionalReturn < 0 ? "loss" : "flat",
  } as const
}
