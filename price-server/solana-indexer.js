/**
 * Solana Token Deposit Indexer — WebSocket 민트 구독 방식
 *
 * ──────────────────────────────────────────────────────────────────
 *  구 방식 (폴링):  N명 사용자 × RPC 호출 = O(N) — 500명에서 한계
 *  신 방식 (구독):  TOKEN_MINT 주소 하나만 WebSocket 구독
 *                  TX 발생 시에만 처리 = O(TX 발생 수)
 *                  10만 명이어도 RPC 부하 동일
 * ──────────────────────────────────────────────────────────────────
 *
 * 흐름:
 *   1. logsSubscribe(TOKEN_MINT) → 해당 민트 관련 TX 실시간 수신
 *   2. getTransaction으로 postTokenBalances 파싱
 *   3. 수신자 wallet이 우리 DB에 있으면 → deposit webhook 호출
 *
 * Redis (Upstash):
 *   - 처리 완료 sig를 Redis에 저장 → Railway 재시작해도 중복 처리 없음
 *   - wallet_address → user_id 캐시 (DB 조회 최소화)
 *
 * 환경변수:
 *   SOLANA_RPC_HTTP          - Solana HTTP RPC URL
 *   SOLANA_RPC_WS            - Solana WebSocket RPC URL
 *   TOKEN_MINT_ADDRESS       - 감시할 토큰 mint address
 *   INTERNAL_SECRET          - Vercel webhook 인증 시크릿
 *   VERCEL_URL               - Vercel 배포 URL
 *   SUPABASE_URL             - Supabase REST URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   KV_REST_API_URL          - Upstash Redis REST URL
 *   KV_REST_API_TOKEN        - Upstash Redis REST token
 */

const WebSocket = require("ws")

const SOLANA_RPC_HTTP = process.env.SOLANA_RPC_HTTP   || "https://api.mainnet-beta.solana.com"
const SOLANA_RPC_WS   = process.env.SOLANA_RPC_WS     || "wss://api.mainnet-beta.solana.com"
const TOKEN_MINT      = process.env.TOKEN_MINT_ADDRESS
const VERCEL_URL      = process.env.VERCEL_URL?.startsWith("https://")
  ? process.env.VERCEL_URL
  : process.env.PRODUCTION_URL ?? process.env.VERCEL_URL
const INTERNAL_SECRET = process.env.INTERNAL_SECRET   || "tasko-internal"
const SUPABASE_URL    = process.env.SUPABASE_URL      || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY
const REDIS_URL       = process.env.KV_REST_API_URL
const REDIS_TOKEN     = process.env.KV_REST_API_TOKEN

// ─── Redis 헬퍼 (Upstash REST API) ───────────────────────────────────
async function redisCmd(...args) {
  if (!REDIS_URL || !REDIS_TOKEN) return null
  const res = await fetch(`${REDIS_URL}/${args.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  }).catch(() => null)
  if (!res?.ok) return null
  const json = await res.json().catch(() => null)
  return json?.result ?? null
}

// sig 처리 여부 확인 (Redis 우선, 없으면 false)
async function isSigProcessed(sig) {
  const r = await redisCmd("GET", `dep:sig:${sig}`)
  return r === "1"
}

// sig 처리 완료 표시 (7일 TTL)
async function markSigProcessed(sig) {
  await redisCmd("SET", `dep:sig:${sig}`, "1", "EX", String(7 * 24 * 3600))
}

// ─── 지갑 주소 캐시 (메모리 + Redis) ─────────────────────────────────
// walletAddress → userId 메모리 캐시 (Railway 재시작 시 초기화되지만 Redis로 복원)
const walletCache = new Map()

async function getUserIdByWallet(walletAddress) {
  // 1) 메모리 캐시
  if (walletCache.has(walletAddress)) return walletCache.get(walletAddress)

  // 2) Redis 캐시
  const cached = await redisCmd("GET", `dep:wallet:${walletAddress}`)
  if (cached) {
    walletCache.set(walletAddress, cached)
    return cached
  }

  // 3) Supabase DB 조회
  if (!SUPABASE_URL || !SUPABASE_KEY) return null
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=id&wallet_address=eq.${encodeURIComponent(walletAddress)}&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  ).catch(() => null)
  if (!res?.ok) return null
  const rows = await res.json().catch(() => [])
  const userId = rows[0]?.id ?? null

  if (userId) {
    walletCache.set(walletAddress, userId)
    // Redis에 24시간 캐시
    await redisCmd("SET", `dep:wallet:${walletAddress}`, userId, "EX", String(24 * 3600))
  }
  return userId
}

// ─── Solana RPC HTTP ──────────────────────────────────────────────────
async function solanaRpc(method, params) {
  const res = await fetch(SOLANA_RPC_HTTP, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }).catch(() => null)
  if (!res?.ok) return null
  const json = await res.json().catch(() => null)
  return json?.result ?? null
}

// ─── TX 파싱: 수신자와 토큰 delta 추출 ───────────────────────────────
async function parseDepositTx(signature) {
  const tx = await solanaRpc("getTransaction", [
    signature,
    { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
  ])
  if (!tx?.meta) return null

  const pre  = tx.meta.preTokenBalances  ?? []
  const post = tx.meta.postTokenBalances ?? []

  // TOKEN_MINT 관련 postTokenBalances 전부 순회
  for (const postBal of post) {
    if (postBal.mint !== TOKEN_MINT) continue

    const walletAddress = postBal.owner
    if (!walletAddress) continue

    // preBalance 찾기 (없으면 0 — 신규 token account)
    const preBal = pre.find(b => b.owner === walletAddress && b.mint === TOKEN_MINT)
    const preAmt  = Number(preBal?.uiTokenAmount?.uiAmount  ?? 0)
    const postAmt = Number(postBal.uiTokenAmount?.uiAmount  ?? 0)
    const delta   = postAmt - preAmt

    if (delta <= 0) continue  // 출금이거나 변화 없음 — 스킵

    // 우리 DB에 있는 지갑인지 확인
    const userId = await getUserIdByWallet(walletAddress)
    if (!userId) continue  // 우리 유저가 아님 — 스킵

    return { walletAddress, delta, userId }
  }

  return null  // 우리 유저로의 입금 없음
}

// ─── Vercel deposit webhook 호출 ─────────────────────────────────────
async function callDepositWebhook(signature, walletAddress, tokenAmount) {
  if (!VERCEL_URL) { console.error("[solana] VERCEL_URL not set"); return false }
  try {
    const res = await fetch(`${VERCEL_URL}/api/deposit/webhook`, {
      method:  "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({ signature, walletAddress, tokenAmount }),
    })
    if (res.ok) {
      console.log(`[solana] credited: ${walletAddress} +${tokenAmount} CHIPS (${signature})`)
      return true
    }
    const err = await res.text()
    console.error(`[solana] webhook ${res.status}: ${err}`)
    return false
  } catch (e) {
    console.error("[solana] webhook error:", e.message)
    return false
  }
}

// ─── TX 처리 엔트리포인트 ─────────────────────────────────────────────
// WebSocket logsSubscribe와 startup 스캔 모두 이 함수를 호출
const processingQueue = new Set()  // 동시에 같은 sig 중복 처리 방지

async function processTx(signature) {
  if (!signature || processingQueue.has(signature)) return
  processingQueue.add(signature)
  try {
    // Redis/메모리에서 이미 처리한 sig인지 확인
    if (await isSigProcessed(signature)) return

    const result = await parseDepositTx(signature)
    if (!result) {
      await markSigProcessed(signature)  // 우리 유저 아님도 기록 (재처리 방지)
      return
    }

    const { walletAddress, delta, userId } = result
    const ok = await callDepositWebhook(signature, walletAddress, delta)
    if (ok) await markSigProcessed(signature)
  } finally {
    processingQueue.delete(signature)
  }
}

// ─── WebSocket logsSubscribe — TOKEN_MINT 실시간 구독 ─────────────────
let ws = null
let reconnectTimeout = null
let subId = null
let lastMsgAt = Date.now()

function connectWebSocket() {
  if (ws) {
    try { ws.terminate() } catch (_) {}
    ws = null
  }
  clearTimeout(reconnectTimeout)

  console.log(`[solana] connecting WebSocket: ${SOLANA_RPC_WS}`)
  ws = new WebSocket(SOLANA_RPC_WS)

  ws.on("open", () => {
    console.log("[solana] WebSocket connected — subscribing to TOKEN_MINT logs")
    // logsSubscribe: TOKEN_MINT 주소를 포함한 모든 TX 로그 구독
    ws.send(JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "logsSubscribe",
      params: [
        { mentions: [TOKEN_MINT] },
        { commitment: "confirmed" },
      ],
    }))
  })

  ws.on("message", async (raw) => {
    lastMsgAt = Date.now()
    let msg
    try { msg = JSON.parse(raw) } catch { return }

    // 구독 확인
    if (msg.id === 1 && msg.result !== undefined) {
      subId = msg.result
      console.log(`[solana] subscribed (subId=${subId}) — watching TOKEN_MINT: ${TOKEN_MINT}`)
      return
    }

    // TX 알림
    if (msg.method === "logsNotification") {
      const { signature, err } = msg.params?.result?.value ?? {}
      if (!signature || err) return  // 실패 TX 무시
      // 비동기로 처리 (WebSocket 메시지 루프 블록 방지)
      processTx(signature).catch(e => console.error("[solana] processTx error:", e.message))
    }
  })

  ws.on("close", (code) => {
    console.log(`[solana] WebSocket closed (${code}) — reconnecting in 5s`)
    reconnectTimeout = setTimeout(connectWebSocket, 5000)
  })

  ws.on("error", (e) => {
    console.error("[solana] WebSocket error:", e.message)
    // close 이벤트가 이어서 발생하므로 여기서는 reconnect 안 함
  })
}

// ─── Startup 스캔: Railway 재시작 시 놓친 TX 처리 ─────────────────────
// 서버 시작 시 TOKEN_MINT의 최근 TX를 스캔해 미처리된 것 처리
async function startupScan() {
  console.log("[solana] startup scan — checking recent TOKEN_MINT transactions...")
  const sigs = await solanaRpc("getSignaturesForAddress", [
    TOKEN_MINT,
    { limit: 50, commitment: "confirmed" },
  ])
  if (!sigs?.length) {
    console.log("[solana] startup scan: no recent txs found")
    return
  }

  let found = 0
  for (const { signature, err } of sigs) {
    if (err) continue
    if (await isSigProcessed(signature)) continue  // 이미 처리됨
    found++
    await processTx(signature)
  }
  console.log(`[solana] startup scan complete — processed ${found} new txs`)
}

// ─── 초기화 ───────────────────────────────────────────────────────────
async function startSolanaIndexer() {
  if (!TOKEN_MINT) {
    console.warn("[solana] TOKEN_MINT_ADDRESS not set — indexer disabled")
    return
  }

  console.log(`[solana] indexer starting — mint: ${TOKEN_MINT}`)
  console.log(`[solana] architecture: WebSocket mint subscription (O(TX), not O(users))`)

  // 1) 시작 시 놓친 TX 스캔
  await startupScan()

  // 2) WebSocket 실시간 구독 시작
  connectWebSocket()

  // 3) 30분마다 놓친 TX 보완 스캔 (WebSocket이 잠깐 끊긴 사이 발생한 TX 대비)
  setInterval(startupScan, 30 * 60 * 1000)

  // 4) WebSocket 헬스체크: 2분간 메시지 없으면 재연결
  setInterval(() => {
    if (Date.now() - lastMsgAt > 2 * 60 * 1000) {
      console.log("[solana] WebSocket heartbeat timeout — reconnecting")
      connectWebSocket()
    }
  }, 60 * 1000)
}

module.exports = { startSolanaIndexer }
