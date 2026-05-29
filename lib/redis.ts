import "server-only"
import { Redis } from "@upstash/redis"

// 글로벌 싱글톤 — Vercel Serverless 워밍 재사용, 중복 연결 방지
const globalForRedis = globalThis as unknown as { _redis?: Redis }

function createRedis(): Redis {
  const url   = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (!url || !token) {
    throw new Error(`Redis env missing: KV_REST_API_URL=${!!url}, KV_REST_API_TOKEN=${!!token}`)
  }
  return new Redis({ url, token })
}

export const redis: Redis =
  globalForRedis._redis ??
  (() => {
    const r = createRedis()
    if (process.env.NODE_ENV !== "production") globalForRedis._redis = r
    return r
  })()
