/**
 * 실시간 배당률 SSE 스트림
 * GET /api/game/odds/stream?type=baccarat|race&token=<jwt>
 *
 * 배팅이 들어올 때마다 Redis version key를 increment →
 * 이 스트림이 변경을 감지해 즉시 클라이언트로 push
 * 폴링 없음, 이벤트 기반 실시간 배당률 전달
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
  // 현재 라운드 번호 (30초 기준)
  const now = Math.floor(Date.now() / 1000)
  const roundNumber = Math.floor(now / 30)

  // 지점 LP 설정
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

  // Redis에서 현재 라운드 배팅 풀 + 유저 수 조회
  // userSet은 SADD로 저장되므로 SCARD로 읽어야 함
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
    // LP가 활성화되어 있으면 배팅이 없어도 odds 계산 가능 (LP가 양쪽에 깔려 있음)
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

  // 인증 (optional - 비로그인도 배당 볼 수 있도록 허용)
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

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        if (closed) return
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {}
      }

      // 연결 즉시 현재 배당률 전송
      const initial = await getOddsPayload(gameType, branchId)
      send(initial)

      // version key 감시 (배팅 발생 시 increment)
      const versionKey = `odds_version:${gameType}`
      let lastVersion = (await redis.get<number>(versionKey)) ?? 0
      // 라운드 변경 감지용
      let lastRound = Math.floor(Math.floor(Date.now() / 1000) / 30)

      const interval = setInterval(async () => {
        if (closed) { clearInterval(interval); return }
        try {
          const [version, pingCheck] = await Promise.all([
            redis.get<number>(versionKey),
            Promise.resolve(null),
          ])
          const currentRound = Math.floor(Math.floor(Date.now() / 1000) / 30)

          // 라운드 전환 또는 배팅 발생 시 즉시 push
          if ((version ?? 0) !== lastVersion || currentRound !== lastRound) {
            lastVersion = version ?? 0
            lastRound = currentRound
            const payload = await getOddsPayload(gameType, branchId)
            send(payload)
          }

          // keepalive
          if (!closed) {
            controller.enqueue(encoder.encode(": ping\n\n"))
          }
        } catch { clearInterval(interval) }
      }, 500) // 500ms마다 version 체크 - 배팅 즉시 감지

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
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
