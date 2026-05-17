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
  // 1) Token Account 조회 (Token2022 우선, 없으면 표준 SPL)
  //    encoding 파라미터는 별도 config 객체로 전달해야 함
  let tokenAccountPubkey = null

  const t22Res = await solanaRpc("getTokenAccountsByOwner", [
    walletAddress,
    { mint: TOKEN_MINT },
    { encoding: "jsonParsed", programId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" },
  ])
  if (t22Res?.value?.length) {
    tokenAccountPubkey = t22Res.value[0].pubkey
  } else {
    // 표준 SPL Token 시도
    const splRes = await solanaRpc("getTokenAccountsByOwner", [
      walletAddress,
      { mint: TOKEN_MINT },
      { encoding: "jsonParsed" },
    ])
    if (splRes?.value?.length) {
      tokenAccountPubkey = splRes.value[0].pubkey
    }
  }

  // Token Account가 없으면 → 지갑 주소 자체로 signatures 조회
  // (token account가 아직 없는 신규 지갑도 처음 입금 TX를 찾을 수 있도록)
  const queryAddress = tokenAccountPubkey ?? walletAddress

  // 2) 최근 15개 트랜잭션 signature 조회
  const sigs = await solanaRpc("getSignaturesForAddress", [
    queryAddress,
    { limit: 15, commitment: "confirmed" },
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

    // postTokenBalances에서 수신자 탐색:
    //   - owner === walletAddress (표준 SPL, Token2022 대부분)
    //   - 또는 mint === TOKEN_MINT && token account가 walletAddress의 것
    let recipientPost = post.find(b => b.owner === walletAddress && b.mint === TOKEN_MINT)

    // owner 필드가 없거나 다른 경우 (일부 Token2022): 
    // token account pubkey가 queryAddress인 항목으로 fallback
    if (!recipientPost && tokenAccountPubkey) {
      recipientPost = post.find(b => b.mint === TOKEN_MINT && b.accountIndex !== undefined)
      // accountIndex 기반으로 해당 token account가 walletAddress 소유인지 확인
      // postBalances의 accountIndex가 token account를 가리키는지 체크
      if (recipientPost) {
        // owner가 명시적으로 다른 주소면 제외
        if (recipientPost.owner && recipientPost.owner !== walletAddress) {
          recipientPost = null
        }
      }
    }

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

    console.log(`[solana] deposit detected: ${walletAddress} +${delta} CHIPS tx=${signature}`)
    await callDepositWebhook(signature, walletAddress, delta)
  }

  // set이 너무 커지면 오래된 항목 제거
  if (processedSigs.size > 50000) {
    const iter = processedSigs.values()
    for (let i = 0; i < 10000; i++) processedSigs.delete(iter.next().value)
  }
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

  // set이 너무 커지면 오래된 �� 제거
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

// ─── 지갑 목록 동기화 ────────────────────────────────────────────────
async function syncWallets() {
  const wallets = await fetchWallets()
  const newAddrs = []
  for (const { wallet_address } of wallets) {
    if (!wallet_address || walletSet.has(wallet_address)) continue
    walletSet.add(wallet_address)
    newAddrs.push(wallet_address)
  }
  if (newAddrs.length > 0) {
    console.log(`[solana] synced ${newAddrs.length} new wallets (total: ${walletSet.size})`)
    // 신규 지갑은 즉시 폴링 — 동기화 전에 입금된 트랜잭션도 놓치지 않도록
    for (const addr of newAddrs) {
      await pollWallet(addr).catch(e => console.error(`[solana] initial poll error ${addr}:`, e.message))
    }
  }
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

  // 30초마다 신규 가입 유저 지갑 동기화 (신규 지갑 감지 즉시 첫 폴링 수행)
  setInterval(syncWallets, 30 * 1000)
}

module.exports = { startSolanaIndexer }
