import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

// 배팅 차감 API — service_role로 직접 처리
export async function POST(request: NextRequest) {
  const cookieStore = await cookies()

  // 유저 인증 확인 (anon key)
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
  const { betAmount, betDirection, betDigit, betParity, roundId } = body

  if (!betAmount || betAmount <= 0) {
    return NextResponse.json({ error: "Invalid bet amount" }, { status: 400 })
  }

  // service_role로 잔고 처리 (RLS 우회)
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

  if (balance.amount < betAmount) {
    return NextResponse.json({ error: "Insufficient balance" }, { status: 400 })
  }

  const newAmount = balance.amount - betAmount

  // 잔고 차감
  const { error: updateErr } = await supabase
    .from("balances")
    .update({ amount: newAmount, updated_at: new Date().toISOString() })
    .eq("user_id", user.id)

  if (updateErr) {
    return NextResponse.json({ error: "Failed to update balance" }, { status: 500 })
  }

  // 프로필에서 branch_id 조회
  const { data: profile } = await supabase
    .from("profiles")
    .select("branch_id")
    .eq("id", user.id)
    .single()

  // 거래 내역 기록
  await supabase.from("balance_transactions").insert({
    user_id: user.id,
    branch_id: profile?.branch_id ?? null,
    type: "bet",
    amount: -betAmount,
    balance_before: balance.amount,
    balance_after: newAmount,
    note: `배팅: ${betDirection ?? ""}/${betDigit ?? ""}/${betParity ?? ""}`,
  })

  // 배팅 기록 생성
  const { data: betRecord } = await supabase
    .from("bet_history")
    .insert({
      user_id: user.id,
      branch_id: profile?.branch_id ?? null,
      round_id: roundId ?? null,
      bet_direction: betDirection ?? null,
      bet_digit: betDigit ?? null,
      bet_parity: betParity ?? null,
      bet_amount: betAmount,
      result: "pending",
    })
    .select("id")
    .single()

  return NextResponse.json({
    success: true,
    balance: newAmount,
    betId: betRecord?.id ?? null,
  })
}
