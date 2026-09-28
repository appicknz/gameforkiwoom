import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"

export const TRADING_RECORD_LOSS_LIMIT_USD = -800
export const TRADING_RECORD_PROFIT_LIMIT_USD = 2_000

type TradingRecordLimit = "loss" | "profit" | null

export type TradingRecordLimitStatus = {
  reached: boolean
  limit: TradingRecordLimit
  totalPnl: number
}

export async function getTradingRecordLimitStatus(): Promise<TradingRecordLimitStatus> {
  const [{ data: settings, error: settingsError }, { data: latest, error: latestError }] = await Promise.all([
    adminSupabase
      .from("auto_signal_settings")
      .select("initial_seed, seed_capital")
      .eq("id", 1)
      .single(),
    adminSupabase
      .from("auto_signal_rebalance")
      .select("est_value, rebalanced_at")
      .order("date_label", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (settingsError) throw settingsError
  if (latestError) throw latestError

  const initialSeed = Number(settings?.initial_seed ?? settings?.seed_capital ?? 0)
  if (!latest || !Number.isFinite(initialSeed) || initialSeed <= 0) {
    return { reached: false, limit: null, totalPnl: 0 }
  }

  let currentBalance = Number(latest.est_value)
  if (latest.rebalanced_at) {
    const { data: adjustments, error: adjustmentsError } = await adminSupabase
      .from("auto_signal_capital_adjustments")
      .select("amount")
      .gt("created_at", latest.rebalanced_at)

    if (adjustmentsError) throw adjustmentsError
    currentBalance += (adjustments ?? []).reduce((sum, row) => sum + Number(row.amount), 0)
  }

  const totalPnl = currentBalance - initialSeed
  const limit: TradingRecordLimit = totalPnl <= TRADING_RECORD_LOSS_LIMIT_USD
    ? "loss"
    : totalPnl >= TRADING_RECORD_PROFIT_LIMIT_USD
      ? "profit"
      : null

  return { reached: limit !== null, limit, totalPnl }
}
