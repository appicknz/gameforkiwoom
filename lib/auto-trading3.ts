import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { getKisQuote, type KisMode, normalizeKisSymbol } from "@/lib/kis-domestic"
import { getKoreaStockName } from "@/lib/korea-stock-list"

const DEFAULT_INITIAL_SEED = 2_000_000
const SYMBOL_BUDGET = 50_000

type ModeConfig = { mode: KisMode; exchange?: string; account?: string }
type OrderResult = { mode?: string; exchange?: string; account?: string; ok?: boolean; status?: number | null }

export async function recordUp6Signal(args: { body: Record<string, unknown>; symbol: string; signalTime: string; modes: ModeConfig[]; orderResults?: OrderResult[] }) {
  const symbol = normalizeKisSymbol(args.symbol)
  const kstDate = typeof args.body.formatted_time_kst === "string" ? args.body.formatted_time_kst.replace(" ", "T").slice(0, 10) : new Date(Date.parse(args.signalTime) + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const { data: settings } = await adminSupabase.from("auto_signal_up8_settings").select("initial_seed").eq("id", 1).maybeSingle()
  const initialSeed = Number(settings?.initial_seed ?? DEFAULT_INITIAL_SEED)
  type QuoteResult = {
    quote: { price: number; symbolName?: string | null; volume?: number | null; changePercent?: number | null; tradedAt?: string | null } | null
    error: string | null
  }
  const quoteRequests = new Map<KisMode, Promise<QuoteResult>>()
  const getQuoteForMode = (mode: KisMode) => {
    const existing = quoteRequests.get(mode)
    if (existing) return existing
    const request = getKisQuote(symbol, mode)
      .then(quote => ({ quote, error: null }))
      .catch(error => ({ quote: null, error: error instanceof Error ? error.message : "quote fetch failed" }))
    quoteRequests.set(mode, request)
    return request
  }

  const processMode = async (modeConfig: ModeConfig) => {
    const exchange = modeConfig.exchange ?? "kis"
    const account = modeConfig.account ?? ""
    const orderResult = args.orderResults?.find(result => result.exchange === exchange && result.account === account) ?? null
    const fallbackSymbolName = getKoreaStockName(symbol) || (typeof args.body.symbol_name === "string" ? args.body.symbol_name : null)

    const { quote, error: quoteError } = await getQuoteForMode(modeConfig.mode)

    // Always persist a record for this signal/account, even if the price
    // re-fetch for bookkeeping fails. Orders are already sent to KIS by this
    // point, so silently skipping the insert here would hide a real trade.
    const base = {
      trade_date: kstDate,
      signal_time: args.signalTime,
      signal_type: "TRIPLE_COMBO_UP6",
      symbol,
      symbol_name: fallbackSymbolName || quote?.symbolName || null,
      account_mode: modeConfig.mode,
      exchange,
      account,
      seed_capital: initialSeed,
      budget_per_symbol: SYMBOL_BUDGET,
      webhook_raw: args.body,
      order_result: orderResult,
      updated_at: new Date().toISOString(),
    }

    let record: Record<string, unknown>
    if (quoteError || !quote) {
      record = { ...base, status: "quote_failed", skip_reason: quoteError ?? "quote fetch failed", entry_price: null, quantity: 0, invested_amount: 0, volume: null, price_change_percent: null, trade_time: null }
    } else {
      const price = Number(quote.price)
      const quantity = Math.max(1, Math.floor(SYMBOL_BUDGET / price))
      record = {
        ...base,
        entry_price: price,
        quantity,
        invested_amount: quantity * price,
        volume: quote.volume,
        price_change_percent: quote.changePercent,
        trade_time: quote.tradedAt,
        status: "open",
      }
    }

    try {
      const { data, error } = await adminSupabase.from("auto_trading3_records").upsert(record, { onConflict: "trade_date,symbol,exchange,account", ignoreDuplicates: true }).select().maybeSingle()
      if (error) throw error
      return { mode: modeConfig.mode, status: record.status, price: record.entry_price, id: data?.id ?? null, quoteError }
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "record failed"
      return { mode: modeConfig.mode, exchange, account, status: "error", error: message }
    }
  }

  return Promise.all(args.modes.map(processMode))
}

export async function closeAutoTrading3Day(date: string) {
  const { data: records, error } = await adminSupabase.from("auto_trading3_records").select("id,trade_date,symbol,account_mode,status,entry_price").eq("trade_date", date).not("status", "in", "(skipped,quote_failed)")
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

function toAutoTrading3TvmSymbol(symbol: string): string | null {
  const clean = symbol.trim().replace(/^(?:KRX|KOSPI|KOSDAQ):/i, "").replace(/\/(?:KRX|KOSPI|KOSDAQ)$/i, "").replace(/\.P$/i, "").toUpperCase()
  return /^[A-Z0-9]+$/.test(clean) ? `${clean}/KOSDAQ` : null
}

function buildAutoTrading3SellTvm(params: { exchange: string; account: string; symbol: string; token: string }): string {
  return `TVM:${JSON.stringify({ exchange: params.exchange, account: params.account, symbol: params.symbol, type: "market", side: "sell", bal_pct: 100, equity: "y", same_order: "skip", token: params.token })}:MVT`
}

export async function sendAutoTrading3SellOrder(recordId: string) {
  const { data: record, error: recordError } = await adminSupabase.from("auto_trading3_records").select("id,symbol,account_mode,exchange,account,status,sell_order_sent_at").eq("id", recordId).maybeSingle()
  if (recordError) throw new Error(recordError.message)
  if (!record) return { ok: false as const, error: "기록을 찾을 수 없습니다." }
  if (record.status === "skipped") return { ok: false as const, error: "제외된 기록은 매도할 수 없습니다." }

  const tvmSymbol = toAutoTrading3TvmSymbol(record.symbol)
  if (!tvmSymbol) return { ok: false as const, error: "잘못된 종목 코드입니다." }

  const [{ data: account, error: accountError }, { data: tradingGs, error: tradingError }] = await Promise.all([
    adminSupabase.from("auto_signal_up8_accounts").select("auth_token").eq("mode", record.account_mode).eq("exchange", record.exchange).eq("account", record.account).eq("enabled", true).maybeSingle(),
    adminSupabase.from("auto_trading_global_settings").select("webhook_url").eq("id", 1).single(),
  ])
  if (accountError) throw new Error(accountError.message)
  if (!account?.auth_token) return { ok: false as const, error: "해당 계정의 인증토큰을 찾을 수 없습니다." }
  if (tradingError || !tradingGs?.webhook_url) return { ok: false as const, error: "TVM 전송 주소(webhook_url)가 설정되지 않았습니다." }

  const tvm = buildAutoTrading3SellTvm({ exchange: record.exchange, account: record.account, symbol: tvmSymbol, token: account.auth_token })

  let status = 0
  let responseBody = ""
  let errMsg: string | null = null
  try {
    const response = await fetch(tradingGs.webhook_url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: tvm, signal: AbortSignal.timeout(10000) })
    status = response.status
    responseBody = await response.text()
  } catch (error) {
    errMsg = error instanceof Error ? error.message : "TVM 전송 오류"
  }
  const ok = status >= 200 && status < 300 && !errMsg

  const result = { ok, status, body: responseBody.slice(0, 500), error: errMsg, tvm, sent_at: new Date().toISOString() }
  const { error: updateError } = await adminSupabase.from("auto_trading3_records").update({ sell_order_sent_at: result.sent_at, sell_order_result: result, updated_at: result.sent_at }).eq("id", recordId)
  if (updateError) throw new Error(updateError.message)

  return ok ? { ok: true as const, result } : { ok: false as const, error: errMsg ?? `매도 주문 전송 실패 (status ${status})`, result }
}

export function calculateAutoTrading3Summary(records: Array<Record<string, unknown>>, configuredSeed = DEFAULT_INITIAL_SEED) {
  const seedCapital = Number(records.find(record => Number(record.seed_capital) > 0)?.seed_capital ?? configuredSeed)
  const invested = records.reduce((sum, record) => sum + Number(record.invested_amount ?? 0), 0)
  const evaluated = records.reduce((sum, record) => sum + (record.close_price == null ? Number(record.invested_amount ?? 0) : Number(record.quantity ?? 0) * Number(record.close_price)), 0)
  return { seedCapital, investedAmount: invested, remainingCapital: seedCapital - invested, evaluatedAmount: evaluated, returnPercent: invested ? ((evaluated - invested) / invested) * 100 : 0 }
}
