import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

const PAYOUT_RATIO = 0.95

// 라운드 정산 API — 이겼으면 1.95배, 졌으면 0
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()

  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )
  const { data: { user }, error: authError } = await supabaseAuth.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  // wonCount: 이긴 종목 수, betAmount: 종목당 배팅금
  const { wonCount, betAmount, betIds } = body

  if (wonCount === undefined || !betAmount) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )

  // 현재 잔고 조회
  const { data: balance, error: balErr } = await supabase
    .from("balances")
    .select("amount")
    .eq("user_id", user.id)
    .single()

  if (balErr || !balance) {
    return NextResponse.json({ error: "Balance not found" }, { status: 404 })
  }

  // 이긴 종목: 배팅금 + PAYOUT_RATIO * 배팅금 = 1.95배 반환
  const totalPayout = Math.floor(wonCount * betAmount * (1 + PAYOUT_RATIO))
  const newAmount = balance.amount + totalPayout

  if (totalPayout <= 0) {
    // 전부 졌으면 잔고 변동 없음 (이미 bet API에서 차감됨)
    return NextResponse.json({ success: true, balance: balance.amount, payout: 0 })
  }

  // 잔고 증가
  const { error: updateErr } = await supabase
    .from("balances")
    .update({ amount: newAmount, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)

  if (updateErr) {
    return NextResponse.json({ error: "Failed to update balance" }, { status: 500 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("branch_id")
    .eq("id", user.id)
    .single()

  // 수익 거래 기록
  await supabase.from("balance_transactions").insert({
    user_id: user.id,
    branch_id: profile?.branch_id ?? null,
    type: "win",
    amount: totalPayout,
    balance_before: balance.amount,
    balance_after: newAmount,
    note: `정산: ${wonCount}종목 승리`,
  })

  // bet_history 결과 업데이트
  if (betIds && betIds.length > 0) {
    // betIds는 [{id, won}] 배열
    for (const bet of betIds) {
      await supabase
        .from("bet_history")
        .update({
          result: bet.won ? "win" : "lose",
          payout: bet.won ? Math.floor(betAmount * (1 + PAYOUT_RATIO)) : 0,
        })
        .eq("id", bet.id)
    }
  }

  return NextResponse.json({ success: true, balance: newAmount, payout: totalPayout })
}
