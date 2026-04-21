import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"
import { cookies } from "next/headers"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

// Redis 세션 키
export const sessionKey  = (userId: string) => `session:${userId}`
export const tokenMapKey = (token: string)  => `token_uid:${token.slice(-32)}`  // 토큰 → userId 역매핑

const SESSION_TTL = 86400  // 24시간 — access_token 1시간 만료와 무관하게 세션 유지

// 새 로그인 시 Redis에 토큰 저장 (기존 토큰 덮어쓰기 → 중복 세션 무효화)
export async function saveSession(userId: string, token: string) {
  await Promise.all([
    redis.set(sessionKey(userId), token,  { ex: SESSION_TTL }),
    redis.set(tokenMapKey(token), userId, { ex: SESSION_TTL }),  // 역매핑 저장
  ])
}

export type AuthResult =
  | { ok: true; userId: string; token: string }
  | { ok: false; status: 401 | 409; error: string }

/**
 * 토큰 → userId 해석 (Supabase getUser 우선, 만료 시 Redis 역매핑 fallback)
 * - Supabase access_token 만료(1시간) 이후에도 Redis 역매핑이 살아있으면 세션 유효
 * - 역매핑도 없으면 진짜 401
 */
async function resolveUserId(token: string): Promise<string | null> {
  const { data: { user }, error } = await adminSupabase.auth.getUser(token)
  if (!error && user) return user.id

  // Supabase 토큰 만료 → Redis 역매핑으로 userId 복원
  const mapped = await redis.get<string>(tokenMapKey(token))
  return mapped ?? null
}

/**
 * Bearer 토큰 검증 + Redis 세션 일치 확인
 * - 401: 토큰 없음 / 세션 없음
 * - 409: Redis에 저장된 토큰과 불일치 → 다른 기기에서 새로 로그인한 상태
 */
export async function verifySession(req: Request): Promise<AuthResult> {
  const auth = req.headers.get("Authorization")
  // Authorization 헤더 없으면 HTTP-only 쿠키에서 읽음
  const cookieStore = await cookies()
  const token = (auth?.startsWith("Bearer ") ? auth.slice(7) : null)
    ?? cookieStore.get("app_token")?.value
    ?? null
  if (!token) return { ok: false, status: 401, error: "Unauthorized" }

  const userId = await resolveUserId(token)
  if (!userId) return { ok: false, status: 401, error: "Invalid token" }

  const stored = await redis.get<string>(sessionKey(userId))
  if (stored !== null && stored !== token) {
    return { ok: false, status: 409, error: "DUPLICATE_LOGIN" }
  }

  // 세션 TTL 슬라이딩 갱신 — 사용 중인 동안 만료되지 않게
  if (stored === token) {
    await Promise.all([
      redis.expire(sessionKey(userId), SESSION_TTL),
      redis.expire(tokenMapKey(token), SESSION_TTL),
    ])
  }

  return { ok: true, userId, token }
}

/**
 * URL 쿼리 파라미터 token도 허용하는 버전 (SSE EventSource용)
 */
export async function verifySessionFromUrl(req: Request): Promise<AuthResult> {
  const url = new URL(req.url)
  const auth = req.headers.get("Authorization")
  const cookieStore = await cookies()
  const token =
    (auth?.startsWith("Bearer ") ? auth.slice(7) : null) ??
    url.searchParams.get("token") ??
    cookieStore.get("app_token")?.value ??
    null

  if (!token) return { ok: false, status: 401, error: "Unauthorized" }

  const userId = await resolveUserId(token)
  if (!userId) return { ok: false, status: 401, error: "Invalid token" }

  const stored = await redis.get<string>(sessionKey(userId))
  if (stored !== null && stored !== token) {
    return { ok: false, status: 409, error: "DUPLICATE_LOGIN" }
  }

  if (stored === token) {
    await Promise.all([
      redis.expire(sessionKey(userId), SESSION_TTL),
      redis.expire(tokenMapKey(token), SESSION_TTL),
    ])
  }

  return { ok: true, userId, token }
}
