import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

// 잔고 충전 API — branch_admin 또는 super_admin만 가능
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

  // 역할 확인
  const { data: adminProfile } = await supabaseAuth
    .from("profiles")
    .select("role, branch_id")
    .eq("id", user.id)
    .single()

  if (!adminProfile || !["branch_admin", "super_admin"].includes(adminProfile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const body = await request.json()
  const { targetUserId, amount, note } = body

  if (!targetUserId || !amount || amount <= 0) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { cookies: { getAll: () => [], setAll: () => {} } }
  )

  // 지점 관리자는 본인 지점 회원만 충전 가능
  if (adminProfile.role === "branch_admin") {
    const { data: targetProfile } = await supabase
      .from("profiles")
      .select("branch_id")
      .eq("id", targetUserId)
      .single()

    if (!targetProfile || targetProfile.branch_id !== adminProfile.branch_id) {
      return NextResponse.json({ error: "Forbidden: not your branch member" }, { status: 403 })
    }
  }

  // 현재 잔고 조회
  const { data: balance, error: balErr } = await supabase
    .from("balances")
    .select("amount")
    .eq("user_id", targetUserId)
    .single()

  if (balErr || !balance) {
    return NextResponse.json({ error: "Target user balance not found" }, { status: 404 })
  }

  const newAmount = balance.amount + amount

  await supabase
    .from("balances")
    .update({ amount: newAmount, updated_at: new Date().toISOString() })
    .eq("user_id", targetUserId)

  const { data: targetProfile } = await supabase
    .from("profiles")
    .select("branch_id")
    .eq("id", targetUserId)
    .single()

  await supabase.from("balance_transactions").insert({
    user_id: targetUserId,
    branch_id: targetProfile?.branch_id ?? null,
    type: "charge",
    amount,
    balance_before: balance.amount,
    balance_after: newAmount,
    note: note ?? `충전 by ${adminProfile.role}`,
  })

  return NextResponse.json({ success: true, balance: newAmount })
}
