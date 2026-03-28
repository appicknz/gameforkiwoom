/**
 * 실시간 배당률 조회 API
 * GET /api/game/odds?type=baccarat|race&round=<roundNumber>
 *
 * 현재 라운드의 유저 배팅 풀 + LP 설정으로 파리뮤추얼 배당률 계산 반환
 */
import { adminSupabase as admin } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds } from "@/lib/lp-system"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const gameType = searchParams.get("type") ?? "baccarat"

    // 현재 라운드 번호 (30초 기준)
    const now = Math.floor(Date.now() / 1000)
    const roundNumber = Math.floor(now / 30)

    // 인증 토큰에서 유저 branch_id 추출
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    let branchId: string | null = null
    if (token) {
      const { data: { user } } = await admin.auth.getUser(token)
      if (user) {
        const { data: profile } = await admin
          .from("profiles")
          .select("branch_id")
          .eq("id", user.id)
          .single()
        branchId = profile?.branch_id ?? null
      }
    }

    // 지점 LP 설정 조회
    let lpConfig = {
      enabled: true,
      lpAmountBaccarat: 50000,
      lpAmountRace: 50000,
    }
    if (branchId) {
      const { data: branch } = await admin
        .from("branches")
        .select("lp_enabled, lp_amount_baccarat, lp_amount_race")
        .eq("id", branchId)
        .single()
      if (branch) {
        lpConfig = {
          enabled: branch.lp_enabled ?? true,
          lpAmountBaccarat: branch.lp_amount_baccarat ?? 50000,
          lpAmountRace: branch.lp_amount_race ?? 50000,
        }
      }
    }

    // Redis에서 현재 라운드 배팅 풀 조회
    const poolKey = `pool:${gameType}:${roundNumber}`
    const userCountKey = `users:${gameType}:${roundNumber}`

    const [poolData, userCountStr] = await Promise.all([
      redis.hgetall(poolKey),
      redis.get<string>(userCountKey),
    ])

    const userCount = parseInt(userCountStr ?? "0") || 0

    if (gameType === "baccarat") {
      const userPools = {
        player: parseInt((poolData?.player as string) ?? "0") || 0,
        banker: parseInt((poolData?.banker as string) ?? "0") || 0,
        tie:    parseInt((poolData?.tie as string)    ?? "0") || 0,
      }
      const odds = calcBaccaratOdds(userPools, lpConfig, userCount)
      return NextResponse.json({
        gameType: "baccarat",
        roundNumber,
        userCount,
        pools: userPools,
        odds: {
          player: odds.playerOdds,
          banker: odds.bankerOdds,
          tie: odds.tieOdds,
        },
        mode: odds.mode,
      })
    } else {
      const userPools = {
        bit:  parseInt((poolData?.bit  as string) ?? "0") || 0,
        coin: parseInt((poolData?.coin as string) ?? "0") || 0,
        tie:  parseInt((poolData?.tie  as string) ?? "0") || 0,
      }
      const odds = calcRaceOdds(userPools, lpConfig, userCount)
      return NextResponse.json({
        gameType: "race",
        roundNumber,
        userCount,
        pools: userPools,
        odds: {
          bit:  odds.bitOdds,
          coin: odds.coinOdds,
          tie:  odds.tieOdds,
        },
        mode: odds.mode,
      })
    }
  } catch (err) {
    console.error("[v0] Odds API error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
