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

type SignalStatisticsInput = {
  webhookLogId: string
  receivedAt: string
  status: string
  reason?: string | null
  payload: Record<string, unknown>
}

export async function recordSignalStatisticsBatch(inputs: SignalStatisticsInput[]) {
  const candidates = inputs.flatMap((input) => {
    if (input.status === "auth_fail") return []
    const normalized = normalizeSignalPayload(input.payload, input.receivedAt)
    return normalized ? [{ input, normalized }] : []
  })
  if (!candidates.length) return { inserted: 0, ignored: inputs.length }

  const webhookIds = candidates.map(({ input }) => input.webhookLogId)
  const { data: existing, error: existingError } = await adminSupabase
    .from("signal_statistics_entries")
    .select("webhook_log_id")
    .in("webhook_log_id", webhookIds)
  if (existingError) throw existingError

  const existingIds = new Set((existing ?? []).map((row) => row.webhook_log_id))
  const pending = candidates.filter(({ input }) => !existingIds.has(input.webhookLogId))
  if (!pending.length) return { inserted: 0, ignored: inputs.length }

  const groupKeys = [...new Set(pending.map(({ normalized }) => normalized.duplicate_group_key))]
  const { data: siblings, error: siblingError } = await adminSupabase
    .from("signal_statistics_entries")
    .select("duplicate_group_key,duplicate_index")
    .in("duplicate_group_key", groupKeys)
  if (siblingError) throw siblingError

  const nextIndex = new Map<string, number>()
  for (const sibling of siblings ?? []) {
    nextIndex.set(sibling.duplicate_group_key, Math.max(nextIndex.get(sibling.duplicate_group_key) ?? 0, Number(sibling.duplicate_index) + 1))
  }

  const rows = pending.map(({ input, normalized }) => {
    const duplicateIndex = nextIndex.get(normalized.duplicate_group_key) ?? 0
    nextIndex.set(normalized.duplicate_group_key, duplicateIndex + 1)
    return {
      ...normalized,
      webhook_log_id: input.webhookLogId,
      duplicate_index: duplicateIndex,
      processing_status: input.status,
      processing_reason: input.reason?.slice(0, 240) ?? null,
    }
  })

  const { error: insertError } = await adminSupabase.from("signal_statistics_entries").insert(rows)
  if (insertError) throw insertError
  const { data: entries, error: entryError } = await adminSupabase
    .from("signal_statistics_entries")
    .select("id,signal_time")
    .in("webhook_log_id", pending.map(({ input }) => input.webhookLogId))
  if (entryError) throw entryError

  const outcomes = (entries ?? []).flatMap((entry) => OUTCOME_HORIZONS.map((horizon) => ({
    entry_id: entry.id,
    horizon_minutes: horizon,
    target_time: new Date(new Date(entry.signal_time).getTime() + horizon * 60_000).toISOString(),
  })))
  for (let index = 0; index < outcomes.length; index += 500) {
    const { error: outcomeError } = await adminSupabase.from("signal_statistics_outcomes").upsert(
      outcomes.slice(index, index + 500),
      { onConflict: "entry_id,horizon_minutes", ignoreDuplicates: true },
    )
    if (outcomeError) throw outcomeError
  }

  return { inserted: pending.length, ignored: inputs.length - pending.length }
}

export async function recordSignalStatistics(input: SignalStatisticsInput) {
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
  const directionalForResult = Math.round(directionalReturn * 1e10) / 1e10
  return {
    priceReturn,
    directionalReturn,
    result: directionalForResult >= 0.1 ? "win" : directionalForResult <= -0.1 ? "loss" : "flat",
  } as const
}
