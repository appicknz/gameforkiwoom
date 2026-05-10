import "server-only"
import { cookies } from "next/headers"
import { redis } from "@/lib/redis"

export type AuthResult =
  | { ok: true; userId: string; token: string }
  | { ok: false; status: 401; error: string }

/** Redis key: 유저 활성 세션 버전 */
export function sessionVersionKey(userId: string) {
  return `session_version:${userId}`
}

/**
 * JWT를 로컬에서 디코딩 — payload와 버전(sv) 반환
 * Supabase access_token은 HS256 서명이 포함된 표준 JWT
 */
function decodeToken(token: string): { sub: string; sv?: number; exp?: number } | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    )
    if (!payload.sub) return null
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

function extractToken(req: Request, cookieStore: Awaited<ReturnType<typeof cookies>>): string | null {
  const auth = req.headers.get("Authorization")
  return (auth?.startsWith("Bearer ") ? auth.slice(7) : null)
    ?? cookieStore.get("app_token")?.value
    ?? null
}

/** 토큰 검증 + session_version 비교 (중복 로그인 감지) */
async function verifyToken(token: string): Promise<{ userId: string } | null> {
  const payload = decodeToken(token)
  if (!payload) return null

  const userId = payload.sub

  // sv(session version) 클레임이 있으면 Redis 버전과 비교
  if (payload.sv !== undefined) {
    const current = await redis.get<number>(sessionVersionKey(userId))
    if (current !== null && payload.sv < current) return null  // 구버전 세션 — 무효
  }

  return { userId }
}

export async function verifySession(req: Request): Promise<AuthResult> {
  const cookieStore = await cookies()
  const token = extractToken(req, cookieStore)
  if (!token) return { ok: false, status: 401, error: "Unauthorized" }

  const result = await verifyToken(token)
  if (!result) return { ok: false, status: 401, error: "Session expired" }

  return { ok: true, userId: result.userId, token }
}

/**
 * URL 쿼리 파라미터 token도 허용하는 버전 (SSE EventSource용)
 */
export async function verifySessionFromUrl(req: Request): Promise<AuthResult> {
  const url = new URL(req.url)
  const cookieStore = await cookies()
  const token =
    extractToken(req, cookieStore) ??
    url.searchParams.get("token") ??
    null

  if (!token) return { ok: false, status: 401, error: "Unauthorized" }

  const result = await verifyToken(token)
  if (!result) return { ok: false, status: 401, error: "Session expired" }

  return { ok: true, userId: result.userId, token }
}
