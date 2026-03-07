import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const CHAT_KEY = "bitbet:chat:messages"
const CHAT_VERSION_KEY = "bitbet:chat:version"
const MAX_MESSAGES = 200

export async function GET(request: Request) {
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

      // 연결 즉시 현재 메시지 전송
      try {
        const messages = await redis.lrange(CHAT_KEY, 0, MAX_MESSAGES - 1)
        send({ messages: messages.reverse() })
      } catch {
        send({ messages: [] })
      }

      // version 키 감시 — 메시지가 추가될 때만 Redis 읽기
      let lastVersion = (await redis.get<number>(CHAT_VERSION_KEY)) ?? 0

      const interval = setInterval(async () => {
        if (closed) { clearInterval(interval); return }
        try {
          const version = (await redis.get<number>(CHAT_VERSION_KEY)) ?? 0
          if (version !== lastVersion) {
            lastVersion = version
            const messages = await redis.lrange(CHAT_KEY, 0, MAX_MESSAGES - 1)
            send({ messages: messages.reverse() })
          }
          // keepalive ping (연결 유지)
          controller.enqueue(encoder.encode(": ping\n\n"))
        } catch {
          clearInterval(interval)
        }
      }, 3_000) // 3초마다 version만 확인 (변경 없으면 메시지 fetch 안 함)

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
