import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: { user }, error } = await adminSupabase.auth.getUser(token)
    if (error || !user) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

    const { profit } = await request.json()
    if (!profit || profit <= 0) return NextResponse.json({ success: true }) // 진 경우는 이미 bet API에서 차감

    // 현재 잔고에 이긴 금액 추가
    const { data: balanceData } = await adminSupabase
      .from("balances")
      .select("amount")
      .eq("user_id", user.id)
      .single()

    const currentBalance = balanceData?.amount ?? 0
    const newBalance = currentBalance + profit

    await adminSupabase
      .from("balances")
      .update({ amount: newBalance })
      .eq("user_id", user.id)

    return NextResponse.json({ success: true, newBalance })
  } catch (error) {
    console.error("[v0] Game play error:", error)
    return NextResponse.json({ error: "Failed to save result" }, { status: 500 })
  }
}
