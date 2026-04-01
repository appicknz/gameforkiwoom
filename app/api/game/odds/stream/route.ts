/**
 * 실시간 배당률 SSE 스트림
 * GET /api/game/odds/stream?type=baccarat|race&token=<jwt>
 *
 * Upstash Redis Pub/Sub 기반:
 * - 배팅 발생 → redis.publish("odds:baccarat"|"odds:race", payload)
 * - 이 스트림이 즉시 메시지 수신 → 클라이언트에 push
 * - 폴링 없음, 이벤트 발생 시에만 Redis 읽기
 */
import { adminSupabase as admin } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"
import { calcBaccaratOdds, calcRaceOdds } from "@/lib/lp-system"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

async function getOddsPayload(gameType: string, branchId: string | null) {
  const now = Math.floor(Date.now() / 1000)
  const roundNumber = Math.floor(now / 30)

  let lpConfig = { enabled: true, lpAmountBaccarat: 50000, lpAmountRace: 50000 }
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

  const poolKey = `pool:${gameType}:${roundNumber}`
  const userSetKey = `users:${gameType}:${roundNumber}`
  const [poolData, userCount] = await Promise.all([
    redis.hgetall(poolKey),
    redis.scard(userSetKey),
  ])

  const safeCount = userCount ?? 0

  if (gameType === "baccarat") {
    const userPools = {
      player: parseInt((poolData?.player as string) ?? "0") || 0,
      banker: parseInt((poolData?.banker as string) ?? "0") || 0,
      tie:    parseInt((poolData?.tie    as string) ?? "0") || 0,
    }
    if (!lpConfig.enabled && !Object.values(userPools).some(v => v > 0)) {
      return { gameType, roundNumber, userCount: safeCount, pools: userPools, odds: null, mode: "waiting" }
    }
    const result = calcBaccaratOdds(userPools, lpConfig, safeCount)
    return {
      gameType, roundNumber, userCount: safeCount, pools: userPools,
      odds: { player: result.playerOdds, banker: result.bankerOdds, tie: result.tieOdds },
      mode: result.mode,
    }
  } else {
    const userPools = {
      bit:  parseInt((poolData?.bit  as string) ?? "0") || 0,
      coin: parseInt((poolData?.coin as string) ?? "0") || 0,
      tie:  parseInt((poolData?.tie  as string) ?? "0") || 0,
    }
    if (!lpConfig.enabled && !Object.values(userPools).some(v => v > 0)) {
      return { gameType, roundNumber, userCount: safeCount, pools: userPools, odds: null, mode: "waiting" }
    }
    const result = calcRaceOdds(userPools, lpConfig, safeCount)
    return {
      gameType, roundNumber, userCount: safeCount, pools: userPools,
      odds: { bit: result.bitOdds, coin: result.coinOdds, tie: result.tieOdds },
      mode: result.mode,
    }
  }
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let subscriber: any = null
  const channel = `odds:${gameType}`

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {}
      }

      // 1) 연결 즉시 현재 배당률 전송
      const initial = await getOddsPayload(gameType, branchId)
      send(initial)

      // 2) Pub/Sub 구독
      try {
        subscriber = redis.subscribe([channel])

        subscriber.on("message", async () => {
          if (closed) return
          // 라운드가 바뀌었을 수도 있으므로 항상 최신값 재계산
          const payload = await getOddsPayload(gameType, branchId)
          send(payload)
        })

        // 30초마다 라운드 전환 감지용 keepalive + 강제 갱신
        let lastRound = Math.floor(Math.floor(Date.now() / 1000) / 30)
        const pingTimer = setInterval(async () => {
          if (closed) { clearInterval(pingTimer); return }
          try {
            controller.enqueue(encoder.encode(": ping\n\n"))
            const currentRound = Math.floor(Math.floor(Date.now() / 1000) / 30)
            if (currentRound !== lastRound) {
              lastRound = currentRound
              const payload = await getOddsPayload(gameType, branchId)
              send(payload)
            }
          } catch {}
        }, 30_000)

        request.signal.addEventListener("abort", async () => {
          closed = true
          clearInterval(pingTimer)
          try { await subscriber?.unsubscribe?.() } catch {}
          try { controller.close() } catch {}
        })
      } catch {
        // Pub/Sub 실패 시 500ms 폴링으로 fallback
        const versionKey = `odds_version:${gameType}`
        let lastVersion = (await redis.get<number>(versionKey)) ?? 0
        let lastRound = Math.floor(Math.floor(Date.now() / 1000) / 30)

        const interval = setInterval(async () => {
          if (closed) { clearInterval(interval); return }
          try {
            const version = (await redis.get<number>(versionKey)) ?? 0
            const currentRound = Math.floor(Math.floor(Date.now() / 1000) / 30)
            if (version !== lastVersion || currentRound !== lastRound) {
              lastVersion = version
              lastRound = currentRound
              const payload = await getOddsPayload(gameType, branchId)
              send(payload)
            }
            controller.enqueue(encoder.encode(": ping\n\n"))
          } catch { clearInterval(interval) }
        }, 500)

        request.signal.addEventListener("abort", () => {
          closed = true
          clearInterval(interval)
          try { controller.close() } catch {}
        })
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
