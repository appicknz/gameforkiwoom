/**
 * BTC Price WebSocket Server - 원본 기능 + @ticker 실시간 느낌 결합
 * - 현재가: 현물 @ticker (매 1초 업데이트, c 필드 사용)
 * - 종가: 현물 kline_30s (k.x true 시 공식 종가)
 * - 원본처럼 init, closingPrices 유지
 */

const { WebSocket, WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8080;
const BINANCE_TICKER_URL = "wss://stream.binance.com:9443/ws/btcusdt@ticker"; // 매 1초 업데이트
const BINANCE_KLINE_URL = "wss://stream.binance.com:9443/ws/btcusdt@kline_30s";

const clients = new Set();
const closingPrices = []; // 최근 100개
let latestPrice = null;

// ─── 서버 WS ───────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: PORT });

wss.on("listening", () => {
  console.log(`[server] WebSocket server listening on port ${PORT}`);
});

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[server] client connected (total: ${clients.size})`);

  if (closingPrices.length > 0) {
    ws.send(JSON.stringify({ type: "init", closingPrices: closingPrices.slice(-100) }));
  }

  if (latestPrice !== null) {
    ws.send(JSON.stringify({ type: "price", price: latestPrice.price, time: latestPrice.time }));
  }

  ws.on("close", () => {
    clients.delete(ws);
    console.log(`[server] client disconnected (total: ${clients.size})`);
  });

  ws.on("error", () => clients.delete(ws));
});

// ─── 브로드캐스트 ──────────────────────────────────────────────────
function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  }
}

// ─── 공통 연결 함수 (ping/pong + heartbeat) ────────────────────────
function createBinanceWS(url, name, onClose) {
  console.log(`[${name}] connecting to ${url}...`);
  const ws = new WebSocket(url);

  ws.on("open", () => console.log(`[${name}] connected`));

  ws.on("ping", (data) => {
    ws.pong(data);
    console.log(`[${name}] Ping received → Pong sent`);
  });

  ws.on("close", () => {
    console.log(`[${name}] closed, reconnecting in 2s...`);
    setTimeout(onClose, 2000);
  });

  ws.on("error", (err) => {
    console.error(`[${name}] error:`, err.message);
    ws.terminate();
  });

  return ws;
}

// ─── @ticker (실시간 현재가, 매 1초) ──────────────────────────────
let tickerWs = null;

function connectTicker() {
  tickerWs = createBinanceWS(BINANCE_TICKER_URL, "ticker", connectTicker);

  tickerWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const price = parseFloat(msg.c); // 현재가 필드 'c'
      const time = Math.floor(msg.E / 1000); // 이벤트 시간

      if (isNaN(price) || price <= 0) return;

      latestPrice = { price, time };
      broadcast({ type: "price", price, time });

      // 로그 5초마다 (스팸 방지)
      if (!tickerWs.lastLog || Date.now() - tickerWs.lastLog > 5000) {
        console.log(`[price] BTC/USDT: ${price} @ ${new Date(time * 1000).toISOString()}`);
        tickerWs.lastLog = Date.now();
      }
    } catch (e) { }
  });
}

// ─── kline_30s (30초 종가, 원본 그대로) ────────────────────────────
let klineWs = null;

function connectKline() {
  klineWs = createBinanceWS(BINANCE_KLINE_URL, "kline_30s", connectKline);

  klineWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const k = msg.k;

      // k.x가 아닐 때도 로그 (디버그용: 메시지는 오는지 확인)
      if (!k) return;
      if (!k.x) {
        // 진행 중인 kline 메시지 - 5초마다만 로그
        if (!klineWs.lastKlineLog || Date.now() - klineWs.lastKlineLog > 5000) {
          console.log(`[kline_30s] in-progress: c=${k.c} x=${k.x}`);
          klineWs.lastKlineLog = Date.now();
        }
        return;
      }

      const closePrice = parseFloat(k.c);
      const closeTime = Math.floor(k.T / 1000);

      const entry = { time: closeTime, price: closePrice };
      closingPrices.push(entry);
      if (closingPrices.length > 100) closingPrices.shift();

      broadcast({ type: "closing", price: closePrice, time: closeTime });
      console.log(`[kline_30s] CLOSED: ${closePrice} at ${new Date(k.T).toISOString()} → broadcasting to ${clients.size} clients`);
    } catch (e) {
      console.error(`[kline_30s] parse error:`, e.message);
    }
  });
}

// ─── heartbeat ──────────────────────────────────────────────────────
setInterval(() => {
  if (tickerWs?.readyState === WebSocket.OPEN) tickerWs.pong();
  if (klineWs?.readyState === WebSocket.OPEN) klineWs.pong();
}, 30000);

// ─── 시작 ───────────────────────────────────────────────────────────
connectTicker();
connectKline();
