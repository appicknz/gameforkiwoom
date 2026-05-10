/**
 * Solana Token Deposit Indexer
 *
 * 동작 방식:
 * 1. Supabase에서 모든 유저의 wallet_address 목록을 주기적으로 조회
 * 2. Solana WebSocket으로 각 지갑에 대해 logsSubscribe
 * 3. 특정 토큰(TOKEN_MINT_ADDRESS) Transfer 감지 시
 *    → Solana RPC로 트랜잭션 상세 파싱
 *    → Vercel /api/deposit/webhook 호출 → 잔고 적립
 *
 * 환경변수:
 *   SOLANA_RPC_WS    - Solana WebSocket URL (예: wss://api.mainnet-beta.solana.com)
 *   SOLANA_RPC_HTTP  - Solana HTTP RPC URL
 *   TOKEN_MINT_ADDRESS - 감시할 pump.fun 토큰 mint address
 *   INTERNAL_SECRET  - Vercel webhook 인증 시크릿
 *   VERCEL_URL       - Vercel 배포 URL (https://...)
 *   SUPABASE_URL     - Supabase REST URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase 서비스 롤 키
 */

const { WebSocket } = require("ws")

const SOLANA_RPC_WS   = process.env.SOLANA_RPC_WS   || "wss://api.mainnet-beta.solana.com"
const SOLANA_RPC_HTTP = process.env.SOLANA_RPC_HTTP  || "https://api.mainnet-beta.solana.com"
const TOKEN_MINT      = process.env.TOKEN_MINT_ADDRESS
const VERCEL_URL      = process.env.VERCEL_URL
const INTERNAL_SECRET = process.env.INTERNAL_SECRET  || "tasko-internal"
const SUPABASE_URL    = process.env.SUPABASE_URL      || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY

// 감시 중인 지갑 주소 → userId 매핑
const watchMap = new Map()  // walletAddress → userId
let   solanaWs = null
let   wsReady  = false
const pendingSubs = []
const subscriptionIds = new Map()  // walletAddress → subscriptionId
let   requestId = 1

// ─── Supabase: 전체 유저 지갑 목록 조회 ──────────────────────────────
async function fetchWallets() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return []
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=id,wallet_address&wallet_address=not.is.null`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  ).catch(() => null)
  if (!res || !res.ok) return []
  return res.json().catch(() => [])
}

// ─── Solana RPC HTTP 호출 ─────────────────────────────────────────────
async function solanaRpc(method, params) {
  const res = await fetch(SOLANA_RPC_HTTP, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }).catch(() => null)
  if (!res || !res.ok) return null
  const json = await res.json().catch(() => null)
  return json?.result ?? null
}

// ─── 트랜잭션 파싱: 특정 지갑에 들어온 토큰 수량 추출 ────────────────
async function parseTokenTransfer(signature, recipientAddress) {
  const tx = await solanaRpc("getTransaction", [
    signature,
    { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
  ])
  if (!tx) return null

  const preBalances  = tx.meta?.preTokenBalances  ?? []
  const postBalances = tx.meta?.postTokenBalances ?? []

  // recipient 주소의 TOKEN_MINT 잔고 변화량 계산
  const recipientPre = preBalances.find(
    b => b.owner === recipientAddress && b.mint === TOKEN_MINT
  )
  const recipientPost = postBalances.find(
    b => b.owner === recipientAddress && b.mint === TOKEN_MINT
  )

  if (!recipientPost) return null

  const preAmount  = Number(recipientPre?.uiTokenAmount?.uiAmount  ?? 0)
  const postAmount = Number(recipientPost.uiTokenAmount?.uiAmount  ?? 0)
  const delta      = postAmount - preAmount

  if (delta <= 0) return null  // 수신이 아님

  return {
    tokenAmount: delta,
    decimals:    recipientPost.uiTokenAmount.decimals,
    rawAmount:   Number(recipientPost.uiTokenAmount.amount) - Number(recipientPre?.uiTokenAmount?.amount ?? 0),
  }
}

// ─── Vercel deposit webhook 호출 ─────────────────────────────────────
async function callDepositWebhook(signature, walletAddress, tokenAmount) {
  if (!VERCEL_URL) { console.error("[solana] VERCEL_URL not set"); return }

  const body = JSON.stringify({ signature, walletAddress, tokenAmount })
  const url  = `${VERCEL_URL}/api/deposit/webhook`

  try {
    const res = await fetch(url, {
      method:  "POST",
      headers: {
        "Content-Type":    "application/json",
        "x-internal-secret": INTERNAL_SECRET,
      },
      body,
    })
    if (res.ok) {
      console.log(`[solana] deposit processed: ${signature} +${tokenAmount} tokens → ${walletAddress}`)
    } else {
      const err = await res.text()
      console.error(`[solana] webhook failed ${res.status}: ${err}`)
    }
  } catch (e) {
    console.error("[solana] webhook error:", e.message)
  }
}

// ─── 로그 구독 처리 ───────────────────────────────────────────────────
function onLog(log, walletAddress) {
  // TOKEN_MINT 관련 로그만 처리
  const logs = log.logs ?? []
  const hasMint = logs.some(l => TOKEN_MINT && l.includes(TOKEN_MINT))
  if (!hasMint) return

  const signature = log.signature
  console.log(`[solana] token activity detected: ${signature} at ${walletAddress}`)

  // 확인 대기 후 트랜잭션 파싱
  setTimeout(async () => {
    const transfer = await parseTokenTransfer(signature, walletAddress)
    if (!transfer) return
    await callDepositWebhook(signature, walletAddress, transfer.tokenAmount)
  }, 3000)  // 3초 대기 (confirmed 상태 보장)
}

// ─── Solana WebSocket 연결 ────────────────────────────────────────────
function sendWs(payload) {
  if (wsReady && solanaWs?.readyState === WebSocket.OPEN) {
    solanaWs.send(JSON.stringify(payload))
  } else {
    pendingSubs.push(payload)
  }
}

function subscribeWallet(walletAddress) {
  if (subscriptionIds.has(walletAddress)) return  // 이미 구독 중
  const id = requestId++
  sendWs({
    jsonrpc: "2.0",
    id,
    method:  "logsSubscribe",
    params:  [
      { mentions: [walletAddress] },
      { commitment: "confirmed" },
    ],
  })
  subscriptionIds.set(walletAddress, id)
  console.log(`[solana] subscribed: ${walletAddress}`)
}

function connectSolana() {
  console.log(`[solana] connecting to ${SOLANA_RPC_WS}`)
  solanaWs = new WebSocket(SOLANA_RPC_WS)

  solanaWs.on("open", () => {
    wsReady = true
    console.log("[solana] WebSocket connected")
    // 대기 중인 구독 전송
    for (const payload of pendingSubs) {
      solanaWs.send(JSON.stringify(payload))
    }
    pendingSubs.length = 0
    // 이미 맵에 있는 지갑 재구독
    subscriptionIds.clear()
    for (const [addr] of watchMap) {
      subscribeWallet(addr)
    }
  })

  solanaWs.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString())
      if (msg.method === "logsNotification") {
        const { result } = msg.params
        const walletAddress = [...watchMap.keys()].find(addr =>
          result.value.logs?.some(l => l.includes(addr))
          || result.value.signature
        )
        if (walletAddress) onLog(result.value, walletAddress)
      }
    } catch {}
  })

  solanaWs.on("close", () => {
    wsReady = false
    console.log("[solana] WebSocket disconnected, reconnecting in 5s...")
    setTimeout(connectSolana, 5000)
  })

  solanaWs.on("error", (e) => {
    console.error("[solana] WebSocket error:", e.message)
  })
}

// ─── 지갑 목록 동기화 (5분마다) ──────────────────────────────────────
async function syncWallets() {
  const wallets = await fetchWallets()
  let added = 0
  for (const { id, wallet_address } of wallets) {
    if (!wallet_address) continue
    if (!watchMap.has(wallet_address)) {
      watchMap.set(wallet_address, id)
      subscribeWallet(wallet_address)
      added++
    }
  }
  if (added > 0) console.log(`[solana] synced ${added} new wallets (total: ${watchMap.size})`)
}

// ─── 초기화 ───────────────────────────────────────────────────────────
async function startSolanaIndexer() {
  if (!TOKEN_MINT) {
    console.warn("[solana] TOKEN_MINT_ADDRESS not set — Solana indexer disabled")
    return
  }

  console.log(`[solana] starting indexer for mint: ${TOKEN_MINT}`)

  // 최초 지갑 목록 로드
  await syncWallets()

  // Solana WebSocket 연결
  connectSolana()

  // 5분마다 신규 가입 유저 지갑 동기화
  setInterval(syncWallets, 5 * 60 * 1000)
}

module.exports = { startSolanaIndexer }
