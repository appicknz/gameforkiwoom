/**
 * /api/price-stream
 *
 * SSE 엔드포인트. 클라이언트가 연결하면
 * Redis에서 publish된 가격을 실시간으로 수신해 브로드캐스트합니다.
 *
 * Vercel Edge Runtime에서 Redis Pub/Sub이 지원되지 않으므로
 * Node.js runtime + Redis polling 방식으로 구현합니다.
 * (Upstash REST API는 subscribe를 지원하지 않으므로 1초 polling)
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export async function GET() {
  // publisher가 실행 중인지 확인하고, 없으면 기동
  const lock = await redis.get("price:publisher:lock")
  if (!lock) {
    // publisher를 백그라운드에서 시작
    fetch(`${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/price-publisher`).catch(() => {})
  }

  let lastTime = 0
  let lastClosingTime = 0
  let closed = false

  const stream = new ReadableStream({
    async start(controller) {
      // 초기 closing prices 전송
      try {
        const stored = await redis.lrange("btc:closing_prices", 0, 99)
        const closingPrices = stored
          .map((s) => (typeof s === "string" ? JSON.parse(s) : s))
          .reverse() // lpush로 쌓였으므로 역순 정렬
        if (closingPrices.length > 0) {
          controller.enqueue(
            `data: ${JSON.stringify({ type: "init_closing", prices: closingPrices })}\n\n`
          )
        }
      } catch {}

      // 1초마다 Redis에서 최신 가격 polling
      const poll = async () => {
        if (closed) return
        try {
          // 현재가
          const priceRaw = await redis.get<string>("btc:latest_price")
          if (priceRaw) {
            const data = typeof priceRaw === "string" ? JSON.parse(priceRaw) : priceRaw
            if (data.time > lastTime) {
              lastTime = data.time
              controller.enqueue(`data: ${JSON.stringify({ type: "price", price: data.price, time: data.time })}\n\n`)
            }
          }

          // 최신 closing price
          const closingRaw = await redis.lindex("btc:closing_prices", 0)
          if (closingRaw) {
            const data = typeof closingRaw === "string" ? JSON.parse(closingRaw) : closingRaw
            if (data.time > lastClosingTime) {
              lastClosingTime = data.time
              controller.enqueue(`data: ${JSON.stringify({ type: "closing", price: data.price, time: data.time })}\n\n`)
            }
          }
        } catch {}

        if (!closed) setTimeout(poll, 1000)
      }

      poll()
    },
    cancel() {
      closed = true
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
