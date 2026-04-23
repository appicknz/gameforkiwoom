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
// 3분(180초) 라운드: 0~9초=정산, 10~59초=배팅, 60~179초=레이싱
// 1초 price tick마다 레이싱 구간이면 bit(소수점 첫째)·coin(소수점 둘째) 누적
// 모든 클라이언트에 동일한 값을 브로드캐스트 → 기기/접속 시점 무관
const RACE_ROUND_SEC = 180;
const RACE_BETTING_SEC = 60;   // 배팅 시작 offset (0~9초=정산, 10초부터 배팅)

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

  // 새 라운드 진입 → 직전 라운드 스코어를 DB에 저장 후 초기화
  if (roundId !== raceCurrentRoundId) {
    // 직전 라운드 스코어가 있으면 DB 저장
    if (raceCurrentRoundId >= 0 && (raceBitScore > 0 || raceCoinScore > 0)) {
      const winner = raceBitScore > raceCoinScore ? "bit"
        : raceCoinScore > raceBitScore ? "coin" : "tie";
      const endTime = (raceCurrentRoundId + 1) * RACE_ROUND_SEC;
      const lastPriceVal = latestPrice ? latestPrice.price : 0;
      saveRaceResultToDB(endTime, lastPriceVal, raceBitScore, raceCoinScore, winner);
      console.log(`[race] round ${raceCurrentRoundId} ended: B${raceBitScore}/C${raceCoinScore} winner=${winner}`);
    }
    raceCurrentRoundId = roundId;
    raceBitScore = 0;
    raceCoinScore = 0;
  }

  // 레이싱 구간(60~178초)에서만 득점
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

// ─── closing 가격 서버에서 직접 DB 저장 (클라이언트 접속 여부 무관) ────
function saveClosingPriceToDB(closePrice, closeTime) {
  // Railway에 Supabase 환경변수가 없으면 Vercel API를 통해 저장
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log("[db] No Supabase env vars, using Vercel API fallback");
    if (!VERCEL_URL) {
      console.log("[db] No VERCEL_URL either, cannot save closing price");
      return;
    }
    // Vercel의 /api/closing-price POST 호출
    const decStr = closePrice.toFixed(2).split(".")[1] || "00";
    const d1 = parseInt(decStr[0] || "0");
    const d2 = parseInt(decStr[1] || "0");
    const baccaratResult = d2 <= 4 ? "player" : d2 <= 8 ? "banker" : "tie";

    const body = JSON.stringify({
      price: closePrice,
      time: closeTime,
      baccarat_result: baccaratResult,
      b_score: d1,
      p_score: d2,
      b_raw_sum: d1,
      p_raw_sum: d2,
    });

    const parsedUrl = new URL(`${VERCEL_URL}/api/closing-price`);
    const proto = parsedUrl.protocol === "https:" ? https : require("http");
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.pathname,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
    };
    const req = proto.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => data += chunk);
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[db] saved via Vercel API: ${closePrice} @ ${closeTime}`);
        } else {
          console.error(`[db] Vercel API failed: ${res.statusCode} ${data}`);
        }
      });
    });
    req.on("error", (e) => console.error("[db] Vercel API error:", e.message));
    req.write(body);
    req.end();
    return;
  }
  // BTC 가격 → 소수점 끝자리 점수 계산
  const decStr = closePrice.toFixed(2).split(".")[1] || "00";
  const d1 = parseInt(decStr[0] || "0");  // 소수점 첫째 → 뱅커 3번째 카드
  const d2 = parseInt(decStr[1] || "0");  // 소수점 둘째 → 플레이어 3번째 카드

  // 카드 합산 시뮬레이션 — 클라이언트 startDeal()과 동일 seed/순서
  // 클라이언트 호출순서: rand()→p1숫자, randSuit(), rand()→b1숫자, randSuit(),
  //                     rand()→p2숫자, randSuit(), rand()→b2숫자, randSuit()
  const roundNum = Math.floor(closeTime / 30);
  const makeSeededRand = (seed) => {
    let s = seed >>> 0;
    return () => {
      s = Math.imul(s ^ (s >>> 15), s | 1);
      s ^= s + Math.imul(s ^ (s >>> 7), s | 61);
      return ((s ^ (s >>> 14)) >>> 0) / 0x100000000;
    };
  };
  const seeded   = makeSeededRand(roundNum);
  const rand     = () => Math.floor(seeded() * 10);
  const randSuit = () => Math.floor(seeded() * 4);
  const p1v = rand(); randSuit();
  const b1v = rand(); randSuit();
  const p2v = rand(); randSuit();
  const b2v = rand(); randSuit();
  const pTotal = (p1v + p2v + d2) % 10;
  const bTotal = (b1v + b2v + d1) % 10;
  const baccaratResult = pTotal > bTotal ? "player" : bTotal > pTotal ? "banker" : "tie";

  const body = JSON.stringify({
    time: closeTime,
    price: closePrice,
    baccarat_result: baccaratResult,
    b_score: d1,
    p_score: d2,
    b_raw_sum: d1,
    p_raw_sum: d2,
  });

  // URL 파싱 (https.request는 URL 문자열 지원 안 함)
  // on_conflict=time: time 컬럼 unique 충돌 시 merge (upsert)
  const parsedUrl = new URL(`${SUPABASE_URL}/rest/v1/btc_closing_prices?on_conflict=time`);
  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: `${parsedUrl.pathname}${parsedUrl.search}`,
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "Prefer": "resolution=merge-duplicates",
    },
  };

  const req = https.request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => data += chunk);
    res.on("end", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log(`[db] saved closing price: ${closePrice} @ ${closeTime} (B${d1}/P${d2})`);
      } else {
        console.error(`[db] save failed: ${res.statusCode} ${data}`);
      }
    });
  });
  req.on("error", (e) => console.error("[db] closing price save error:", e.message));
  req.write(body);
  req.end();
}

// ─── race 라운드별 가격 누적 (180초 라운드, 30초 tick × 6) ──────────
// Map<raceRoundNumber, { prices: number[], lastPrice: number }>
const raceRoundPrices = new Map();

function accumulateRacePrice(closePrice, closeTime) {
  const raceRound = Math.floor(closeTime / 180);
  if (!raceRoundPrices.has(raceRound)) {
    raceRoundPrices.set(raceRound, { prices: [], lastPrice: closePrice });
  }
  const entry = raceRoundPrices.get(raceRound);
  entry.prices.push(closePrice);
  entry.lastPrice = closePrice;

  // 이전 라운드가 방금 끝났는지 확인 — 새 라운드의 첫 tick
  const prevRound = raceRound - 1;
  if (raceRoundPrices.has(prevRound)) {
    const prev = raceRoundPrices.get(prevRound);
    // 이미 저장 시도한 라운드는 스킵
    if (!prev.saved) {
      prev.saved = true;
      // bit(d1) + coin(d2) 집계
      let bitScore = 0, coinScore = 0;
      for (const p of prev.prices) {
        const dec = p.toFixed(2).split(".")[1] || "00";
        bitScore  += parseInt(dec[0] || "0");
        coinScore += parseInt(dec[1] || "0");
      }
      const winner = bitScore > coinScore ? "bit" : coinScore > bitScore ? "coin" : "tie";
      const endTime = prevRound * 180 + 180; // 라운드 종료 시각
      saveRaceResultToDB(endTime, prev.lastPrice, bitScore, coinScore, winner);
    }
    // 오래된 라운드 메모리 정리 (2라운드 이상 전)
    for (const [k] of raceRoundPrices) {
      if (k < raceRound - 1) raceRoundPrices.delete(k);
    }
  }
}

function saveRaceResultToDB(time, price, bitScore, coinScore, winner) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.log("[race-db] No Supabase env vars, cannot save race result");
    return;
  }
  const body = JSON.stringify({ time, price, bit_score: bitScore, coin_score: coinScore, winner });
  const parsedUrl = new URL(`${SUPABASE_URL}/rest/v1/race_results?on_conflict=time`);
  const options = {
    hostname: parsedUrl.hostname,
    port: 443,
    path: `${parsedUrl.pathname}${parsedUrl.search}`,
    method: "POST",
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
      "Prefer": "resolution=merge-duplicates",
    },
  };
  const req = require("https").request(options, (res) => {
    let data = "";
    res.on("data", (chunk) => data += chunk);
    res.on("end", () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log(`[race-db] saved: time=${time} B${bitScore}/C${coinScore} winner=${winner}`);
      } else {
        console.error(`[race-db] save failed: ${res.statusCode} ${data}`);
      }
    });
  });
  req.on("error", (e) => console.error("[race-db] save error:", e.message));
  req.write(body);
  req.end();
}

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
  // fire-and-forget, 에러는 로���만
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

        // 클라이언트 접속 여부와 무관하게 서버에서 직접 DB 저장
        saveClosingPriceToDB(closePrice, closeTime);

        // 게임 엔진: 매 30초마다 Vercel game/settle 호출
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
