import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const REDIS_KEY = "btc:closing:latest"
const REDIS_VERSION_KEY = "btc:closing:version"

/**
 * SSE 스트림: 30초봉 마감가 실시간 push
 *
 * 마감가가 확정되면 closing-price POST API가 Redis에 저장하고 version을 increment합니다.
 * 이 SSE 스트림은 version 변경을 감지해서 모든 연결된 클라이언트에 마감가를 즉시 push합니다.
 * 폴링 없이 version key만 체크하므로 부하가 매우 낮습니다.
 */
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

      // 연결 즉시 최신 마감가 전송 (새로고침 복원)
      const latest = await redis.get<{ price: number; time: number }>(REDIS_KEY)
      if (latest) send({ type: "closing", price: latest.price, time: latest.time })

      // version 변경 감지 → 마감가 push
      let lastVersion = (await redis.get<number>(REDIS_VERSION_KEY)) ?? 0

      const interval = setInterval(async () => {
        if (closed) { clearInterval(interval); return }
        try {
          const version = (await redis.get<number>(REDIS_VERSION_KEY)) ?? 0
          if (version !== lastVersion) {
            lastVersion = version
            const data = await redis.get<{ price: number; time: number }>(REDIS_KEY)
            if (data) send({ type: "closing", price: data.price, time: data.time })
          }
          // keepalive
          controller.enqueue(encoder.encode(": ping\n\n"))
        } catch { clearInterval(interval) }
      }, 1000) // 1초마다 version만 체크 (부하 최소화)

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
