import "server-only"

import { getMinuteCloseAfter } from "@/lib/binance-klines"
import { adminSupabase } from "@/lib/supabase-admin"
import { calculateReturns } from "@/lib/signal-statistics"

type PendingOutcome = {
  id: string
  target_time: string
  entry: { symbol: string; entry_price: number; direction: "long" | "short" } | Array<{ symbol: string; entry_price: number; direction: "long" | "short" }>
}

async function pendingSlice(cutoff: string, limit: number, ascending: boolean) {
  const { data, error } = await adminSupabase
    .from("signal_statistics_outcomes")
    .select("id,target_time,entry:signal_statistics_entries!inner(symbol,entry_price,direction)")
    .eq("status", "pending")
    .lte("target_time", cutoff)
    .order("target_time", { ascending })
    .limit(limit)
  if (error) throw error
  return (data ?? []) as PendingOutcome[]
}

async function processOutcome(outcome: PendingOutcome) {
  const entry = Array.isArray(outcome.entry) ? outcome.entry[0] : outcome.entry
  if (!entry) return "skipped" as const
  const candle = await getMinuteCloseAfter(entry.symbol, outcome.target_time)
  if (candle === undefined) {
    await adminSupabase.from("signal_statistics_outcomes").update({
      error_code: "market_data_retry",
      updated_at: new Date().toISOString(),
    }).eq("id", outcome.id)
    return "unavailable" as const
  }
  if (candle === null) {
    await adminSupabase.from("signal_statistics_outcomes").update({
      status: "unavailable",
      error_code: "symbol_not_on_public_market_data",
      calculated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", outcome.id)
    return "unavailable" as const
  }

  const returns = calculateReturns(Number(entry.entry_price), candle.closePrice, entry.direction)
  const { error } = await adminSupabase.from("signal_statistics_outcomes").update({
    candle_time: candle.openTime,
    exit_price: candle.closePrice,
    price_return_percent: returns.priceReturn,
    directional_return_percent: returns.directionalReturn,
    result: returns.result,
    status: "complete",
    error_code: null,
    calculated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", outcome.id)
  if (error) throw error
  return "complete" as const
}

export async function processPendingSignalOutcomes(limit = 40) {
  const cappedLimit = Math.min(Math.max(limit, 1), 100)
  const cutoff = new Date(Date.now() - 90_000).toISOString()
  const oldestCount = Math.max(1, Math.floor(cappedLimit * 0.25))
  const newestCount = cappedLimit - oldestCount
  const [newest, oldest] = await Promise.all([
    pendingSlice(cutoff, newestCount, false),
    pendingSlice(cutoff, oldestCount, true),
  ])
  const pending = [...new Map([...oldest, ...newest].map((outcome) => [outcome.id, outcome])).values()]

  let complete = 0
  let unavailable = 0
  const concurrency = 4
  for (let index = 0; index < pending.length; index += concurrency) {
    const results = await Promise.all(pending.slice(index, index + concurrency).map(processOutcome))
    complete += results.filter((result) => result === "complete").length
    unavailable += results.filter((result) => result === "unavailable").length
  }

  return { checked: pending.length, complete, unavailable, oldestShare: oldestCount }
}
