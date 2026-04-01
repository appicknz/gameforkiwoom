import { adminSupabase } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds } from "@/lib/lp-system"

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
    const [pools, userIds, lpConfigRaw] = await Promise.all([
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
      if (lpConfigRaw) {
        const parsed = typeof lpConfigRaw === "string" ? JSON.parse(lpConfigRaw) : lpConfigRaw
        lpAmount = gameType === "baccarat" ? (parsed.baccarat ?? parsed.lpAmountBaccarat ?? 50000) : (parsed.race ?? parsed.lpAmountRace ?? 50000)
      }
    } catch {}

    // LP 설정 구성
    const lpConfig = {
      enabled: true,
      lpAmountBaccarat: lpAmount,
      lpAmountRace: lpAmount,
    }

    // lp-system으로 실제 배당률 + 손익 계산
    let mode: "lp-dominant" | "hybrid" | "pari" = "lp-dominant"
    let effectiveLP = 0
    let prediction: Record<string, number> = {}
    let oddsResult: Record<string, number> = {}

    if (gameType === "baccarat") {
      const pools = poolData as { player: number; banker: number; tie: number }
      const result = calcBaccaratOdds(pools, lpConfig, userCount)
      mode = result.mode
      effectiveLP = result.totalPool - totalBet // LP 기여분 = 총 풀 - 유저 배팅
      oddsResult = { player: result.playerOdds, banker: result.bankerOdds, tie: result.tieOdds }

      // 각 사이드 우승 시 하우스 손익:
      // 수집액(유저 배팅) + LP 회수 - 승자 지급 = 하우스 손익
      // 단순화: 수수료(fee) - LP 순투입이 하우스 실익
      const playerPayout = pools.player * result.playerOdds
      const bankerPayout = pools.banker * result.bankerOdds
      const tiePayout    = pools.tie    * result.tieOdds
      prediction = {
        playerProfit: Math.floor(result.fee + totalBet - playerPayout),
        bankerProfit: Math.floor(result.fee + totalBet - bankerPayout),
        tieProfit:    Math.floor(result.fee + totalBet - tiePayout),
      }
    } else {
      const pools = poolData as { bit: number; coin: number; tie: number }
      const result = calcRaceOdds(pools, lpConfig, userCount)
      mode = result.mode
      effectiveLP = result.totalPool - totalBet
      oddsResult = { bit: result.bitOdds, coin: result.coinOdds, tie: result.tieOdds }

      const bitPayout  = pools.bit  * result.bitOdds
      const coinPayout = pools.coin * result.coinOdds
      const tiePayout  = pools.tie  * result.tieOdds
      prediction = {
        bitProfit:  Math.floor(result.fee + totalBet - bitPayout),
        coinProfit: Math.floor(result.fee + totalBet - coinPayout),
        tieProfit:  Math.floor(result.fee + totalBet - tiePayout),
      }
    }

    const stats = {
      round: currentRound,
      gameType,
      timestamp: new Date().toISOString(),
      pools: poolData,
      userCount,
      totalBet,
      lpAmount: Math.max(0, effectiveLP),
      mode,
      odds: oddsResult,
      prediction,
    }

    return NextResponse.json(stats)
  } catch (error) {
    console.error("[round-stats] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
