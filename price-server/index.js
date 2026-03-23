카/**
 * BTC Price WebSocket Server
 * - 현재가: 현물 @aggTrade (실시간)
 * - 종가: aggTrade 기반 서버 시간 30초 버킷 판정 (kline_30s 차단 우회)
 *   → 서버 UTC 기준 00초/30초에 직전 가격을 closing으로 브로드캐스트
 */

const { WebSocket, WebSocketServer } = require("ws");

const PORT = process.env.PORT || 8080;
const BINANCE_TRADE_URL = "wss://stream.binance.com:9443/ws/btcusdt@aggTrade";

const clients = new Set();
const closingPrices = []; // 최근 100개
let latestPrice = null;
let lastBucket = null;          // 현재 30초 버킷 번호 (Math.floor(now/30))
let lastTradePrice = null;      // 마지막으로 받은 거래 가격
let prevBucketLastPrice = null; // 이전 버킷의 마지막 가격 (closing 확정용)
let lastPriceBroadcastSec = 0;  // 마지막으로 price를 브로드캐스트한 초 (1초 스로틀)

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

// ─── aggTrade (실시간 현재가 + 30초 버킷 기반 closing 판정) ─────────
let tradeWs = null;

function connectTrade() {
  tradeWs = createBinanceWS(BINANCE_TRADE_URL, "aggTrade", connectTrade);

  tradeWs.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      const price = parseFloat(msg.p);
      const time = Math.floor(msg.T / 1000);

      if (isNaN(price) || price <= 0) return;

      // ── 30초 버킷 기반 closing 판정 ──────────────────────────
      // 버킷이 바뀌는 시점을 먼저 판정 → 이전 버킷의 마지막 가격(prevBucketLastPrice) 사용
      const nowSec = Math.floor(Date.now() / 1000);
      const bucket = Math.floor(nowSec / 30);

      if (lastBucket !== null && bucket !== lastBucket) {
        // 버킷이 바뀜: prevBucketLastPrice = 이전 버킷에서 마지막으로 받은 거래 가격
        const closePrice = prevBucketLastPrice ?? lastTradePrice;
        const closeTime = lastBucket * 30; // 마감 시각 (이전 버킷 시작 초)

        const entry = { time: closeTime, price: closePrice };
        closingPrices.push(entry);
        if (closingPrices.length > 100) closingPrices.shift();

        broadcast({ type: "closing", price: closePrice, time: closeTime });
        console.log(`[closing] bucket ${lastBucket}→${bucket}: ${closePrice} @ ${new Date(closeTime * 1000).toISOString()} → ${clients.size} clients`);

        // 새 버킷으로 전환: 이전 버킷의 마지막 가격 초기화
        prevBucketLastPrice = null;
      }

      // 버킷 판정 이후 현재 가격 업데이트
      lastBucket = bucket;
      prevBucketLastPrice = price; // 이 버킷에서 마지막으로 받은 가격
      lastTradePrice = price;
      latestPrice = { price, time };

      // 현재가 브로드캐스트: 1초에 한 번만 (aggTrade는 초당 수십 개)
      if (nowSec > lastPriceBroadcastSec) {
        lastPriceBroadcastSec = nowSec;
        broadcast({ type: "price", price, time });
        // 로그 5초마다
        if (!tradeWs.lastLog || Date.now() - tradeWs.lastLog > 5000) {
          console.log(`[price] BTC/USDT: ${price} @ ${new Date(time * 1000).toISOString()}`);
          tradeWs.lastLog = Date.now();
        }
      }

    } catch (e) { }
  });
}

// ─── heartbeat ──────────────────────────────────────────────────────
setInterval(() => {
  if (tradeWs?.readyState === WebSocket.OPEN) tradeWs.pong();
}, 30000);

// ─── 시작 ───────────────────────────────────────────────────────────
connectTrade();
