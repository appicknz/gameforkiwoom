import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

// GET: 잔고 조회
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { userId } = auth

  // Redis 캐시 우선
  const cached = await redis.get(`balance:${userId}`)
  if (cached !== null) return NextResponse.json({ balance: Number(cached) })

  const { data } = await adminSupabase
    .from("balances").select("amount").eq("user_id", userId).single()
  return NextResponse.json({ balance: data?.amount ?? 0 })
}

// POST: 포지션 진입 (잔고 차감)
export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { userId } = auth

  const { amount: rawAmount } = await req.json()
  const amount = Math.round(rawAmount)
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: "금액을 입력해주세요." }, { status: 400 })
  }

  // atomic RPC로 잔고 차감
  const { data: newBalance, error } = await adminSupabase
    .rpc("deduct_balance_for_bet", { p_user_id: userId, p_amount: amount })

  if (error) {
    const isInsufficient = error.message?.includes("INSUFFICIENT_BALANCE")
    return NextResponse.json(
      { error: isInsufficient ? "잔고가 부족합니다." : "잔고 차감 실패" },
      { status: isInsufficient ? 400 : 500 }
    )
  }

  const balBefore = (newBalance as number) + amount
  const { data: profile } = await adminSupabase
    .from("profiles").select("branch_id").eq("id", userId).single()

  await adminSupabase.from("balance_transactions").insert({
    user_id: userId,
    branch_id: profile?.branch_id ?? null,
    type: "bet",
    amount: -amount,
    balance_before: balBefore,
    balance_after: newBalance,
    note: "모의매매 진입",
  })

  await Promise.all([
    redis.set(`balance:${userId}`, newBalance as number, { ex: 3600 }),
    redis.incr(`balance_version:${userId}`),
  ])

  return NextResponse.json({ success: true, newBalance })
}

// PATCH: 포지션 청산 (잔고 반환 + PnL)
export async function PATCH(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { userId } = auth

  // payout = 투자금 + PnL (음수면 손실) — bigint RPC이므로 반드시 정수로 변환
  const {
    payout: rawPayout,
    note,
    symbol: tradeSymbol,
    direction: tradeDirection,
    leverage: tradeLeverage,
    entry_price: tradeEntryPrice,
    exit_price: tradeExitPrice,
    bet_amount: tradeBetAmount,
  } = await req.json()
  if (rawPayout === undefined) {
    return NextResponse.json({ error: "payout 필요" }, { status: 400 })
  }
  const payout = Math.round(Math.max(0, rawPayout))  // 음수 방지 + 정수 변환

  // payout이 0이면 잔고 변화 없이 바로 성공 반환
  if (payout === 0) {
    const cached = await redis.get(`balance:${userId}`)
    const bal = cached !== null ? Number(cached) : 0
    return NextResponse.json({ success: true, newBalance: bal })
  }

  // 바카라/레이스 settle과 동일: atomic RPC로 잔고 지급
  const { data: newBalance, error: payoutError } = await adminSupabase
    .rpc("add_balance_for_payout", { p_user_id: userId, p_amount: payout })

  if (payoutError) {
    return NextResponse.json({ error: "잔고 지급 실패" }, { status: 500 })
  }

  const { data: profile } = await adminSupabase
    .from("profiles").select("branch_id").eq("id", userId).single()

  const balBefore = Math.round((newBalance as number) - payout)

  await adminSupabase.from("balance_transactions").insert({
    user_id: userId,
    branch_id: profile?.branch_id ?? null,
    type: "win",
    amount: payout,
    balance_before: balBefore,
    balance_after: newBalance,
    note: note ?? "모의매매 청산",
  })

  // bet_history에 모의매매 거래 기록 저장
  if (tradeBetAmount !== undefined) {
    const pnl = payout - Math.round(tradeBetAmount)
    await adminSupabase.from("bet_history").insert({
      user_id: userId,
      branch_id: profile?.branch_id ?? null,
      round_id: null,
      bet_direction: tradeDirection ?? null,
      bet_digit: `trade:${tradeSymbol ?? "BTCUSDT"}:${tradeDirection ?? "long"}:${tradeLeverage ?? 1}x:${tradeEntryPrice ?? 0}:${tradeExitPrice ?? 0}`,
      bet_parity: null,
      bet_amount: Math.round(tradeBetAmount),
      payout: payout,
      result: pnl >= 0 ? "win" : "lose",
    }).catch(() => {})
  }

  await Promise.all([
    redis.set(`balance:${userId}`, newBalance, { ex: 3600 }),
    redis.incr(`balance_version:${userId}`),
  ])

  return NextResponse.json({ success: true, newBalance })
}
