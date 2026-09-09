import "server-only"
import WebSocket from "ws"

type KisMode = "test" | "live"
export type KisQuote = {
  symbol: string
  price: number
  changePercent: number | null
  volume: number | null
  tradedAt: string | null
  market: "J"
}

type TokenCache = { token: string; expiresAt: number }
type StreamState = { status: "idle" | "connecting" | "connected" | "reconnecting" | "error"; reconnects: number; lastError: string | null; updatedAt: string }

const tokenCache = new Map<KisMode, TokenCache>()
const streamState: Record<KisMode, StreamState> = {
  test: { status: "idle", reconnects: 0, lastError: null, updatedAt: new Date().toISOString() },
  live: { status: "idle", reconnects: 0, lastError: null, updatedAt: new Date().toISOString() },
}
const sockets = new Map<KisMode, WebSocket>()
const subscriptions = new Map<KisMode, Set<string>>([
  ["test", new Set()],
  ["live", new Set()],
])
const latestQuotes = new Map<string, KisQuote>()

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
  const appkey = process.env.KIS_APP_KEY
  const appsecret = process.env.KIS_APP_SECRET
  if (!appkey || !appsecret) throw new Error("KIS_APP_KEY/KIS_APP_SECRET가 설정되지 않았습니다.")
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
    symbol, price: Number(o.stck_prpr), changePercent: Number.isFinite(Number(o.prdy_ctrt)) ? Number(o.prdy_ctrt) : null,
    volume: Number.isFinite(Number(o.acml_vol)) ? Number(o.acml_vol) : null,
    tradedAt: o.stck_cntg_hour ? `${new Date().toISOString().slice(0, 10)}T${o.stck_cntg_hour}` : null, market: "J",
  }
  latestQuotes.set(`${mode}:${symbol}`, quote)
  return quote
}

async function getApprovalKey(mode: KisMode) {
  const response = await fetch(`${config(mode).rest}/oauth2/Approval`, {
    method: "POST", headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey: process.env.KIS_APP_KEY, secretkey: process.env.KIS_APP_SECRET }), cache: "no-store",
  })
  if (!response.ok) throw new Error(`KIS WebSocket 승인키 발급 실패 (${response.status})`)
  const data = await response.json() as { approval_key?: string }
  if (!data.approval_key) throw new Error("KIS WebSocket 승인키가 없습니다.")
  return data.approval_key
}

function setState(mode: KisMode, patch: Partial<StreamState>) {
  streamState[mode] = { ...streamState[mode], ...patch, updatedAt: new Date().toISOString() }
}

async function ensureStream(mode: KisMode) {
  if (sockets.get(mode)?.readyState === WebSocket.OPEN) return
  if (sockets.get(mode)?.readyState === WebSocket.CONNECTING) return
  setState(mode, { status: streamState[mode].reconnects ? "reconnecting" : "connecting", lastError: null })
  try {
    const approvalKey = await getApprovalKey(mode)
    const socket = new WebSocket(config(mode).ws)
    sockets.set(mode, socket)
    socket.on("open", () => {
      setState(mode, { status: "connected" })
      for (const symbol of subscriptions.get(mode) ?? []) socket.send(JSON.stringify({ header: { approval_key: approvalKey, custtype: "P", tr_type: "1", "content-type": "utf-8" }, body: { input: { tr_id: "H0STCNT0", tr_key: `J${symbol}` } } }))
    })
    socket.on("message", raw => {
      try {
        const text = raw.toString()
        if (!text.startsWith("0|")) return
        const fields = text.split("|").slice(3)[0]?.split("^") ?? []
        const symbol = fields[0]
        const price = Number(fields[2])
        if (symbol && price > 0) latestQuotes.set(`${mode}:${symbol}`, { symbol, price, changePercent: Number(fields[4]) || null, volume: Number(fields[13]) || null, tradedAt: new Date().toISOString(), market: "J" })
      } catch { /* malformed market tick */ }
    })
    socket.on("error", error => setState(mode, { status: "error", lastError: error.message }))
    socket.on("close", () => {
      sockets.delete(mode)
      if (subscriptions.get(mode)?.size) {
        setState(mode, { status: "reconnecting", reconnects: streamState[mode].reconnects + 1 })
        const delay = Math.min(30_000, 1_000 * 2 ** Math.min(streamState[mode].reconnects, 5))
        setTimeout(() => void ensureStream(mode), delay)
      } else setState(mode, { status: "idle" })
    })
  } catch (error) {
    setState(mode, { status: "error", lastError: error instanceof Error ? error.message : "stream error", reconnects: streamState[mode].reconnects + 1 })
  }
}

export async function subscribeKisQuote(input: string, mode: KisMode) {
  const symbol = cleanSymbol(input)
  subscriptions.get(mode)?.add(symbol)
  void ensureStream(mode)
  return { symbol, quote: latestQuotes.get(`${mode}:${symbol}`) ?? null, state: streamState[mode] }
}

export function getKisStreamSnapshot(mode?: KisMode) {
  const modes = mode ? [mode] : (["test", "live"] as KisMode[])
  return modes.map(currentMode => ({ mode: currentMode, state: streamState[currentMode], quotes: [...(subscriptions.get(currentMode) ?? [])].map(symbol => ({ symbol, quote: latestQuotes.get(`${currentMode}:${symbol}`) ?? null })) }))
}

export type { KisMode }

export function normalizeKisSymbol(input: string) { return cleanSymbol(input) }

export function resetKisCachesForTests() { tokenCache.clear(); sockets.forEach(socket => socket.close()); sockets.clear(); subscriptions.forEach(set => set.clear()); latestQuotes.clear() }

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
