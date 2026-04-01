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
    const { betAmount, gameType, side } = await request.json()
    // gameType: "baccarat" | "race" (optional)
    // side: "player"|"banker"|"tie" for baccarat, "bit"|"coin"|"tie" for race (optional)
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

    // Redis에 최신 잔고 저장 + version increment → balance SSE가 변경 감지
    const redisOps: Promise<unknown>[] = [
      redis.set(`balance:${userId}`, newBalance, { ex: 3600 }),
      redis.incr(`balance_version:${userId}`),
    ]

    // 배팅 풀 집계
    if (gameType && side) {
      const roundNumber = Math.floor(Date.now() / 1000 / 30)
      const poolKey = `pool:${gameType}:${roundNumber}`
      const userSetKey = `users:${gameType}:${roundNumber}`
      redisOps.push(
        redis.hincrby(poolKey, side, betAmount),
        redis.sadd(userSetKey, userId),
        redis.expire(poolKey, 120),
        redis.expire(userSetKey, 120),
      )
    }

    // 잔고 변경 → balance SSE 즉시 push (Pub/Sub)
    // odds 변경 → odds SSE 즉시 push (Pub/Sub)
    await Promise.all(redisOps)

    // publish는 pool 저장 완료 후 순서 보장을 위해 별도 실행
    const publishOps: Promise<unknown>[] = [
      redis.publish(`balance:${userId}`, newBalance),
    ]
    if (gameType && side) {
      publishOps.push(redis.publish(`odds:${gameType}`, "1"))
    }
    await Promise.all(publishOps)

    return NextResponse.json({ success: true, newBalance })
  } catch (error) {
    console.error("[v0] Bet API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
