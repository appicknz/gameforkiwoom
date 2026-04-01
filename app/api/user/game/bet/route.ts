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
    const { betAmount, gameType, side, bets: betsPayload } = await request.json()
    // gameType: "baccarat" | "race" (optional)
    // side: "player"|"banker"|"tie" for baccarat, "bit"|"coin"|"tie" for race (optional)
    // bets: 전체 배팅 내역 (settle API가 읽음 — direction/digit/parity/baccaratSide 포함)
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

    // atomic RPC로 잔고 차감 — SELECT→UPDATE 레이스 컨디션 완전 제거
    const { data: newBalance, error: deductError } = await supabase
      .rpc("deduct_balance_for_bet", { p_user_id: userId, p_amount: betAmount })

    if (deductError) {
      // INSUFFICIENT_BALANCE 또는 유저 없음
      const isInsufficient = deductError.message?.includes("INSUFFICIENT_BALANCE")
      return NextResponse.json(
        { error: isInsufficient ? "Insufficient balance" : "Failed to update balance" },
        { status: isInsufficient ? 400 : 500 }
      )
    }

    // 유저의 branch_id 조회 (balance_transactions FK 필요)
    const { data: profileData } = await supabase
      .from("profiles")
      .select("branch_id")
      .eq("id", userId)
      .single()

    // balance_transactions 기록 (배팅 차감 이력)
    // balance_before = 차감 후 잔고 + 배팅금 (atomic RPC가 차감 후 잔고를 반환하므로 역산)
    const balBefore = (newBalance as number) + betAmount
    await supabase.from("balance_transactions").insert({
      user_id: userId,
      branch_id: profileData?.branch_id ?? null,
      type: "bet",
      amount: -betAmount,
      balance_before: balBefore,
      balance_after: newBalance,
      note: `배팅 차감`,
    })

    // Redis에 최신 잔고 저장 + version increment → balance SSE가 변경 감지
    // newBalance는 DB atomic RPC에서 반환한 실제 차감 후 잔고
    const redisOps: Promise<unknown>[] = [
      redis.set(`balance:${userId}`, newBalance as number, { ex: 3600 }),
      redis.incr(`balance_version:${userId}`),
    ]

    // 배팅 풀 집계 + 유저별 bets 저장 (settle API 사용)
    // baccarat: 30초 라운드, race: 5분(300초) 라운드
    if (gameType && side) {
      const nowSec = Math.floor(Date.now() / 1000)
      const roundNumber = gameType === "race"
        ? Math.floor(nowSec / 300)
        : Math.floor(nowSec / 30)
      const ttl = gameType === "race" ? 600 : 120  // race는 TTL 10분

      const poolKey    = `pool:${gameType}:${roundNumber}`
      const userSetKey = `users:${gameType}:${roundNumber}`
      const betsKey    = `bet:bets:${gameType}:${roundNumber}:${userId}`

      // 기존 bets에 merge (여러 번 배팅 가능 — accumulate)
      const existing = await redis.get<string>(betsKey)
      const prev = existing ? (typeof existing === "string" ? JSON.parse(existing) : existing) : {}
      const merged = betsPayload ? { ...prev, ...betsPayload } : prev

      redisOps.push(
        redis.hincrby(poolKey, side, betAmount),
        redis.sadd(userSetKey, userId),
        redis.set(betsKey, JSON.stringify(merged), { ex: ttl }),
        redis.expire(poolKey, ttl),
        redis.expire(userSetKey, ttl),
      )
    }

    // pool 저장 완료 후 SSE 트리거 (버전 카운터 increment)
    await Promise.all(redisOps)

    const triggerOps: Promise<unknown>[] = []
    if (gameType && side) {
      triggerOps.push(redis.incr(`odds_version:${gameType}`))
    }
    if (triggerOps.length > 0) await Promise.all(triggerOps)

    return NextResponse.json({ success: true, newBalance })
  } catch (error) {
    console.error("[v0] Bet API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
