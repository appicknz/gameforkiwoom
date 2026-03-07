import { adminSupabase } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export async function POST(request: Request) {
  const supabase = adminSupabase

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

    // ── Atomic 차감 (SELECT → 비교 → UPDATE race condition 방지) ──
    // amount >= betAmount 조건을 UPDATE WHERE 절에 포함해 단일 쿼리로 처리
    const { data: rpcData, error: rpcError } = await supabase
      .rpc("atomic_deduct_balance", { p_user_id: userId, p_amount: betAmount })

    if (rpcError) {
      return NextResponse.json({ error: "Failed to update balance" }, { status: 500 })
    }

    const newBalance = rpcData as number
    if (newBalance === -1) {
      // 잔고 부족 — atomic 함수가 -1 반환
      return NextResponse.json({ error: "Insufficient balance" }, { status: 400 })
    }

    const currentBalance = newBalance + betAmount // 차감 전 잔고 역산

    // 유저의 branch_id 조회 (balance_transactions FK 필요)
    const { data: profileData } = await supabase
      .from("profiles")
      .select("branch_id")
      .eq("id", userId)
      .single()

    // balance_transactions 기록 (배팅 차감 이력)
    await supabase.from("balance_transactions").insert({
      user_id: userId,
      branch_id: profileData?.branch_id ?? null,
      type: "bet",
      amount: -betAmount,
      balance_before: currentBalance,
      balance_after: newBalance,
      note: `배팅 차감`,
    })

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
