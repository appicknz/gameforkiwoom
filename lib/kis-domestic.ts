import "server-only"
import WebSocket from "ws"
import { getKoreaStockName } from "@/lib/korea-stock-list"
import { redis } from "@/lib/redis"

type KisMode = "test" | "live"
export type KisQuote = {
  symbol: string
  symbolName: string | null
  price: number
  changePercent: number | null
  volume: number | null
  tradedAt: string | null
  market: "J"
}

type TokenCache = { token: string; expiresAt: number }
type ApprovalKeyCache = { key: string; expiresAt: number }
type StreamState = { status: "idle" | "connecting" | "connected" | "reconnecting" | "error"; reconnects: number; lastError: string | null; updatedAt: string }
type KisStreamSubscription = { approvalKey: string; subscribed: Set<string> }
type KisSubscriptionStatus = { status: "pending" | "subscribed" | "error"; code: string | null; message: string | null; updatedAt: string }

const tokenCache = new Map<KisMode, TokenCache>()
const tokenRequests = new Map<KisMode, Promise<string>>()
const approvalKeyCache = new Map<KisMode, ApprovalKeyCache>()
const approvalKeyRequests = new Map<KisMode, Promise<string>>()
const streamState: Record<KisMode, StreamState> = {
  test: { status: "idle", reconnects: 0, lastError: null, updatedAt: new Date().toISOString() },
  live: { status: "idle", reconnects: 0, lastError: null, updatedAt: new Date().toISOString() },
}
const sockets = new Map<KisMode, WebSocket>()
const streamSubscriptions = new Map<KisMode, KisStreamSubscription>()
const streamConnectRequests = new Map<KisMode, Promise<void>>()
const subscriptionStatuses = new Map<string, KisSubscriptionStatus>()
const subscriptions = new Map<KisMode, Set<string>>([
  ["test", new Set()],
  ["live", new Set()],
])
const latestQuotes = new Map<string, KisQuote>()

// 서버리스 인스턴스 간에 마지막 시세를 공유하기 위한 Redis 캐시. 실패해도 메모리 캐시만으로 동작은 유지된다.
const QUOTE_CACHE_TTL_SECONDS = 60 * 60 * 24
const redisQuoteKey = (mode: KisMode, symbol: string) => `kis:quote:${mode}:${symbol}`

function cacheQuoteInRedis(mode: KisMode, quote: KisQuote) {
  void redis.set(redisQuoteKey(mode, quote.symbol), JSON.stringify(quote), { ex: QUOTE_CACHE_TTL_SECONDS }).catch(() => { /* 캐시 실패는 무시 */ })
}

async function getQuoteFromRedis(mode: KisMode, symbol: string): Promise<KisQuote | null> {
  try {
    const cached = await redis.get<KisQuote | string>(redisQuoteKey(mode, symbol))
    if (!cached) return null
    return typeof cached === "string" ? JSON.parse(cached) as KisQuote : cached
  } catch { return null }
}

function rememberQuote(mode: KisMode, quote: KisQuote) {
  latestQuotes.set(`${mode}:${quote.symbol}`, quote)
  cacheQuoteInRedis(mode, quote)
}

const config = (mode: KisMode) => mode === "test"
  ? { rest: "https://openapivts.koreainvestment.com:29443", ws: "ws://ops.koreainvestment.com:31000" }
  : { rest: "https://openapi.koreainvestment.com:9443", ws: "ws://ops.koreainvestment.com:21000" }

function cleanSymbol(input: string) {
  const match = input.toUpperCase().match(/(?:KRX:|KOSDAQ:)?(\d{6})/)
  return match?.[1] ?? input.replace(/[^0-9]/g, "").slice(0, 6)
}

async function getAccessToken(mode: KisMode) {
  const cached = tokenCache.get(mode)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token
  const pending = tokenRequests.get(mode)
  if (pending) return pending
  const appkey = process.env.KIS_APP_KEY
  const appsecret = process.env.KIS_APP_SECRET
  if (!appkey || !appsecret) throw new Error("KIS_APP_KEY/KIS_APP_SECRET가 설정되지 않았습니다.")
  const request = (async () => {
    const response = await fetch(`${config(mode).rest}/oauth2/tokenP`, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ grant_type: "client_credentials", appkey, appsecret }),
      cache: "no-store",
    })
    if (!response.ok) throw new Error(`KIS 토큰 발급 실패 (${response.status})`)
    const data = await response.json() as { access_token?: string; expires_in?: number }
    if (!data.access_token) throw new Error("KIS 토큰 응답이 올바르지 않습니다.")
    tokenCache.set(mode, { token: data.access_token, expiresAt: Date.now() + Math.max(60, Number(data.expires_in ?? 86400) - 120) * 1000 })
    return data.access_token
  })()
  tokenRequests.set(mode, request)
  try { return await request } finally { tokenRequests.delete(mode) }
}

export async function getKisQuote(input: string, mode: KisMode): Promise<KisQuote> {
  const symbol = cleanSymbol(input)
  const token = await getAccessToken(mode)
  const response = await fetch(`${config(mode).rest}/uapi/domestic-stock/v1/quotations/inquire-price?FID_COND_MRKT_DIV_CODE=J&FID_INPUT_ISCD=${encodeURIComponent(symbol)}`, {
    headers: {
      authorization: `Bearer ${token}`, appkey: process.env.KIS_APP_KEY!, appsecret: process.env.KIS_APP_SECRET!,
      tr_id: "FHKST01010100", custtype: "P",
    }, cache: "no-store",
  })
  const data = await response.json() as { rt_cd?: string; msg1?: string; output?: Record<string, string> }
  if (!response.ok || data.rt_cd === "1" || !data.output) throw new Error(data.msg1 || `KIS 시세 조회 실패 (${response.status})`)
  const o = data.output
  const quote: KisQuote = {
    symbol, symbolName: getKoreaStockName(symbol) || o.hts_kor_isnm?.trim() || o.prdt_name?.trim() || null, price: Number(o.stck_prpr), changePercent: Number.isFinite(Number(o.prdy_ctrt)) ? Number(o.prdy_ctrt) : null,
    volume: Number.isFinite(Number(o.acml_vol)) ? Number(o.acml_vol) : null,
    tradedAt: o.stck_cntg_hour ? `${new Date().toISOString().slice(0, 10)}T${o.stck_cntg_hour}` : null, market: "J",
  }
  rememberQuote(mode, quote)
  return quote
}

async function getApprovalKey(mode: KisMode) {
  const cached = approvalKeyCache.get(mode)
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.key
  const pending = approvalKeyRequests.get(mode)
  if (pending) return pending
  const request = (async () => {
    const response = await fetch(`${config(mode).rest}/oauth2/Approval`, {
      method: "POST", headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ grant_type: "client_credentials", appkey: process.env.KIS_APP_KEY, secretkey: process.env.KIS_APP_SECRET }), cache: "no-store",
    })
    if (!response.ok) throw new Error(`KIS WebSocket 승인키 발급 실패 (${response.status})`)
    const data = await response.json() as { approval_key?: string }
    if (!data.approval_key) throw new Error("KIS WebSocket 승인키가 없습니다.")
    approvalKeyCache.set(mode, { key: data.approval_key, expiresAt: Date.now() + 23 * 60 * 60 * 1000 })
    return data.approval_key
  })()
  approvalKeyRequests.set(mode, request)
  try { return await request } finally { approvalKeyRequests.delete(mode) }
}

function setState(mode: KisMode, patch: Partial<StreamState>) {
  streamState[mode] = { ...streamState[mode], ...patch, updatedAt: new Date().toISOString() }
}

function sendSubscription(mode: KisMode, symbol: string, trType: "1" | "2" = "1") {
  const socket = sockets.get(mode)
  const subscription = streamSubscriptions.get(mode)
  if (!socket || socket.readyState !== WebSocket.OPEN || !subscription || subscription.subscribed.has(symbol)) return
  socket.send(JSON.stringify({ header: { approval_key: subscription.approvalKey, custtype: "P", tr_type: trType, "content-type": "utf-8" }, body: { input: { tr_id: "H0STCNT0", tr_key: symbol } } }))
  if (trType === "1") {
    subscription.subscribed.add(symbol)
    subscriptionStatuses.set(`${mode}:${symbol}`, { status: "pending", code: null, message: null, updatedAt: new Date().toISOString() })
  }
}

// KIS 공식 H0STCNT0(국내주식 실시간체결) 응답은 '^'로 구분된 필드이며, 공식 샘플 기준 인덱스는 다음과 같다.
// 0: 유가증권단축종목코드, 1: 체결시간, 2: 현재가, 3: 전일대비부호, 4: 전일대비,
// 5: 전일대비율, 7: 시가, 8: 고가, 9: 저가, 12: 체결거래량(틱), 13: 누적거래량
const KIS_TICK_FIELD = {
  SYMBOL: 0,
  TRADE_TIME: 1,
  PRICE: 2,
  CHANGE_RATE: 5,
  CUMULATIVE_VOLUME: 13,
} as const

function handleSocketMessage(raw: WebSocket.RawData, mode: KisMode, socket: WebSocket) {
  const text = raw.toString()
  if (text.startsWith("0|")) {
    // 헤더(암호화 유무|TR_ID|건수)를 제외한 payload를 '^'로 분해한다. 건수(countRaw) > 1이면 동일한 필드 묶음이
    // 반복되므로, 필드 총 개수를 건수로 나눈 만큼씩 묶어 가장 마지막(최신) 틱만 사용한다.
    const [, , countRaw, body] = text.split("|")
    const tickCount = Math.max(1, Number(countRaw) || 1)
    const allFields = (body ?? "").split("^")
    const fieldsPerTick = Math.floor(allFields.length / tickCount) || allFields.length
    const fields = allFields.slice(allFields.length - fieldsPerTick)
    const symbol = cleanSymbol(fields[KIS_TICK_FIELD.SYMBOL] ?? "")
    const price = Number(fields[KIS_TICK_FIELD.PRICE])
    if (!symbol || !Number.isFinite(price) || price <= 0) return
    const previous = latestQuotes.get(`${mode}:${symbol}`)
    const tradeTime = fields[KIS_TICK_FIELD.TRADE_TIME]?.trim()
    rememberQuote(mode, {
      symbol,
      symbolName: getKoreaStockName(symbol) || previous?.symbolName || null,
      price,
      changePercent: Number.isFinite(Number(fields[KIS_TICK_FIELD.CHANGE_RATE])) ? Number(fields[KIS_TICK_FIELD.CHANGE_RATE]) : previous?.changePercent ?? null,
      volume: Number.isFinite(Number(fields[KIS_TICK_FIELD.CUMULATIVE_VOLUME])) ? Number(fields[KIS_TICK_FIELD.CUMULATIVE_VOLUME]) : previous?.volume ?? null,
      tradedAt: tradeTime ? `${new Date().toISOString().slice(0, 10)}T${tradeTime}` : new Date().toISOString(),
      market: "J",
    })
    return
  }

  const message = JSON.parse(text) as { header?: { tr_id?: string; tr_key?: string }; body?: { rt_cd?: string; msg_cd?: string; msg1?: string } }
  if (message.header?.tr_id === "PINGPONG") {
    socket.send(raw)
    return
  }
  if (message.header?.tr_id !== "H0STCNT0") return
  const symbol = cleanSymbol(message.header.tr_key ?? "")
  if (!symbol) return
  const accepted = message.body?.rt_cd === "0"
  subscriptionStatuses.set(`${mode}:${symbol}`, {
    status: accepted ? "subscribed" : "error",
    code: message.body?.msg_cd ?? message.body?.rt_cd ?? null,
    message: message.body?.msg1 ?? null,
    updatedAt: new Date().toISOString(),
  })
  if (!accepted) streamSubscriptions.get(mode)?.subscribed.delete(symbol)
}

async function ensureStream(mode: KisMode) {
  if (sockets.get(mode)?.readyState === WebSocket.OPEN) return
  if (sockets.get(mode)?.readyState === WebSocket.CONNECTING) return streamConnectRequests.get(mode)
  const pending = (async () => {
    setState(mode, { status: streamState[mode].reconnects ? "reconnecting" : "connecting", lastError: null })
    try {
      const approvalKey = await getApprovalKey(mode)
      const socket = new WebSocket(config(mode).ws)
      sockets.set(mode, socket)
      await new Promise<void>((resolve, reject) => {
        const onOpen = () => { socket.off("error", onError); resolve() }
        const onError = (error: Error) => { socket.off("open", onOpen); reject(error) }
        socket.once("open", onOpen)
        socket.once("error", onError)
      })
      streamSubscriptions.set(mode, { approvalKey, subscribed: new Set() })
      setState(mode, { status: "connected", lastError: null })
      for (const symbol of subscriptions.get(mode) ?? []) sendSubscription(mode, symbol)
      socket.on("message", raw => { try { handleSocketMessage(raw, mode, socket) } catch { /* malformed market message */ } })
      socket.on("error", error => setState(mode, { status: "error", lastError: error.message }))
      socket.on("close", () => {
        sockets.delete(mode)
        streamSubscriptions.delete(mode)
        if (subscriptions.get(mode)?.size) {
          setState(mode, { status: "reconnecting", reconnects: streamState[mode].reconnects + 1 })
          const delay = Math.min(30_000, 1_000 * 2 ** Math.min(streamState[mode].reconnects, 5))
          setTimeout(() => void ensureStream(mode), delay)
        } else setState(mode, { status: "idle" })
      })
    } catch (error) {
      sockets.get(mode)?.close()
      sockets.delete(mode)
      setState(mode, { status: "error", lastError: error instanceof Error ? error.message : "stream error", reconnects: streamState[mode].reconnects + 1 })
      throw error
    }
  })()
  streamConnectRequests.set(mode, pending)
  try { await pending } finally { streamConnectRequests.delete(mode) }
}

export async function subscribeKisQuotes(inputs: string[], mode: KisMode) {
  const symbols = [...new Set(inputs.map(cleanSymbol).filter(Boolean))]
  const modeSubscriptions = subscriptions.get(mode)
  symbols.forEach(symbol => modeSubscriptions?.add(symbol))
  try { await ensureStream(mode) } catch { /* snapshot reports connection error */ }
  symbols.forEach(symbol => sendSubscription(mode, symbol))
  // 메모리 캐시(이 인스턴스)에 없으면 Redis(다른 인스턴스가 저장한 마지막 시세)를 확인해 즉시 보여준다.
  const quoteEntries = await Promise.all(symbols.map(async symbol => {
    const key = `${mode}:${symbol}`
    let quote = latestQuotes.get(key) ?? null
    if (!quote) {
      quote = await getQuoteFromRedis(mode, symbol)
      if (quote) latestQuotes.set(key, quote)
    }
    return [symbol, quote] as const
  }))
  return {
    symbols,
    quotes: Object.fromEntries(quoteEntries),
    subscriptions: Object.fromEntries(symbols.map(symbol => [symbol, subscriptionStatuses.get(`${mode}:${symbol}`) ?? null])),
    state: streamState[mode],
  }
}

export async function subscribeKisQuote(input: string, mode: KisMode) {
  const result = await subscribeKisQuotes([input], mode)
  const symbol = result.symbols[0] ?? cleanSymbol(input)
  return { symbol, quote: result.quotes[symbol] ?? null, state: result.state }
}

export function getKisStreamSnapshot(mode?: KisMode) {
  const modes = mode ? [mode] : (["test", "live"] as KisMode[])
  return modes.map(currentMode => ({
    mode: currentMode,
    state: streamState[currentMode],
    quotes: [...(subscriptions.get(currentMode) ?? [])].map(symbol => ({
      symbol,
      quote: latestQuotes.get(`${currentMode}:${symbol}`) ?? null,
      subscription: subscriptionStatuses.get(`${currentMode}:${symbol}`) ?? null,
    })),
  }))
}

export type { KisMode }

export function normalizeKisSymbol(input: string) { return cleanSymbol(input) }

export function resetKisCachesForTests() { tokenCache.clear(); approvalKeyCache.clear(); approvalKeyRequests.clear(); sockets.forEach(socket => socket.close()); sockets.clear(); subscriptions.forEach(set => set.clear()); latestQuotes.clear(); subscriptionStatuses.clear() }

export async function getKisQuoteForRecord(input: string, mode: KisMode) { return getKisQuote(input, mode) }

export async function getKisAccessTokenForTests(mode: KisMode) { return getAccessToken(mode) }

export const kisConfigForTests = config

export const kisQuoteKey = (mode: KisMode, symbol: string) => `${mode}:${cleanSymbol(symbol)}`

export const _internal = { getApprovalKey }

export const streamManager = { subscribeKisQuote, getKisStreamSnapshot }

export const getKisRestConfig = config

export const getKisSymbol = cleanSymbol

export const getKisToken = getAccessToken

export const getQuote = getKisQuote

export const subscribeQuote = subscribeKisQuote

export const getStreamSnapshot = getKisStreamSnapshot

export const KIS_MARKET = "J" as const

export const KIS_TR_ID = "H0STCNT0" as const

export const KIS_QUOTE_TR_ID = "FHKST01010100" as const

export const KIS_BUDGET = 50000

export const KIS_INITIAL_SEED = 2000000

export const KIS_ACCOUNT_MODES = ["test", "live"] as const

export const isKisMode = (value: unknown): value is KisMode => value === "test" || value === "live"

export const parseKisMode = (value: unknown): KisMode => value === "live" ? "live" : "test"

export const kisRuntimeStatus = () => ({ configured: Boolean(process.env.KIS_APP_KEY && process.env.KIS_APP_SECRET), snapshots: getKisStreamSnapshot() })

export default getKisQuote
