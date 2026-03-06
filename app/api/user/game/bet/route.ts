import { createClient } from "@supabase/supabase-js"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export async function POST(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    const { betAmount } = await request.json()
    if (!betAmount || betAmount <= 0) {
      return NextResponse.json({ error: "Invalid bet amount" }, { status: 400 })
    }

    // Authorization 헤더에서 토큰 추출
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 토큰에서 사용자 ID 추출
    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError || !userData?.user?.id) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const userId = userData.user.id

    // 현재 잔고 조회
    const { data: balanceData, error: balanceError } = await supabase
      .from("balances")
      .select("amount")
      .eq("user_id", userId)
      .single()

    if (balanceError) {
      return NextResponse.json({ error: "Balance not found" }, { status: 404 })
    }

    const currentBalance = balanceData?.amount ?? 0
    if (currentBalance < betAmount) {
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 })
    }

    // 배팅 금액 차감
    const newBalance = currentBalance - betAmount
    const { error: updateError } = await supabase
      .from("balances")
      .update({ amount: newBalance })
      .eq("user_id", userId)

    if (updateError) {
      return NextResponse.json({ error: "Failed to update balance" }, { status: 500 })
    }

    // Redis에 최신 잔고 저장 + version increment → SSE 스트림이 변경 감지
    await Promise.all([
      redis.set(`balance:${userId}`, newBalance, { ex: 3600 }),
      redis.incr(`balance_version:${userId}`),
    ])

    return NextResponse.json({ success: true, newBalance })
  } catch (error) {
    console.error("[v0] Bet API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
