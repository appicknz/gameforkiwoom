import { redis } from "@/lib/redis"
import { adminSupabase as admin } from "@/lib/supabase-admin"
import { calcBaccaratOdds, calcRaceOdds, branchToLpConfig, DEFAULT_LP_CONFIG } from "@/lib/lp-system"

export const dynamic     = "force-dynamic"
export const runtime     = "nodejs"
export const maxDuration = 60

/**
 * stream loop에서 Supabase 쿼리 완전 제거.
 * computeFreshOdds는 Redis 캐시 miss 시(라운드 첫 연결)에만 호출됨.
 * LP 설정도 Redis에 30초 캐시 → Supabase 쿼리 최소화.
 */
async function computeFreshOdds(gameType: string, branchId: string | null) {
  const roundSec    = gameType === "race" ? 180 : 30
  const roundNumber = Math.floor(Math.floor(Date.now() / 1000) / roundSec)
  const currentKey  = `odds:current:${gameType}:${roundNumber}`

  let lpConfig = { ...DEFAULT_LP_CONFIG, enabled: false }
  if (branchId) {
    const lpCacheKey = `lp:config:branch:${branchId}`
    const cachedLp   = await redis.get<string>(lpCacheKey)
    if (cachedLp) {
      try { lpConfig = typeof cachedLp === "string" ? JSON.parse(cachedLp) : cachedLp } catch {}
    } else {
      const { data: branch } = await admin
        .from("branches")
        .select("lp_enabled, lp_amount_baccarat, lp_amount_race, lp_multiplier_baccarat, lp_multiplier_race")
        .eq("id", branchId).single()
      if (branch) {
        lpConfig = branchToLpConfig(branch)
        await redis.set(lpCacheKey, JSON.stringify(lpConfig), { ex: 30 })
      }
    }
  }

  const poolKey    = `pool:${gameType}:${roundNumber}`
  const userSetKey = `users:${gameType}:${roundNumber}`
  const [poolData, userCount] = await Promise.all([
    redis.hgetall(poolKey).catch(() => null),
    redis.scard(userSetKey).catch(() => 0),
  ])
  const safeCount = (userCount as number) ?? 0

  let payload: object
  if (gameType === "baccarat") {
    const userPools = {
      player: parseInt((poolData?.player as string) ?? "0") || 0,
      banker: parseInt((poolData?.banker as string) ?? "0") || 0,
      tie:    parseInt((poolData?.tie    as string) ?? "0") || 0,
    }
    const result = calcBaccaratOdds(userPools, lpConfig, safeCount)
    payload = { gameType, roundNumber, userCount: safeCount, pools: userPools,
      odds: { player: result.playerOdds, banker: result.bankerOdds, tie: result.tieOdds,
        lpWeight: result.lpWeight, mode: result.mode, available: result.available } }
  } else {
    const userPools = {
      bit:  parseInt((poolData?.bit  as string) ?? "0") || 0,
      coin: parseInt((poolData?.coin as string) ?? "0") || 0,
      tie:  parseInt((poolData?.tie  as string) ?? "0") || 0,
    }
    const result = calcRaceOdds(userPools, lpConfig, safeCount)
    payload = { gameType, roundNumber, userCount: safeCount, pools: userPools,
      odds: { bit: result.bitOdds, coin: result.coinOdds, tie: result.tieOdds,
        lpWeight: result.lpWeight, mode: result.mode, available: result.available } }
  }

  await redis.set(currentKey, JSON.stringify(payload), { ex: roundSec + 10 }).catch(() => {})
  return payload
}

  // 실시간 풀 + 역대 평균 기반 자동 시드를 병렬로 조회
  const poolKey    = `pool:${gameType}:${roundNumber}`
  const userSetKey = `users:${gameType}:${roundNumber}`
  const [poolData, userCount] = await Promise.all([
    redis.hgetall(poolKey).catch(() => null),
    redis.scard(userSetKey).catch(() => 0),
  ])

  const safeCount = (userCount as number) ?? 0

  let payload: object

  if (gameType === "baccarat") {
    const userPools = {
      player: parseInt((poolData?.player as string) ?? "0") || 0,
      banker: parseInt((poolData?.banker as string) ?? "0") || 0,
      tie:    parseInt((poolData?.tie    as string) ?? "0") || 0,
    }
    const result = calcBaccaratOdds(userPools, lpConfig, safeCount)
    payload = {
      gameType, roundNumber, userCount: safeCount, pools: userPools,
      odds: {
        player: result.playerOdds, banker: result.bankerOdds, tie: result.tieOdds,
        lpWeight: result.lpWeight, mode: result.mode, available: result.available,
      },
    }
  } else {
    const userPools = {
      bit:  parseInt((poolData?.bit  as string) ?? "0") || 0,
      coin: parseInt((poolData?.coin as string) ?? "0") || 0,
      tie:  parseInt((poolData?.tie  as string) ?? "0") || 0,
    }
    const result = calcRaceOdds(userPools, lpConfig, safeCount)
    payload = {
      gameType, roundNumber, userCount: safeCount, pools: userPools,
      odds: {
        bit: result.bitOdds, coin: result.coinOdds, tie: result.tieOdds,
        lpWeight: result.lpWeight, mode: result.mode, available: result.available,
      },
    }
  }

  // 계산된 배당을 Redis에 캐시 — 단일 키, 모든 클라이언트·관리자가 동일 값 읽음
  const currentKey = `odds:current:${gameType}:${roundNumber}`
  await redis.set(currentKey, JSON.stringify(payload), { ex: roundSec + 10 }).catch(() => {})

  return payload
}

export async function GET(request: Request) {
  const url      = new URL(request.url)
  const gameType = url.searchParams.get("type") ?? "baccarat"
  const token    = request.headers.get("Authorization")?.replace("Bearer ", "") ?? url.searchParams.get("token")
  const roundSec = gameType === "race" ? 180 : 30

  let branchId: string | null = null
  if (token) {
    const { data: { user } } = await admin.auth.getUser(token)
    if (user) {
      // branch_id 10분 캐시 — 연결마다 Supabase 쿼리 방지
      const branchCacheKey = `user:branch:${user.id}`
      const cachedBranch   = await redis.get<string>(branchCacheKey)
      if (cachedBranch !== null) {
        branchId = cachedBranch === "null" ? null : cachedBranch
      } else {
        const { data: profile } = await admin.from("profiles").select("branch_id").eq("id", user.id).single()
        branchId = profile?.branch_id ?? null
        await redis.set(branchCacheKey, branchId ?? "null", { ex: 600 })
      }
    }
  }

  const encoder    = new TextEncoder()
  let closed       = false
  const versionKey = `odds_version:${gameType}`

  const isBettingPhase = () => {
    const s = Math.floor(Date.now() / 1000) % roundSec
    return gameType === "baccarat" ? (s >= 5 && s < 20) : (s >= 10 && s < 60)
  }

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        if (closed) return
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch {}
      }

      // 1) 연결 즉시: Redis 캐시 우선, miss 시만 계산
      const initRound   = Math.floor(Math.floor(Date.now() / 1000) / roundSec)
      const cachedInit  = await redis.get<string>(`odds:current:${gameType}:${initRound}`)
      if (cachedInit) {
        send(typeof cachedInit === "string" ? JSON.parse(cachedInit) : cachedInit)
      } else {
        send(await computeFreshOdds(gameType, branchId))
      }

      let lastVersion  = (await redis.get<number>(versionKey)) ?? 0
      let lastRound    = initRound
      let wasInBetting = isBettingPhase()

      // 2) 2초마다 version 카운터 확인 → 변경 시 캐시 읽기
      //    500ms → 2000ms: Redis 요청 75% 감소
      //    loop 내 Supabase 쿼리 0 (computeFreshOdds는 캐시 miss 시만)
      const interval = setInterval(async () => {
        if (closed) { clearInterval(interval); return }
        try {
          const version      = (await redis.get<number>(versionKey)) ?? 0
          const currentRound = Math.floor(Math.floor(Date.now() / 1000) / roundSec)
          const inBetting    = isBettingPhase()
          const phaseChanged = wasInBetting && !inBetting
          const changed      = version !== lastVersion || currentRound !== lastRound || phaseChanged

          if (changed) {
            lastVersion  = version
            lastRound    = currentRound
            wasInBetting = inBetting
            const cached = await redis.get<string>(`odds:current:${gameType}:${currentRound}`)
            if (cached) {
              send(typeof cached === "string" ? JSON.parse(cached) : cached)
            } else {
              send(await computeFreshOdds(gameType, branchId))
            }
          } else {
            wasInBetting = inBetting
          }

          controller.enqueue(encoder.encode(": ping\n\n"))
        } catch {
          clearInterval(interval)
        }
      }, 2_000)

      request.signal.addEventListener("abort", () => {
        closed = true
        clearInterval(interval)
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type":      "text/event-stream",
      "Cache-Control":     "no-cache, no-transform",
      "Connection":        "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
