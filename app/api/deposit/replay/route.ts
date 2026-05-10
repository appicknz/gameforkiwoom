export const dynamic = "force-dynamic"
import "server-only"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"

const SOLANA_RPC_HTTP = process.env.SOLANA_RPC_HTTP || "https://api.mainnet-beta.solana.com"
const TOKEN_MINT      = process.env.TOKEN_MINT_ADDRESS
const INTERNAL_SECRET = process.env.INTERNAL_SECRET

// 어드민 또는 내부 서비스만 호출 가능
// POST /api/deposit/replay  { signature: "5LG9..." }
export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-secret")
  if (secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { signature } = await req.json().catch(() => ({}))
  if (!signature) return NextResponse.json({ error: "signature required" }, { status: 400 })

  // 이미 처리된 tx인지 확인
  const { data: existing } = await adminSupabase
    .from("token_deposits")
    .select("id")
    .eq("tx_signature", signature)
    .maybeSingle()
  if (existing) return NextResponse.json({ message: "already processed" })

  // 온체인 트랜잭션 조회
  const rpcRes = await fetch(SOLANA_RPC_HTTP, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({
      jsonrpc: "2.0", id: 1,
      method:  "getTransaction",
      params:  [signature, { encoding: "jsonParsed", commitment: "confirmed", maxSupportedTransactionVersion: 0 }],
    }),
  }).catch(() => null)

  const json = await rpcRes?.json().catch(() => null)
  const tx   = json?.result
  if (!tx) return NextResponse.json({ error: "tx not found on-chain" }, { status: 404 })

  const postBalances = tx.meta?.postTokenBalances ?? []
  const preBalances  = tx.meta?.preTokenBalances  ?? []

  const results = []

  for (const post of postBalances) {
    if (post.mint !== TOKEN_MINT) continue
    const owner = post.owner

    // 우리 DB에서 해당 지갑 유저 조회
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("id")
      .eq("wallet_address", owner)
      .maybeSingle()
    if (!profile) continue

    const pre     = preBalances.find((b: {owner: string; mint: string}) => b.owner === owner && b.mint === TOKEN_MINT)
    const preAmt  = Number((pre as {uiTokenAmount?: {uiAmount?: number}})?.uiTokenAmount?.uiAmount ?? 0)
    const postAmt = Number(post.uiTokenAmount?.uiAmount ?? 0)
    const delta   = postAmt - preAmt
    if (delta <= 0) continue

    const creditAmount = Math.floor(delta)

    // 잔고 적립
    const { data: balance } = await adminSupabase
      .from("balances")
      .select("amount")
      .eq("user_id", profile.id)
      .maybeSingle()

    const currentAmount = balance?.amount ?? 0

    await adminSupabase.from("balances").upsert({
      user_id: profile.id,
      amount:  currentAmount + creditAmount,
    }, { onConflict: "user_id" })

    await adminSupabase.from("token_deposits").insert({
      user_id:        profile.id,
      tx_signature:   signature,
      amount:         creditAmount,
      token_amount:   delta,
      wallet_address: owner,
      status:         "confirmed",
    }).throwOnError()

    results.push({ owner, delta, creditAmount })
  }

  return NextResponse.json({ replayed: results })
}
