import "server-only"
import { Redis } from "@upstash/redis"

// 글로벌 싱글톤 — Vercel Serverless 워밍 재사용, 중복 연결 방지
const globalForRedis = globalThis as unknown as { _redis?: Redis }

export const redis =
  globalForRedis._redis ??
  new Redis({
    url:   process.env.KV_REST_API_URL!,
    token: process.env.KV_REST_API_TOKEN!,
  })

if (process.env.NODE_ENV !== "production") globalForRedis._redis = redis
