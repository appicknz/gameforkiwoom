/**
 * BTC Price WebSocket Server
 * - 현재가: 현물 @aggTrade (실시간)
 * - 종가: aggTrade 기반 서버 시간 30초 버킷 판정 (kline_30s 차단 우회)
 *   → 서버 UTC 기준 00초/30초에 직전 가격을 closing으로 브로드캐스트
 */

const { WebSocket, WebSocketServer } = require("ws");
const https = require("https");

const PORT = process.env.PORT || 8080;
const BINANCE_TRADE_URL = "wss://stream.binance.com:9443/ws/btcusdt@aggTrade";

// Supabase REST API로 DB에서 최근 closing 가격 복원
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

function fetchRecentClosingPrices() {
  return new Promise((resolve) => {
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.log("[restore] No Supabase env vars, skipping DB restore");
      return resolve([]);
    }
    const url = `${SUPABASE_URL}/rest/v1/btc_closing_prices?order=time.desc&limit=100`;
    const options = {
      headers: {
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
      },
    };
    https.get(url, options, (res) => {
      let body = "";
      res.on("data", (d) => body += d);
      res.on("end", () => {
        try {
          const rows = JSON.parse(body);
          if (!Array.isArray(rows)) return resolve([]);
          // 오름차순 정렬 (최신순으로 받았으므로 역순)
          const sorted = rows
            .filter(r => r.time && r.price)
            .map(r => ({ time: Number(r.time), price: parseFloat(r.price) }))
            .sort((a, b) => a.time - b.time);
          console.log(`[restore] Loaded ${sorted.length} closing prices from DB`);
          resolve(sorted);
        } catch (e) {
          console.error("[restore] Parse error:", e.message);
          resolve([]);
        }
      });
    }).on("error", (e) => {
      console.error("[restore] HTTP error:", e.message);
      resolve([]);
    });
  });
}

const clients = new Set();
const closingPrices = []; // 최근 100개
let latestPrice = null;
let lastBucket = null;
let lastTradePrice = null;
let prevBucketLastPrice = null;
let lastPriceBroadcastSec = 0;

// ─── Race 스코어 서버 계산 ──────────────────────────────────────────
// 5분(300초) 라운드, 0~59초 배팅, 60~299초 레이싱
// 1초 price tick마다 레이싱 구간이면 bit(소수점 첫째)·coin(소수점 둘째) 누적
// 모든 클라이언트에 동일한 값을 브로드캐스트 → 기기/접속 시점 무관
const RACE_ROUND_SEC = 300;
const RACE_BETTING_SEC = 60;

// roundId → { bit, coin } 현재 라운드 스코어 (이전 라운드는 폐기)
let raceCurrentRoundId = -1;
let raceBitScore = 0;
let raceCoinScore = 0;

function getRaceRoundId(nowSec) {
  return Math.floor(nowSec / RACE_ROUND_SEC);
}
function getRaceSecInRound(nowSec) {
  return nowSec % RACE_ROUND_SEC;
}

function updateRaceScore(price, nowSec) {
  const roundId = getRaceRoundId(nowSec);
  const secInRound = getRaceSecInRound(nowSec);

  // 새 라운드 진입 → 스코어 초기화
  if (roundId !== raceCurrentRoundId) {
    raceCurrentRoundId = roundId;
    raceBitScore = 0;
    raceCoinScore = 0;
  }

  // 레이싱 구간(60~298초)에서만 득점
  if (secInRound < RACE_BETTING_SEC || secInRound >= RACE_ROUND_SEC - 2) return;

  const dec = price.toFixed(2).split(".")[1] ?? "00";
  raceBitScore  += parseInt(dec[0] ?? "0");
  raceCoinScore += parseInt(dec[1] ?? "0");
}

// ─── 서버 WS ───────────────────────────────────────────────────────
const wss = new WebSocketServer({ port: PORT });

wss.on("listening", () => {
  console.log(`[server] WebSocket server listening on port ${PORT}`);
});

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`[server] client connected (total: ${clients.size})`);

  // init: closing 히스토리 + 현재 race 스코어 (접속 시점에 관계없이 동기화)
  ws.send(JSON.stringify({
    type: "init",
    closingPrices: closingPrices.slice(-100),
    raceScore: {
      roundId: raceCurrentRoundId,
      bit:     raceBitScore,
      coin:    raceCoinScore,
    },
  }));

  if (latestPrice !== null) {
    ws.send(JSON.stringify({
      type: "price",
      price: latestPrice.price,
      time: latestPrice.time,
      raceScore: { roundId: raceCurrentRoundId, bit: raceBitScore, coin: raceCoinScore },
    }));
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

// ─── 정산 엔진 — closing 시 Railway에서 직접 실행 ─────────────────────
// Vercel game/play 대신 여기서 정산: 클라이언트 요청 없이 서버가 주도
const VERCEL_URL = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_APP_URL;

function triggerSettlement(closePrice, closeTime) {
  if (!VERCEL_URL) {
    console.log("[engine] No VERCEL_URL, skipping settlement trigger");
    return;
  }
  const url = `${VERCEL_URL}/api/game/settle`;
  const body = JSON.stringify({ closePrice, closeTime, source: "price-server" });
  const options = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": process.env.INTERNAL_SECRET || "tasko-internal",
    },
  };
  // fire-and-forget, 에러는 로그만
  const req = url.startsWith("https")
    ? require("https").request(url, options)
    : require("http").request(url, options);
  req.on("error", (e) => console.error("[engine] settlement trigger error:", e.message));
  req.write(body);
  req.end();
  console.log(`[engine] settlement triggered: closePrice=${closePrice}, time=${closeTime}`);
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
      const nowSec = Math.floor(Date.now() / 1000);
      const bucket = Math.floor(nowSec / 30);

      if (lastBucket !== null && bucket !== lastBucket) {
        const closePrice = prevBucketLastPrice ?? lastTradePrice;
        const closeTime = lastBucket * 30;

        const entry = { time: closeTime, price: closePrice };
        closingPrices.push(entry);
        if (closingPrices.length > 100) closingPrices.shift();

        broadcast({ type: "closing", price: closePrice, time: closeTime });
        console.log(`[closing] bucket ${lastBucket}→${bucket}: ${closePrice} @ ${new Date(closeTime * 1000).toISOString()} → ${clients.size} clients`);

        // 게임 엔진: 매 30초마다 Vercel game/settle 호출
        // baccarat 정산 + race는 5분 라운드 마지막 30초 tick에서 game/settle 내부에서 자동 판단
        triggerSettlement(closePrice, closeTime);

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
        // race 스코어 서버 계산 (1초마다 레이싱 구간이면 누적)
        updateRaceScore(price, nowSec);
        broadcast({
          type: "price",
          price,
          time,
          raceScore: { roundId: raceCurrentRoundId, bit: raceBitScore, coin: raceCoinScore },
        });
        // 로그 5초마다
        if (!tradeWs.lastLog || Date.now() - tradeWs.lastLog > 5000) {
          console.log(`[price] BTC/USDT: ${price} @ ${new Date(time * 1000).toISOString()} race=${raceCurrentRoundId} bit=${raceBitScore} coin=${raceCoinScore}`);
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

// ─── 시작: DB에서 closing 복원 후 Binance 연결 ───────────────────────
(async () => {
  const restored = await fetchRecentClosingPrices();
  if (restored.length > 0) {
    closingPrices.push(...restored);
    if (closingPrices.length > 100) closingPrices.splice(0, closingPrices.length - 100);
    console.log(`[restore] Seeded ${closingPrices.length} closing prices into memory`);
  }
  connectTrade();
})();
