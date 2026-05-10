/**
 * POST /api/deposit/webhook
 * Railway Solana indexer에서 호출 — 토큰 입금 감지 시 잔고 적립
 *
 * 보안: x-internal-secret 헤더 검증 (Railway ↔ Vercel 내부 통신)
 * 중복: token_deposits.signature PRIMARY KEY로 중복 입금 방지
 */

import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { redis } from "@/lib/redis"
import { NextResponse } from "next/server"

const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "tasko-internal"
// 1 토큰 = 몇 R (고정 비율, 나중에 admin 설정으로 확장 가능)
const TOKEN_TO_R_RATE = Number(process.env.TOKEN_TO_R_RATE ?? 1)

export async function POST(req: Request) {
  // 내부 시크릿 검증
  const secret = req.headers.get("x-internal-secret")
  if (secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { signature, walletAddress, tokenAmount } = await req.json()

  if (!signature || !walletAddress || typeof tokenAmount !== "number" || tokenAmount <= 0) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  // 1) 중복 처리 여부 확인 (tx_signature UNIQUE)
  const { data: existing } = await adminSupabase
    .from("token_deposits")
    .select("id")
    .eq("tx_signature", signature)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ ok: true, duplicate: true })
  }

  // 2) 지갑 주소로 유저 조회
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("id")
    .eq("wallet_address", walletAddress)
    .single()

  if (!profile) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 })
  }

  const userId  = profile.id
  const rAmount = Math.floor(tokenAmount * TOKEN_TO_R_RATE)

  // 3) 잔고 적립 (기존 charge 패턴과 동일)
  const { data: balanceRow } = await adminSupabase
    .from("balances")
    .select("amount")
    .eq("user_id", userId)
    .single()

  const newBalance = (balanceRow?.amount ?? 0) + rAmount

  if (balanceRow) {
    await adminSupabase
      .from("balances")
      .update({ amount: newBalance })
      .eq("user_id", userId)
  } else {
    await adminSupabase
      .from("balances")
      .insert({ user_id: userId, amount: newBalance })
  }

  // 4) 입금 내역 기록 (실제 DB 컬럼명: tx_signature, amount)
  await adminSupabase.from("token_deposits").insert({
    tx_signature:   signature,
    user_id:        userId,
    wallet_address: walletAddress,
    token_amount:   tokenAmount,
    amount:         rAmount,
    status:         "confirmed",
  })

  // 5) Redis balance_version incr → 클라이언트 잔고 즉시 갱신
  await redis.incr(`balance_version:${userId}`)

  console.log(`[deposit] ${walletAddress} +${tokenAmount} tokens → +${rAmount}R (user: ${userId})`)

  return NextResponse.json({ ok: true, rAmount, newBalance })
}
