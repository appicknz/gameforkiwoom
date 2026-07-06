/**
 * POST /api/game/odds/refresh
 * Railway price-server가 30초 라운드 전환 시 호출.
 * 해당 gameType의 odds를 계산해 Redis odds:current 키에 저장하고
 * odds_version을 incr → SSE 클라이언트 즉시 수신.
 *
 * 모든 클라이언트가 공유하는 단일 캐시 — N명 유저가 각자 계산하지 않음.
 */
import { redis } from "@/lib/redis"
import { adminSupabase as admin } from "@/lib/supabase-admin"
import { calcBaccaratOdds, calcRaceOdds, branchToLpConfig, DEFAULT_LP_CONFIG } from "@/lib/lp-system"
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "tasko-internal"

export async function POST(request: Request) {
  // Railway 전용 내부 요청 검증
  const secret = request.headers.get("x-internal-secret")
  if (secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { gameType } = await request.json().catch(() => ({}))
  if (!gameType || !["baccarat", "race"].includes(gameType)) {
    return NextResponse.json({ error: "Invalid gameType" }, { status: 400 })
  }

  const roundSec    = gameType === "race" ? 180 : 30
  const roundNumber = Math.floor(Math.floor(Date.now() / 1000) / roundSec)
  const prevRound   = roundNumber - 1
  const poolKey     = `pool:${gameType}:${roundNumber}`
  const userSetKey  = `users:${gameType}:${roundNumber}`
  const currentKey  = `odds:current:${gameType}:${roundNumber}`
  const versionKey  = `odds_version:${gameType}`

  // 직전 라운드의 odds:current를 odds:final로 복사 — settle이 확정 배당으로 정산하도록
  // (settle보다 먼저 실행되므로 타이밍 안전)
  const prevCurrentKey = `odds:current:${gameType}:${prevRound}`
  const finalKey       = `odds:final:${gameType}:${prevRound}`
  const prevCached = await redis.get<string>(prevCurrentKey)
  if (prevCached) {
    try {
      const parsed = typeof prevCached === "string" ? JSON.parse(prevCached) : prevCached
      const oddsOnly = parsed?.odds
      if (oddsOnly) {
        // TTL 3600초(1시간) — 정산이 늦게 도착해도 배당이 만료되지 않도록 충분히 유지
        await redis.set(finalKey, JSON.stringify(oddsOnly), { ex: 3600 })
      }
    } catch {}
  }

  // 공유 캐시용 LP 설정: 기본 LP 활성 상태로 초기 배당 표시
  // 브랜치별 정확한 배당은 pari/bet에서 배팅마다 갱신
  const lpConfig = { ...DEFAULT_LP_CONFIG, enabled: true }

  const [poolData, userCount] = await Promise.all([
    redis.hgetall(poolKey).catch(() => null),
    redis.scard(userSetKey).catch(() => 0),
  ])
  const safeCount = (userCount as number) ?? 0

  let payload: object
  if (gameType === "baccarat") {
    const pools = {
      player: parseInt((poolData?.player as string) ?? "0") || 0,
      banker: parseInt((poolData?.banker as string) ?? "0") || 0,
      tie:    parseInt((poolData?.tie    as string) ?? "0") || 0,
    }
    const r = calcBaccaratOdds(pools, lpConfig, safeCount)
    payload = { gameType, roundNumber, userCount: safeCount, pools,
      odds: { player: r.playerOdds, banker: r.bankerOdds, tie: r.tieOdds,
        lpWeight: r.lpWeight, mode: r.mode, available: r.available } }
  } else {
    const pools = {
      bit:  parseInt((poolData?.bit  as string) ?? "0") || 0,
      coin: parseInt((poolData?.coin as string) ?? "0") || 0,
      tie:  parseInt((poolData?.tie  as string) ?? "0") || 0,
    }
    const r = calcRaceOdds(pools, lpConfig, safeCount)
    payload = { gameType, roundNumber, userCount: safeCount, pools,
      odds: { bit: r.bitOdds, coin: r.coinOdds, tie: r.tieOdds,
        lpWeight: r.lpWeight, mode: r.mode, available: r.available } }
  }

  await Promise.all([
    redis.set(currentKey, JSON.stringify(payload), { ex: roundSec + 30 }),
    redis.incr(versionKey),
  ])

  return NextResponse.json({ ok: true, gameType, roundNumber })
}
