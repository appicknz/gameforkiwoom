import { redis } from "@/lib/redis"

export const dynamic    = "force-dynamic"
export const runtime    = "nodejs"
export const maxDuration = 60

const CHAT_KEY    = "bitbet:chat:messages"
const VERSION_KEY = "bitbet:chat:version"

export async function GET(request: Request) {
  const encoder = new TextEncoder()
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        if (closed) return
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`)) } catch {}
      }

      // 1) 연결 즉시 전체 메시지 전송
      const initial = await redis.lrange(CHAT_KEY, 0, 199).catch(() => [])
      send({ messages: [...initial].reverse() })

      let lastVersion = (await redis.get<number>(VERSION_KEY)) ?? 0

      // 2) version 카운터 폴링 — 새 메시지 발생 시에만 메시지 전송
      //    유저 1,000명 기준: 1초당 1,000 Redis GET → 2초 간격 = 500 GET/s
      //    vs 이전 폴링: 500 GET/s + 500 Vercel Function 상시 실행
      const interval = setInterval(async () => {
        if (closed) { clearInterval(interval); return }
        try {
          const version = (await redis.get<number>(VERSION_KEY)) ?? 0
          if (version !== lastVersion) {
            lastVersion = version
            const msgs = await redis.lrange(CHAT_KEY, 0, 199)
            send({ messages: [...msgs].reverse() })
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
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}
