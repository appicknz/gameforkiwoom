import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"

export const DAILY_RECORD_LOSS_LIMIT_USD = -800
export const DAILY_RECORD_PROFIT_LIMIT_USD = 2_000

type TradingRecordLimit = "loss" | "profit" | null

type TradingPosition = {
  symbol: string
  direction: string
  entry_price: number | string
  size_usd: number | string | null
  leverage: number | string | null
  is_closed: boolean
  closed_roi: number | string | null
}

export type TradingRecordLimitStatus = {
  reached: boolean
  limit: TradingRecordLimit
  dailyPnl: number
}

export async function getTradingRecordLimitStatus(dateLabel: string): Promise<TradingRecordLimitStatus> {
  const { data, error } = await adminSupabase
    .from("auto_signal_positions")
    .select("symbol, direction, entry_price, size_usd, leverage, is_closed, closed_roi")
    .eq("date_label", dateLabel)

  if (error) throw error

  const positions = (data ?? []) as TradingPosition[]
  const activeSymbols = [...new Set(
    positions
      .filter((position) => !position.is_closed && position.closed_roi == null)
      .map((position) => position.symbol.replace(/\.P$/, "").toUpperCase())
  )]
  const currentPrices = new Map<string, number>()

  if (activeSymbols.length > 0) {
    const response = await fetch("https://fapi.binance.com/fapi/v1/ticker/price", { cache: "no-store" })
    if (!response.ok) throw new Error(`Binance price request failed: ${response.status}`)

    const tickers = await response.json() as Array<{ symbol: string; price: string }>
    const needed = new Set(activeSymbols)
    for (const ticker of tickers) {
      if (needed.has(ticker.symbol)) currentPrices.set(ticker.symbol, Number(ticker.price))
    }
  }

  const dailyPnl = positions.reduce((sum, position) => {
    const sizeUsd = Number(position.size_usd ?? 10)
    let roi = position.closed_roi == null ? null : Number(position.closed_roi)

    if (roi == null && !position.is_closed) {
      const symbol = position.symbol.replace(/\.P$/, "").toUpperCase()
      const currentPrice = currentPrices.get(symbol)
      const entryPrice = Number(position.entry_price)
      const leverage = Number(position.leverage ?? 1)

      if (currentPrice && entryPrice > 0) {
        const change = position.direction === "long"
          ? (currentPrice - entryPrice) / entryPrice
          : (entryPrice - currentPrice) / entryPrice
        roi = change * leverage * 100
      }
    }

    return sum + (roi == null ? 0 : sizeUsd * (roi / 100))
  }, 0)

  const limit: TradingRecordLimit = dailyPnl <= DAILY_RECORD_LOSS_LIMIT_USD
    ? "loss"
    : dailyPnl >= DAILY_RECORD_PROFIT_LIMIT_USD
      ? "profit"
      : null

  return { reached: limit !== null, limit, dailyPnl }
}
