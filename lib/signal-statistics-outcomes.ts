import "server-only"

import { getMinuteCloseAfter } from "@/lib/binance-klines"
import { adminSupabase } from "@/lib/supabase-admin"
import { calculateReturns } from "@/lib/signal-statistics"

export async function processPendingSignalOutcomes(limit = 40) {
  const cutoff = new Date(Date.now() - 90_000).toISOString()
  const { data: pending, error } = await adminSupabase
    .from("signal_statistics_outcomes")
    .select("id, target_time, entry:signal_statistics_entries!inner(symbol, entry_price, direction)")
    .eq("status", "pending")
    .lte("target_time", cutoff)
    .order("target_time", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100))
  if (error) throw error

  let complete = 0
  let unavailable = 0
  for (const outcome of pending ?? []) {
    const entry = Array.isArray(outcome.entry) ? outcome.entry[0] : outcome.entry
    if (!entry) continue
    const candle = await getMinuteCloseAfter(entry.symbol, outcome.target_time)
    if (candle === undefined) {
      unavailable += 1
      await adminSupabase.from("signal_statistics_outcomes").update({
        error_code: "market_data_retry",
        updated_at: new Date().toISOString(),
      }).eq("id", outcome.id)
      continue
    }
    if (candle === null) {
      unavailable += 1
      await adminSupabase.from("signal_statistics_outcomes").update({
        status: "unavailable",
        error_code: "symbol_not_on_public_market_data",
        calculated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", outcome.id)
      continue
    }

    const returns = calculateReturns(Number(entry.entry_price), candle.closePrice, entry.direction)
    const { error: updateError } = await adminSupabase.from("signal_statistics_outcomes").update({
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
    if (!updateError) complete += 1
  }

  return { checked: pending?.length ?? 0, complete, unavailable }
}
