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

  const { amount } = await req.json()
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

  // payout = 투자금 + PnL (음수면 손실)
  const { payout, note } = await req.json()
  if (payout === undefined) {
    return NextResponse.json({ error: "payout 필요" }, { status: 400 })
  }

  // 현재 잔고 조회
  const { data: existing } = await adminSupabase
    .from("balances").select("amount").eq("user_id", userId).single()
  const current = existing?.amount ?? 0
  const newBalance = Math.max(0, current + payout)

  if (existing) {
    await adminSupabase.from("balances")
      .update({ amount: newBalance }).eq("user_id", userId)
  } else {
    await adminSupabase.from("balances")
      .insert({ user_id: userId, amount: newBalance })
  }

  const { data: profile } = await adminSupabase
    .from("profiles").select("branch_id").eq("id", userId).single()

  await adminSupabase.from("balance_transactions").insert({
    user_id: userId,
    branch_id: profile?.branch_id ?? null,
    type: "win",
    amount: payout,
    balance_before: current,
    balance_after: newBalance,
    note: note ?? "모의매매 청산",
  })

  await Promise.all([
    redis.set(`balance:${userId}`, newBalance, { ex: 3600 }),
    redis.incr(`balance_version:${userId}`),
  ])

  return NextResponse.json({ success: true, newBalance })
}
