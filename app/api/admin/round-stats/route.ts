import { adminSupabase } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

// GET: 진행 중인 라운드 통계 (실시간 배팅, 예상 손익)
export async function GET(request: Request) {
  const url = new URL(request.url)
  const gameType = url.searchParams.get("type") || "baccarat" // "baccarat" | "race"
  const roundId = url.searchParams.get("roundId")

  try {
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { data: userData, error: userError } = await adminSupabase.auth.getUser(token)
    if (userError || !userData?.user?.id) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const userId = userData.user.id

    // 관리자 권한 체크 (super_admin 또는 admin)
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single()

    if (!profile || !["master", "super_admin", "branch_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // 현재 라운드 ID (30초 주기)
    const currentRound = roundId || String(Math.floor(Date.now() / 1000 / 30))
    const poolKey = `pool:${gameType}:${currentRound}`
    const userSetKey = `users:${gameType}:${currentRound}`
    const lpConfigKey = `lp_config:${gameType}:${currentRound}`

    // Redis에서 배팅 풀, 유저 수, LP 설정 조회
    const [pools, userIds, lpConfig] = await Promise.all([
      redis.hgetall(poolKey).catch(() => null),
      redis.smembers(userSetKey).catch(() => []),
      redis.get(lpConfigKey).catch(() => null),
    ])

    const poolData = gameType === "baccarat" 
      ? {
          player: (pools?.player as number) || 0,
          banker: (pools?.banker as number) || 0,
          tie: (pools?.tie as number) || 0,
        }
      : {
          bit: (pools?.bit as number) || 0,
          coin: (pools?.coin as number) || 0,
          tie: (pools?.tie as number) || 0,
        }

    const userCount = (userIds && Array.isArray(userIds)) ? userIds.length : 0
    const totalBet = Object.values(poolData).reduce((a, b) => a + b, 0)

    // LP 설정 파싱
    let lpAmount = 50000
    try {
      if (lpConfig) {
        const config = JSON.parse(lpConfig)
        lpAmount = gameType === "baccarat" ? config.baccarat : config.race
      }
    } catch {}

    // 손익 계산 (간단한 시뮬레이션)
    // 실제로는 확률 기반 계산 필요
    const mode = userCount >= 10 ? "pari" : userCount >= 3 ? "hybrid" : "lp-dominant"
    const lpMultiplier = mode === "pari" ? 0.1 : mode === "hybrid" ? 0.5 : 1.0
    const effectiveLP = Math.floor(lpAmount * lpMultiplier)

    const stats = {
      round: currentRound,
      gameType,
      timestamp: new Date().toISOString(),
      pools: poolData,
      userCount,
      totalBet,
      lpAmount: effectiveLP,
      mode,
      prediction: {
        // 각 사이드별 예상 수익 (균등 배분 기준)
        ...(gameType === "baccarat" ? {
          playerProfit: Math.floor((totalBet - poolData.player * 1.95) * 0.2),
          bankerProfit: Math.floor((totalBet - poolData.banker * 0.95) * 0.2),
          tieProfit: Math.floor((totalBet - poolData.tie * 8) * 0.2),
        } : {
          bitProfit: Math.floor((totalBet - poolData.bit * 1.95) * 0.2),
          coinProfit: Math.floor((totalBet - poolData.coin * 1.95) * 0.2),
          tieProfit: Math.floor((totalBet - poolData.tie * 8) * 0.2),
        }),
      },
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error("[round-stats] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
