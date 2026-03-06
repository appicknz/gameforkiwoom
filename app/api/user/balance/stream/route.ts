import { createClient as createSupabaseClient } from "@supabase/supabase-js"
import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const supabase = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  // 1) JWT 검증 (서버에서만 - 위변조 방지)
  // EventSource는 커스텀 헤더를 지원 안 하므로 쿼리 파라미터로도 수신
  const url = new URL(request.url)
  const token =
    request.headers.get("Authorization")?.replace("Bearer ", "") ??
    url.searchParams.get("token")
  if (!token) {
    return new Response("Unauthorized", { status: 401 })
  }

  const { data: userData, error } = await supabase.auth.getUser(token)
  if (error || !userData?.user?.id) {
    return new Response("Invalid token", { status: 401 })
  }

  const userId = userData.user.id
  const redisKey = `balance:${userId}`

  // 2) SSE 스트림 생성
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

      // 연결 즉시 현재 잔고 전송
      const current = await redis.get<number>(redisKey)
      if (current !== null) {
        send({ balance: current })
      } else {
        // Redis에 없으면 DB에서 조회
        const { data: bal } = await supabase
          .from("balances")
          .select("amount")
          .eq("user_id", userId)
          .single()
        if (bal) {
          await redis.set(redisKey, bal.amount, { ex: 3600 })
          send({ balance: bal.amount })
        }
      }

      // 변경 감지: Redis에서 version 키를 watch (배팅/정산 시 increment)
      const versionKey = `balance_version:${userId}`
      let lastVersion = (await redis.get<number>(versionKey)) ?? 0

      const interval = setInterval(async () => {
        if (closed) { clearInterval(interval); return }
        try {
          const version = (await redis.get<number>(versionKey)) ?? 0
          if (version !== lastVersion) {
            lastVersion = version
            const newBalance = await redis.get<number>(redisKey)
            if (newBalance !== null) send({ balance: newBalance })
          }
          // keepalive ping (30초마다)
          controller.enqueue(encoder.encode(": ping\n\n"))
        } catch { clearInterval(interval) }
      }, 3_000) // 3초마다 version 확인 (변경 시에만 push - 폴링보다 부하 적음)

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
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
