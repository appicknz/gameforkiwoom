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
const BINANCE_WS_URL = "wss://fstream.binance.com/ws/btcusdt@aggTrade"

// 연결된 클라이언트 목록
const clients = new Set()

// 집계 상태
const tradeBuffer = []
let prevThirtyBucket = null
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

// ─── Binance WebSocket ────────────────────────────────────────
let binanceWs = null

function connectBinance() {
  console.log("[server] connecting to Binance...")
  binanceWs = new WebSocket(BINANCE_WS_URL)

  binanceWs.on("open", () => {
    console.log("[server] Binance WS connected")
  })

  binanceWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString())
      tradeBuffer.push({
        price: parseFloat(msg.p),
        time: Math.floor(msg.T / 1000),
      })
    } catch {}
  })

  binanceWs.on("close", () => {
    console.log("[server] Binance WS closed, reconnecting in 2s...")
    setTimeout(connectBinance, 2000)
  })

  binanceWs.on("error", (err) => {
    console.error("[server] Binance WS error:", err.message)
    binanceWs.terminate()
  })
}

// ─── 1초 캔들 집계 타이머 ────────────────────────────────────
setInterval(() => {
  const now = Math.floor(Date.now() / 1000)
  const bucket = now // 1초 버킷

  // 현재 버킷의 체결 데이터
  const trades = tradeBuffer.filter((t) => t.time >= bucket)
  if (trades.length === 0) return

  const prices = trades.map((t) => t.price)
  const closingPrice = prices[prices.length - 1]

  latestPrice = { price: closingPrice, time: now }

  // 모든 클라이언트에게 현재가 브로드캐스트
  broadcast({ type: "price", price: closingPrice, time: now })

  // 30초 마감가 처리
  const thirtyBucket = now - (now % 30)
  if (prevThirtyBucket === null || thirtyBucket !== prevThirtyBucket) {
    prevThirtyBucket = thirtyBucket

    const entry = { time: thirtyBucket, price: closingPrice }
    closingPrices.push(entry)
    if (closingPrices.length > 100) closingPrices.shift()

    broadcast({ type: "closing", price: closingPrice, time: thirtyBucket })
    console.log(`[server] closing price: ${closingPrice} at ${new Date(thirtyBucket * 1000).toISOString()}`)
  }

  // 버퍼 정리 (5분 이전 데이터 제거)
  const cutoff = now - 300
  const cutoffIdx = tradeBuffer.findIndex((t) => t.time >= cutoff)
  if (cutoffIdx > 0) tradeBuffer.splice(0, cutoffIdx)
}, 1000)

// ─── 시작 ─────────────────────────────────────────────────────
connectBinance()
