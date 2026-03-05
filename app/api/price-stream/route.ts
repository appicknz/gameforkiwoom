/**
 * /api/price-stream
 *
 * 각 클라이언트가 연결되면 이 Route Handler가
 * Binance aggTrade WebSocket에 직접 연결해 1초마다 캔들을 집계하고,
 * SSE로 해당 클라이언트에게 실시간 가격을 전송합니다.
 *
 * 모든 사용자가 "같은 가격"을 보려면:
 * - Redis에 최신 가격과 closing prices를 저장
 * - 각 클라이언트는 Redis에서 읽은 동일한 값을 수신
 *
 * 구조:
 * [클라이언트 A] → /api/price-stream → [자체 Binance WS] → Redis에 write
 * [클라이언트 B] → /api/price-stream → Redis에서 read → SSE 전송
 * (첫 번째 연결된 클라이언트만 publisher가 되고, 나머지는 Redis polling)
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export async function GET() {
  let closed = false
  let lastSentTime = 0
  let lastClosingTime = 0

  // Publisher lock 확인 — 이 연결이 publisher가 될지 결정
  const isPublisher = await redis.set("btc:publisher:lock", "1", { nx: true, ex: 15 })

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        if (closed) return
        try {
          controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
        } catch {}
      }

      // 초기 closing prices 전송
      try {
        const stored = await redis.lrange("btc:closing_prices", 0, 99)
        if (stored.length > 0) {
          const prices = stored
            .map((s) => (typeof s === "string" ? JSON.parse(s) : s))
            .reverse()
          send({ type: "init_closing", prices })
          if (prices.length > 0) {
            lastClosingTime = prices[prices.length - 1].time
          }
        }
      } catch {}

      if (isPublisher) {
        // === PUBLISHER 모드: Binance WS 연결 + Redis write + SSE 전송 ===
        const tradeBuffer: Array<{ price: number; time: number }> = []
        let prevThirtyBucket: number | null = null
        let ws: any = null

        const connectWS = async () => {
          if (closed) return
          const { WebSocket } = await import("ws")
          ws = new WebSocket("wss://fstream.binance.com/ws/btcusdt@aggTrade")

          ws.on("message", (data: Buffer) => {
            const msg = JSON.parse(data.toString())
            tradeBuffer.push({
              price: parseFloat(msg.p),
              time: Math.floor(msg.T / 1000),
            })
          })

          ws.on("close", () => {
            if (!closed) setTimeout(connectWS, 2000)
          })
          ws.on("error", () => {
            ws?.terminate()
          })
        }

        await connectWS()

        const timer = setInterval(async () => {
          if (closed) {
            clearInterval(timer)
            ws?.terminate()
            return
          }

          // lock 갱신
          await redis.set("btc:publisher:lock", "1", { ex: 15 })

          const now = Math.floor(Date.now() / 1000)
          const bucket = now - (now % 1)
          const trades = tradeBuffer.filter((t) => t.time >= bucket)
          if (trades.length === 0) return

          const prices = trades.map((t) => t.price)
          const closingPrice = prices[prices.length - 1]

          // Redis에 저장 (subscriber들이 polling으로 읽음)
          await redis.set("btc:latest_price", JSON.stringify({ price: closingPrice, time: now }), { ex: 10 })

          // 자신도 SSE로 전송
          send({ type: "price", price: closingPrice, time: now })
          lastSentTime = now

          // 30초 마감가
          const thirtyBucket = now - (now % 30)
          if (prevThirtyBucket === null || thirtyBucket !== prevThirtyBucket) {
            prevThirtyBucket = thirtyBucket
            await redis.lpush("btc:closing_prices", JSON.stringify({ time: thirtyBucket, price: closingPrice }))
            await redis.ltrim("btc:closing_prices", 0, 99)
            await redis.set("btc:latest_closing", JSON.stringify({ time: thirtyBucket, price: closingPrice }), { ex: 60 })
            send({ type: "closing", price: closingPrice, time: thirtyBucket })
            lastClosingTime = thirtyBucket
          }

          // 버퍼 정리
          const cutoff = now - 300
          const cutoffIdx = tradeBuffer.findIndex((t) => t.time >= cutoff)
          if (cutoffIdx > 0) tradeBuffer.splice(0, cutoffIdx)
        }, 1000)

      } else {
        // === SUBSCRIBER 모드: Redis polling으로 가격 수신 ===
        const poll = async () => {
          if (closed) return

          try {
            const priceRaw = await redis.get<string>("btc:latest_price")
            if (priceRaw) {
              const data = typeof priceRaw === "string" ? JSON.parse(priceRaw) : priceRaw
              if (data.time > lastSentTime) {
                lastSentTime = data.time
                send({ type: "price", price: data.price, time: data.time })
              }
            }

            const closingRaw = await redis.get<string>("btc:latest_closing")
            if (closingRaw) {
              const data = typeof closingRaw === "string" ? JSON.parse(closingRaw) : closingRaw
              if (data.time > lastClosingTime) {
                lastClosingTime = data.time
                send({ type: "closing", price: data.price, time: data.time })
              }
            }
          } catch {}

          if (!closed) setTimeout(poll, 1000)
        }

        poll()
      }
    },
    cancel() {
      closed = true
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
