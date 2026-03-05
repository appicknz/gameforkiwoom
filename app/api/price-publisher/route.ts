/**
 * /api/price-publisher
 *
 * 서버가 Binance aggTrade WebSocket에 연결해서
 * 1초마다 집계된 캔들(가격)을 Redis에 publish합니다.
 *
 * 이 엔드포인트는 cron 또는 단 한 번만 호출하면 됩니다.
 * 실제 운영에서는 별도 워커나 Vercel Cron으로 호출하세요.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export async function GET() {
  // 이미 publisher가 실행 중이면 중복 실행 방지
  const lock = await redis.set("price:publisher:lock", "1", { nx: true, ex: 30 })
  if (!lock) {
    return new Response("Publisher already running", { status: 200 })
  }

  const tradeBuffer: Array<{ price: number; quantity: number; time: number }> = []
  let prevThirtyBucket: number | null = null

  const ws = new (await import("ws")).WebSocket(
    "wss://fstream.binance.com/ws/btcusdt@aggTrade"
  )

  ws.on("message", (data: Buffer) => {
    const msg = JSON.parse(data.toString())
    tradeBuffer.push({
      price: parseFloat(msg.p),
      quantity: parseFloat(msg.q),
      time: Math.floor(msg.T / 1000),
    })
  })

  // 1초마다 캔들 집계 후 Redis publish
  const timer = setInterval(async () => {
    // lock 갱신
    await redis.set("price:publisher:lock", "1", { ex: 30 })

    const now = Math.floor(Date.now() / 1000)
    const bucket = now - (now % 1)
    const trades = tradeBuffer.filter((t) => t.time >= bucket)
    if (trades.length === 0) return

    const prices = trades.map((t) => t.price)
    const closingPrice = prices[prices.length - 1]

    // 현재가를 Redis key에 저장 (SSE polling용) + publish
    const payload = JSON.stringify({ price: closingPrice, time: now })
    await redis.set("btc:latest_price", payload, { ex: 10 })
    await redis.publish("btc:price", JSON.stringify({ type: "price", price: closingPrice, time: now }))

    // 30초 마감가 publish
    const thirtyBucket = now - (now % 30)
    if (prevThirtyBucket === null || thirtyBucket !== prevThirtyBucket) {
      prevThirtyBucket = thirtyBucket

      // Redis list에 최근 100개 보관
      await redis.lpush("btc:closing_prices", JSON.stringify({ time: thirtyBucket, price: closingPrice }))
      await redis.ltrim("btc:closing_prices", 0, 99)

      await redis.publish(
        "btc:price",
        JSON.stringify({ type: "closing", price: closingPrice, time: thirtyBucket })
      )
    }

    // 오래된 버퍼 정리
    const cutoff = now - 86400
    tradeBuffer.splice(0, tradeBuffer.findIndex((t) => t.time >= cutoff))
  }, 1000)

  ws.on("close", () => clearInterval(timer))
  ws.on("error", () => {
    clearInterval(timer)
    ws.close()
  })

  return new Response("Publisher started", { status: 200 })
}
