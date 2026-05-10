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

const SOLANA_RPC_HTTP = process.env.SOLANA_RPC_HTTP  || "https://api.mainnet-beta.solana.com"
const TOKEN_MINT      = process.env.TOKEN_MINT_ADDRESS
// VERCEL_URL은 반드시 프로덕션 도메인으로 설정 (예: https://www.coinrace.live)
// Railway 환경변수에서 VERCEL_URL=https://www.coinrace.live 으로 설정 필요
const VERCEL_URL      = process.env.VERCEL_URL?.startsWith("https://")
  ? process.env.VERCEL_URL
  : process.env.PRODUCTION_URL ?? process.env.VERCEL_URL
const INTERNAL_SECRET = process.env.INTERNAL_SECRET  || "tasko-internal"
const SUPABASE_URL    = process.env.SUPABASE_URL      || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY

// 감시 중인 지갑 주소 Set
const walletSet = new Set()

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

  // 프리뷰 URL이면 경고 (삭제된 배포라 404 발생)
  if (VERCEL_URL.includes(".vercel.app") && !VERCEL_URL.startsWith("https://www.")) {
    console.warn(`[solana] WARNING: VERCEL_URL is a preview URL (${VERCEL_URL}) — set to production domain!`)
  }

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

// ─── 처리 완료 signature 중복 방지 ───────────────────────────────────
const processedSigs = new Set()

// ─── 단일 지갑의 최근 트랜잭션 폴링 ─────────────────────────────────
async function pollWallet(walletAddress) {
  // 1) 해당 지갑의 CHIPS token account 조회 (Token2022)
  const tokenAccRes = await solanaRpc("getTokenAccountsByOwner", [
    walletAddress,
    { mint: TOKEN_MINT },
    { encoding: "jsonParsed", programId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" },
  ])

  // Token2022가 없으면 표준 SPL로 재시도
  const accounts = tokenAccRes?.value?.length
    ? tokenAccRes.value
    : (await solanaRpc("getTokenAccountsByOwner", [
        walletAddress,
        { mint: TOKEN_MINT },
        { encoding: "jsonParsed" },
      ]))?.value ?? []

  if (!accounts.length) return

  const tokenAccountPubkey = accounts[0].pubkey

  // 2) 최근 10개 트랜잭션 signature 조회
  const sigs = await solanaRpc("getSignaturesForAddress", [
    tokenAccountPubkey,
    { limit: 10, commitment: "confirmed" },
  ])
  if (!sigs?.length) return

  for (const { signature, err } of sigs) {
    if (err || processedSigs.has(signature)) continue

    // 3) 트랜잭션 파싱
    const tx = await solanaRpc("getTransaction", [
      signature,
      { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
    ])
    if (!tx) continue

    const pre  = tx.meta?.preTokenBalances  ?? []
    const post = tx.meta?.postTokenBalances ?? []

    const recipientPost = post.find(b => b.owner === walletAddress && b.mint === TOKEN_MINT)
    if (!recipientPost) {
      processedSigs.add(signature)
      continue
    }
    const recipientPre = pre.find(b => b.owner === walletAddress && b.mint === TOKEN_MINT)

    const preAmt  = Number(recipientPre?.uiTokenAmount?.uiAmount  ?? 0)
    const postAmt = Number(recipientPost.uiTokenAmount?.uiAmount  ?? 0)
    const delta   = postAmt - preAmt

    processedSigs.add(signature)
    if (delta <= 0) continue

    console.log(`[solana] deposit detected: ${walletAddress} +${delta} CHIPS (${signature})`)
    await callDepositWebhook(signature, walletAddress, delta)
  }

  // set이 너무 커지면 오래된 것 제거
  if (processedSigs.size > 50000) {
    const iter = processedSigs.values()
    for (let i = 0; i < 10000; i++) processedSigs.delete(iter.next().value)
  }
}

// ─── 전체 지갑 폴링 루프 ─────────────────────────────────────────────
async function pollAllWallets() {
  if (walletSet.size === 0) return
  console.log(`[solana] polling ${walletSet.size} wallets...`)
  for (const addr of walletSet) {
    await pollWallet(addr).catch(e => console.error(`[solana] poll error ${addr}:`, e.message))
  }
}

// ─── 지갑 목록 동기화 (5분마다) ──────────────────────────────────────
async function syncWallets() {
  const wallets = await fetchWallets()
  let added = 0
  for (const { wallet_address } of wallets) {
    if (!wallet_address || walletSet.has(wallet_address)) continue
    walletSet.add(wallet_address)
    added++
  }
  if (added > 0) console.log(`[solana] synced ${added} new wallets (total: ${walletSet.size})`)
}

// ─── 초기화 ───────────────────────────────────────────────────────────
async function startSolanaIndexer() {
  if (!TOKEN_MINT) {
    console.warn("[solana] TOKEN_MINT_ADDRESS not set — Solana indexer disabled")
    return
  }

  console.log(`[solana] starting indexer (polling mode) for mint: ${TOKEN_MINT}`)

  // 최초 지갑 목록 로드
  await syncWallets()

  // 최초 폴링 (기존 미처리 트랜잭션 처리)
  await pollAllWallets()

  // 20초마다 폴링
  setInterval(pollAllWallets, 20 * 1000)

  // 5분마다 신규 가입 유저 지갑 동기화
  setInterval(syncWallets, 5 * 60 * 1000)
}

module.exports = { startSolanaIndexer }
