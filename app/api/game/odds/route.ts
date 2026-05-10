export const dynamic = "force-dynamic"
/**
 * GET /api/game/odds?type=baccarat|race
 *
 * 1) odds:current Redis 캐시 우선 반환 (auto-bet/pari/bet이 최신 유지)
 * 2) 캐시 없으면 현재 pool에서 직접 계산 (신규 라운드 초기 상태)
 */
import { redis } from "@/lib/redis"
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds, DEFAULT_LP_CONFIG } from "@/lib/lp-system"



export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const gameType   = searchParams.get("type") ?? "baccarat"
    const roundSec   = gameType === "race" ? 180 : 30
    const roundNumber = Math.floor(Math.floor(Date.now() / 1000) / roundSec)
    const currentKey  = `odds:current:${gameType}:${roundNumber}`

    // 1) 공유 캐시 우선 — auto-bet / pari/bet이 배팅마다 최신 유지
    const cached = await redis.get<string>(currentKey)
    if (cached) {
      const parsed = typeof cached === "string" ? JSON.parse(cached) : cached
      if (parsed?.odds) return NextResponse.json(parsed)  // available:false도 그대로 전달
    }

    // 2) 캐시 없으면 현재 pool에서 직접 계산
    const poolKey = `pool:${gameType}:${roundNumber}`
    const poolData = await redis.hgetall(poolKey).catch(() => null)

    if (gameType === "baccarat") {
      const pools = {
        player: parseInt((poolData?.player as string) ?? "0") || 0,
        banker: parseInt((poolData?.banker as string) ?? "0") || 0,
        tie:    parseInt((poolData?.tie    as string) ?? "0") || 0,
      }
      const r = calcBaccaratOdds(pools, DEFAULT_LP_CONFIG, 0)
      return NextResponse.json({
        gameType, roundNumber, pools,
        odds: { player: r.playerOdds, banker: r.bankerOdds, tie: r.tieOdds,
          available: r.available, mode: r.mode },
      })
    } else {
      const pools = {
        bit:  parseInt((poolData?.bit  as string) ?? "0") || 0,
        coin: parseInt((poolData?.coin as string) ?? "0") || 0,
        tie:  parseInt((poolData?.tie  as string) ?? "0") || 0,
      }
      const r = calcRaceOdds(pools, DEFAULT_LP_CONFIG, 0)
      return NextResponse.json({
        gameType, roundNumber, pools,
        odds: { bit: r.bitOdds, coin: r.coinOdds, tie: r.tieOdds,
          available: r.available, mode: r.mode },
      })
    }
  } catch (err) {
    console.error("[v0] Odds GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
