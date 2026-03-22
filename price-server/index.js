/**
 * BTC Price WebSocket Server
 *
 * 역할:
 * 1. Binance aggTrade WebSocket 하나를 열어 체결 데이터 수신
 * 2. 1초 캔들 집계 (open/high/low/close)
 * 3. 30초마다 closing price 기록
 * 4. 연결된 모든 클라이언트에게 동시 브로드캐스트
 *
 * Railway 배포:
 * - RAILWAY: PORT 환경변수 자동 주입
 * - package.json start: "node index.js"
 *
 * 클라이언트 연결:
 * ws://[railway-url] 으로 연결
 * 메시지 타입: { type: "price", price, time } | { type: "closing", price, time } | { type: "init", closingPrices }
 */

const { WebSocket, WebSocketServer } = require("ws")

const PORT = process.env.PORT || 8080
// 현재가: 현물 aggTrade — 소수점 2자리 현물 가격 (stream.binance.com)
const BINANCE_TRADE_URL = "wss://stream.binance.com:9443/ws/btcusdt@aggTrade"
// 30초봉 마감가: 현물 kline_30s (k.x===true 시 종가 확정)
const BINANCE_KLINE_URL = "wss://stream.binance.com:9443/ws/btcusdt@kline_30s"

// 연결된 클라이언트 목록
const clients = new Set()

// 집계 상태
const closingPrices = [] // 최근 100개 유지
let latestPrice = null

// ─── WebSocket 서버 ──────────────────────────────────────────
const wss = new WebSocketServer({ port: PORT })

wss.on("listening", () => {
  console.log(`[server] WebSocket server listening on port ${PORT}`)
})

wss.on("connection", (ws) => {
  clients.add(ws)
  console.log(`[server] client connected (total: ${clients.size})`)

  // 신규 연결에게 최근 closing prices 즉시 전송
  if (closingPrices.length > 0) {
    ws.send(JSON.stringify({ type: "init", closingPrices: closingPrices.slice(-100) }))
  }

  // 최신 가격도 즉시 전송 (초기 로딩 단축)
  if (latestPrice !== null) {
    ws.send(JSON.stringify({ type: "price", price: latestPrice.price, time: latestPrice.time }))
  }

  ws.on("close", () => {
    clients.delete(ws)
    console.log(`[server] client disconnected (total: ${clients.size})`)
  })

  ws.on("error", () => {
    clients.delete(ws)
  })
})

// ─── 브로드캐스트 ─────────────────────────────────────────────
function broadcast(data) {
  const msg = JSON.stringify(data)
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg)
    }
  }
}

// ─── Binance aggTrade WebSocket (현재가 브로드캐스트용) ───────
let tradeWs = null

function connectTrade() {
  console.log("[server] connecting to Binance aggTrade...")
  tradeWs = new WebSocket(BINANCE_TRADE_URL)

  tradeWs.on("open", () => {
    console.log("[server] Binance aggTrade connected")
  })

  tradeWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString())
      // 선물 aggTrade: p=price, T=tradeTime(ms)
      // 현물 aggTrade도 동일 구조
      const price = parseFloat(msg.p)
      const time = Math.floor(msg.T / 1000)
      if (isNaN(price) || price <= 0) return
      latestPrice = { price, time }
      // 즉각 브로드캐스트 — 버퍼링/집계 없이 수신 즉시 전송
      broadcast({ type: "price", price, time })
    } catch {}
  })

  tradeWs.on("close", () => {
    console.log("[server] aggTrade WS closed, reconnecting in 2s...")
    setTimeout(connectTrade, 2000)
  })

  tradeWs.on("error", (err) => {
    console.error("[server] aggTrade WS error:", err.message)
    tradeWs.terminate()
  })
}

// ─── Binance kline_30s WebSocket (30초봉 공식 종가용) ─────────
// k.x === true 일 때만 closing을 발행 — 경계 계산 없이 Binance가 확정한 종가 사용
let klineWs = null

function connectKline() {
  console.log("[server] connecting to Binance kline_30s...")
  klineWs = new WebSocket(BINANCE_KLINE_URL)

  klineWs.on("open", () => {
    console.log("[server] Binance kline_30s connected")
  })

  klineWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString())
      const k = msg.k
      if (!k || !k.x) return  // 마감 확정된 캔들만 처리

      const closePrice = parseFloat(k.c)
      const closeTime = Math.floor(k.T / 1000) // 캔들 종료 시각(unix seconds)

      const entry = { time: closeTime, price: closePrice }
      closingPrices.push(entry)
      if (closingPrices.length > 100) closingPrices.shift()

      broadcast({ type: "closing", price: closePrice, time: closeTime })
      console.log(`[server] 30s kline closed: ${closePrice} at ${new Date(k.T).toISOString()}`)
    } catch {}
  })

  klineWs.on("close", () => {
    console.log("[server] kline_30s WS closed, reconnecting in 2s...")
    setTimeout(connectKline, 2000)
  })

  klineWs.on("error", (err) => {
    console.error("[server] kline_30s WS error:", err.message)
    klineWs.terminate()
  })
}

// ─── 시작 ─────────────────────────────────────────────────────
connectTrade()
connectKline()
