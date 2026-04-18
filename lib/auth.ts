import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

// Redis 세션 키
export const sessionKey = (userId: string) => `session:${userId}`

// 새 로그인 시 Redis에 토큰 저장 (기존 토큰 덮어쓰기 → 중복 세션 무효화)
// Supabase access_token 만료(1시간)보다 조금 길게 설정
export async function saveSession(userId: string, token: string) {
  await redis.set(sessionKey(userId), token, { ex: 3700 })
}

export type AuthResult =
  | { ok: true; userId: string; token: string }
  | { ok: false; status: 401 | 409; error: string }

/**
 * Bearer 토큰 검증 + Redis 세션 일치 확인
 * - 401: 토큰 없음 / Supabase 검증 실패
 * - 409: Redis에 저장된 토큰과 불일치 → 다른 기기에서 새로 로그인한 상태
 */
export async function verifySession(req: Request): Promise<AuthResult> {
  const auth = req.headers.get("Authorization")
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null
  if (!token) return { ok: false, status: 401, error: "Unauthorized" }

  const { data: { user }, error } = await adminSupabase.auth.getUser(token)
  if (error || !user) return { ok: false, status: 401, error: "Invalid token" }

  const stored = await redis.get<string>(sessionKey(user.id))
  // stored가 null이면 (Redis 만료 or 미등록) 일단 통과 — 레거시 토큰 호환
  if (stored !== null && stored !== token) {
    return { ok: false, status: 409, error: "DUPLICATE_LOGIN" }
  }

  return { ok: true, userId: user.id, token }
}

/**
 * URL 쿼리 파라미터 token도 허용하는 버전 (SSE EventSource용)
 */
export async function verifySessionFromUrl(req: Request): Promise<AuthResult> {
  const url = new URL(req.url)
  const auth = req.headers.get("Authorization")
  const token =
    (auth?.startsWith("Bearer ") ? auth.slice(7) : null) ??
    url.searchParams.get("token")

  if (!token) return { ok: false, status: 401, error: "Unauthorized" }

  const { data: { user }, error } = await adminSupabase.auth.getUser(token)
  if (error || !user) return { ok: false, status: 401, error: "Invalid token" }

  const stored = await redis.get<string>(sessionKey(user.id))
  if (stored !== null && stored !== token) {
    return { ok: false, status: 409, error: "DUPLICATE_LOGIN" }
  }

  return { ok: true, userId: user.id, token }
}
