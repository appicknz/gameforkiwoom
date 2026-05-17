/**
 * Solana Token Deposit Indexer
 *
 * 동작 방식:
 * 1. Supabase에서 모든 유저의 wallet_address 목록을 주기적으로 조회
 * 2. 20초마다 전체 지갑을 **병렬** 폴링 (최대 CONCURRENCY 동시 실행)
 * 3. Token Account 주소를 메모리에 캐시 → 매 폴링마다 재조회 없음
 * 4. 특정 토큰(TOKEN_MINT_ADDRESS) Transfer 감지 시
 *    → Vercel /api/deposit/webhook 호출 → 잔고 적립
 *
 * 환경변수:
 *   SOLANA_RPC_HTTP       - Solana HTTP RPC URL
 *   TOKEN_MINT_ADDRESS    - 감시할 토큰 mint address
 *   INTERNAL_SECRET       - Vercel webhook 인증 시크릿
 *   VERCEL_URL            - Vercel 배포 URL (https://...)
 *   SUPABASE_URL          - Supabase REST URL
 *   SUPABASE_SERVICE_ROLE_KEY - Supabase 서비스 롤 키
 */

const SOLANA_RPC_HTTP = process.env.SOLANA_RPC_HTTP   || "https://api.mainnet-beta.solana.com"
const TOKEN_MINT      = process.env.TOKEN_MINT_ADDRESS
const VERCEL_URL      = process.env.VERCEL_URL?.startsWith("https://")
  ? process.env.VERCEL_URL
  : process.env.PRODUCTION_URL ?? process.env.VERCEL_URL
const INTERNAL_SECRET = process.env.INTERNAL_SECRET   || "tasko-internal"
const SUPABASE_URL    = process.env.SUPABASE_URL      || process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_KEY    = process.env.SUPABASE_SERVICE_ROLE_KEY

// 동시 폴링 최대 수 — RPC rate limit 고려 (20~30 권장)
const CONCURRENCY = 20

// 감시 중인 지갑 주소 Set
const walletSet = new Set()

// token account 캐시: walletAddress → tokenAccountPubkey | "NONE"
// "NONE": 조회했지만 token account가 없는 지갑 (다음 폴링에서 재시도)
const tokenAccCache = new Map()

// 처리 완료 signature 중복 방지 (DB unique constraint로도 보호됨)
const processedSigs = new Set()

// ─── Supabase: 전체 유저 지갑 목록 조회 ──────────────────────────────
async function fetchWallets() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return []
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/profiles?select=wallet_address&wallet_address=not.is.null`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
  ).catch(() => null)
  if (!res?.ok) return []
  const rows = await res.json().catch(() => [])
  return rows.map(r => r.wallet_address).filter(Boolean)
}

// ─── Solana RPC HTTP 호출 ─────────────────────────────────────────────
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

// ─── Token Account 조회 (캐시 우선) ──────────────────────────────────
async function getTokenAccount(walletAddress) {
  // 캐시에 있고 유효한 pubkey면 즉시 반환
  const cached = tokenAccCache.get(walletAddress)
  if (cached && cached !== "NONE") return cached

  // Token2022 우선
  const t22 = await solanaRpc("getTokenAccountsByOwner", [
    walletAddress,
    { mint: TOKEN_MINT },
    { encoding: "jsonParsed", programId: "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb" },
  ])
  if (t22?.value?.length) {
    const pubkey = t22.value[0].pubkey
    tokenAccCache.set(walletAddress, pubkey)
    return pubkey
  }

  // 표준 SPL Token 시도
  const spl = await solanaRpc("getTokenAccountsByOwner", [
    walletAddress,
    { mint: TOKEN_MINT },
    { encoding: "jsonParsed" },
  ])
  if (spl?.value?.length) {
    const pubkey = spl.value[0].pubkey
    tokenAccCache.set(walletAddress, pubkey)
    return pubkey
  }

  // token account 없음 — 다음 폴링에서 재시도하기 위해 "NONE"으로 캐시
  // (단, "NONE" 캐시는 2분 후 자동 만료 — Map에 timestamp 관리)
  tokenAccCache.set(walletAddress, "NONE")
  return null
}

// NONE 캐시 만료: 2분마다 클리어 → 신규 token account 재감지
setInterval(() => {
  let cleared = 0
  for (const [k, v] of tokenAccCache) {
    if (v === "NONE") { tokenAccCache.delete(k); cleared++ }
  }
  if (cleared > 0) console.log(`[solana] cleared ${cleared} NONE token-acc cache entries`)
}, 2 * 60 * 1000)

// ─── Vercel deposit webhook 호출 ─────────────────────────────────────
async function callDepositWebhook(signature, walletAddress, tokenAmount) {
  if (!VERCEL_URL) { console.error("[solana] VERCEL_URL not set"); return }

  if (VERCEL_URL.includes(".vercel.app") && !VERCEL_URL.includes("www.")) {
    console.warn(`[solana] WARNING: VERCEL_URL looks like a preview URL (${VERCEL_URL})`)
  }

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
      console.log(`[solana] deposit OK: ${walletAddress} +${tokenAmount} CHIPS (${signature})`)
    } else {
      const err = await res.text()
      console.error(`[solana] webhook failed ${res.status}: ${err}`)
    }
  } catch (e) {
    console.error("[solana] webhook error:", e.message)
  }
}

// ─── 단일 지갑 폴링 ──────────────────────────────────────────────────
async function pollWallet(walletAddress) {
  // token account 조회 (캐시 활용)
  const tokenAccountPubkey = await getTokenAccount(walletAddress)

  // token account 없으면 wallet 주소 자체로 signatures 조회
  // (첫 입금 TX에서 token account가 생성되는 경우 대비)
  const queryAddress = tokenAccountPubkey ?? walletAddress

  // 최근 15개 signature
  const sigs = await solanaRpc("getSignaturesForAddress", [
    queryAddress,
    { limit: 15, commitment: "confirmed" },
  ])
  if (!sigs?.length) return

  for (const { signature, err } of sigs) {
    if (err || processedSigs.has(signature)) continue

    // 트랜잭션 파싱
    const tx = await solanaRpc("getTransaction", [
      signature,
      { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 },
    ])
    if (!tx) continue

    const pre  = tx.meta?.preTokenBalances  ?? []
    const post = tx.meta?.postTokenBalances ?? []

    // 수신자 탐색: owner === walletAddress && mint === TOKEN_MINT
    let recipientPost = post.find(b => b.owner === walletAddress && b.mint === TOKEN_MINT)

    // Token2022 일부 케이스: owner 필드가 없거나 다를 때 fallback
    if (!recipientPost) {
      recipientPost = post.find(b => b.mint === TOKEN_MINT)
      if (recipientPost?.owner && recipientPost.owner !== walletAddress) {
        recipientPost = null
      }
    }

    if (!recipientPost) {
      processedSigs.add(signature)
      continue
    }

    // token account가 이 TX에서 새로 생성됐다면 캐시 업데이트
    if (!tokenAccountPubkey && recipientPost) {
      const newAccounts = tx.transaction?.message?.accountKeys ?? []
      // postTokenBalances의 accountIndex로 pubkey 찾기
      const idx = recipientPost.accountIndex
      if (idx !== undefined && newAccounts[idx]) {
        const newPubkey = typeof newAccounts[idx] === "string"
          ? newAccounts[idx]
          : newAccounts[idx].pubkey
        if (newPubkey) tokenAccCache.set(walletAddress, newPubkey)
      }
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

  // processedSigs Set 크기 제한
  if (processedSigs.size > 50000) {
    const iter = processedSigs.values()
    for (let i = 0; i < 10000; i++) processedSigs.delete(iter.next().value)
  }
}

// ─── 병렬 폴링 헬퍼 (concurrency 제한) ───────────────────────────────
async function runConcurrent(items, fn, concurrency) {
  const queue = [...items]
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()
      if (item !== undefined) {
        await fn(item).catch(e => console.error(`[solana] poll error ${item}:`, e.message))
      }
    }
  })
  await Promise.all(workers)
}

// ─── 전체 지갑 병렬 폴링 ─────────────────────────────────────────────
async function pollAllWallets() {
  if (walletSet.size === 0) return
  const addrs = [...walletSet]
  console.log(`[solana] polling ${addrs.length} wallets (concurrency=${CONCURRENCY})...`)
  const t0 = Date.now()
  await runConcurrent(addrs, pollWallet, CONCURRENCY)
  console.log(`[solana] poll done in ${Date.now() - t0}ms`)
}

// ─── 지갑 목록 동기화 ────────────────────────────────────────────────
async function syncWallets() {
  const wallets = await fetchWallets()
  const newAddrs = []
  for (const addr of wallets) {
    if (!walletSet.has(addr)) {
      walletSet.add(addr)
      newAddrs.push(addr)
    }
  }
  if (newAddrs.length > 0) {
    console.log(`[solana] synced ${newAddrs.length} new wallets (total: ${walletSet.size})`)
    // 신규 지갑 즉시 폴링 (가입 전 입금 TX도 감지)
    await runConcurrent(newAddrs, pollWallet, CONCURRENCY)
  }
}

// ─── 초기화 ───────────────────────────────────────────────────────────
async function startSolanaIndexer() {
  if (!TOKEN_MINT) {
    console.warn("[solana] TOKEN_MINT_ADDRESS not set — Solana indexer disabled")
    return
  }

  console.log(`[solana] starting indexer for mint: ${TOKEN_MINT}`)

  await syncWallets()
  await pollAllWallets()

  // 20초마다 전체 폴링
  setInterval(pollAllWallets, 20 * 1000)

  // 30초마다 신규 가입자 지갑 동기화
  setInterval(syncWallets, 30 * 1000)
}

module.exports = { startSolanaIndexer }
