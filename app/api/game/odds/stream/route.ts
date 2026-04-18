import { adminSupabase as admin } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"
import { calcBaccaratOdds, calcRaceOdds, branchToLpConfig, DEFAULT_LP_CONFIG } from "@/lib/lp-system"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 60

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

async function getOddsPayload(gameType: string, branchId: string | null) {
  // race는 180초(3분) 라운드, baccarat은 30초 라운드
  const roundSec = gameType === "race" ? 180 : 30
  const roundNumber = Math.floor(Math.floor(Date.now() / 1000) / roundSec)

  // 브랜치 LP 설정 조회
  // branchId가 없으면 LP 비활성으로 처리 — 지점 미배정 유저에게 가짜 1.95x 방지
  let lpConfig = { ...DEFAULT_LP_CONFIG, enabled: false }
  if (branchId) {
    const { data: branch } = await admin
      .from("branches")
      .select("lp_enabled, lp_amount_baccarat, lp_amount_race, lp_multiplier_baccarat, lp_multiplier_race")
      .eq("id", branchId)
      .single()
    if (branch) lpConfig = branchToLpConfig(branch)
    else lpConfig = { ...DEFAULT_LP_CONFIG, enabled: false }
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

  // 계산된 배당을 Redis에 캐시 — round-stats가 동일한 값을 읽을 수 있게 단일 소스화
  const currentKey = `odds:current:${gameType}:${roundNumber}`
  await redis.set(currentKey, JSON.stringify(payload), { ex: roundSec + 10 }).catch(() => {})

  return payload
}

export async function GET(request: Request) {
  const url = new URL(request.url)
  const gameType = url.searchParams.get("type") ?? "baccarat"
  const token =
    request.headers.get("Authorization")?.replace("Bearer ", "") ??
    url.searchParams.get("token")

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

  const encoder = new TextEncoder()
  let closed = false
  const versionKey = `odds_version:${gameType}`

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {}
      }

      // 1) 연결 즉시 현재 배당률 전송 (LP 기반이므로 배팅 없어도 odds 있음)
      const initial = await getOddsPayload(gameType, branchId)
      send(initial)

      // 2) 버전 카운터 폴링 — 배팅 발생(incr) 또는 라운드 전환 시 갱신
      const roundInterval = gameType === "race" ? 180 : 30
      // baccarat: 배팅 구간 = secInRound 5~14 (timeLeft 25~15), 정산 0~4, 게임중 15~29
      // race:     배팅 구간 = secInRound 10~59, 정산 0~9, 게임중 60~179
      const isBettingPhase = () => {
        const s = Math.floor(Date.now() / 1000) % roundInterval
        if (gameType === "baccarat") return s >= 5 && s < 15
        return s >= 10 && s < 60
      }
      let lastVersion = (await redis.get<number>(versionKey)) ?? 0
      let lastRound = Math.floor(Math.floor(Date.now() / 1000) / roundInterval)
      let wasInBetting = isBettingPhase()

      const interval = setInterval(async () => {
        if (closed) { clearInterval(interval); return }
        try {
          const version = (await redis.get<number>(versionKey)) ?? 0
          const currentRound = Math.floor(Math.floor(Date.now() / 1000) / roundInterval)
          const inBetting = isBettingPhase()

          // 배팅 마감 순간 감지: 배팅 → 게임중 전환
          if (wasInBetting && !inBetting) {
            // 확정 배당을 odds:final에 저장 (settle이 이 값을 정산에 사용)
            const payload = await getOddsPayload(gameType, branchId)
            const finalKey = `odds:final:${gameType}:${currentRound}`
            const oddsToSave = payload.odds
            await redis.set(finalKey, JSON.stringify(oddsToSave), { ex: roundInterval + 60 }).catch(() => {})
            // 마감 배당을 클라이언트에도 1회 전송
            send(payload)
          }

          // 배팅 구간에서만 배당 갱신 전송 — 게임중에는 배당 변동 차단
          if (inBetting && (version !== lastVersion || currentRound !== lastRound)) {
            lastVersion = version
            lastRound = currentRound
            const payload = await getOddsPayload(gameType, branchId)
            send(payload)
          } else if (currentRound !== lastRound) {
            // 라운드 전환 시 새 라운드 초기 배당 전송
            lastRound = currentRound
            const payload = await getOddsPayload(gameType, branchId)
            send(payload)
          }
          wasInBetting = inBetting
          controller.enqueue(encoder.encode(": ping\n\n"))
        } catch {
          clearInterval(interval)
        }
      }, 500)

      request.signal.addEventListener("abort", () => {
        closed = true
        clearInterval(interval)
        try { controller.close() } catch {}
      })
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
