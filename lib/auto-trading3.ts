import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { getKisQuote, type KisMode, normalizeKisSymbol } from "@/lib/kis-domestic"

const INITIAL_SEED = 2_000_000
const SYMBOL_BUDGET = 50_000

type ModeConfig = { mode: KisMode; exchange?: string; account?: string }

export async function recordUp6Signal(args: { body: Record<string, unknown>; symbol: string; signalTime: string; modes: ModeConfig[]; orderResults?: unknown }) {
  const symbol = normalizeKisSymbol(args.symbol)
  const kstDate = typeof args.body.formatted_time_kst === "string" ? args.body.formatted_time_kst.replace(" ", "T").slice(0, 10) : new Date(Date.parse(args.signalTime) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const results = []
  for (const modeConfig of args.modes) {
    try {
      const quote = await getKisQuote(symbol, modeConfig.mode)
      const price = Number(quote.price)
      const base = { trade_date: kstDate, signal_time: args.signalTime, signal_type: "TRIPLE_COMBO_UP6", symbol, symbol_name: typeof args.body.symbol_name === "string" ? args.body.symbol_name : null, account_mode: modeConfig.mode, exchange: modeConfig.exchange ?? "kis", account: modeConfig.account ?? "", entry_price: price, quantity: Math.floor(SYMBOL_BUDGET / price), invested_amount: Math.min(SYMBOL_BUDGET, Math.floor(SYMBOL_BUDGET / price) * price), seed_capital: INITIAL_SEED, budget_per_symbol: SYMBOL_BUDGET, volume: quote.volume, price_change_percent: quote.changePercent, trade_time: quote.tradedAt, webhook_raw: args.body, order_result: args.orderResults ?? null, updated_at: new Date().toISOString() }
      const record = price > SYMBOL_BUDGET || base.quantity < 1
        ? { ...base, status: "skipped", skip_reason: price > SYMBOL_BUDGET ? "price_over_50000" : "quantity_below_one", quantity: 0, invested_amount: 0 }
        : { ...base, status: "open" }
      const { data, error } = await adminSupabase.from("auto_trading3_records").upsert(record, { onConflict: "trade_date,symbol,account_mode", ignoreDuplicates: true }).select().maybeSingle()
      if (error) throw error
      results.push({ mode: modeConfig.mode, status: record.status, price, id: data?.id ?? null })
    } catch (error) {
      results.push({ mode: modeConfig.mode, status: "error", error: error instanceof Error ? error.message : "record failed" })
    }
  }
  return results
}

export async function closeAutoTrading3Day(date: string) {
  const { data: records, error } = await adminSupabase.from("auto_trading3_records").select("id,trade_date,symbol,account_mode,status,entry_price").eq("trade_date", date).neq("status", "skipped")
  if (error) throw error
  const results = []
  for (const record of records ?? []) {
    try {
      const quote = await getKisQuote(record.symbol, record.account_mode as KisMode)
      const { error: upsertError } = await adminSupabase.from("auto_trading3_daily_closes").upsert({ trade_date: date, record_id: record.id, symbol: record.symbol, close_price: quote.price, close_time: new Date().toISOString(), source: "kis", updated_at: new Date().toISOString() }, { onConflict: "trade_date,record_id" })
      if (upsertError) throw upsertError
      await adminSupabase.from("auto_trading3_records").update({ close_price: quote.price, close_time: new Date().toISOString(), status: "closed", price_change_percent: ((quote.price - Number(record.entry_price)) / Number(record.entry_price)) * 100, updated_at: new Date().toISOString() }).eq("id", record.id)
      results.push({ id: record.id, symbol: record.symbol, close_price: quote.price })
    } catch (error) { results.push({ id: record.id, symbol: record.symbol, error: error instanceof Error ? error.message : "close failed" }) }
  }
  return results
}

export function calculateAutoTrading3Summary(records: Array<Record<string, unknown>>) {
  const invested = records.reduce((sum, record) => sum + Number(record.invested_amount ?? 0), 0)
  const evaluated = records.reduce((sum, record) => sum + (record.close_price == null ? Number(record.invested_amount ?? 0) : Number(record.quantity ?? 0) * Number(record.close_price)), 0)
  return { seedCapital: INITIAL_SEED, investedAmount: invested, remainingCapital: INITIAL_SEED - invested, evaluatedAmount: evaluated, returnPercent: invested ? ((evaluated - invested) / invested) * 100 : 0 }
}
