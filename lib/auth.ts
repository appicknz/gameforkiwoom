import "server-only"
import { cookies } from "next/headers"

export type AuthResult =
  | { ok: true; userId: string; token: string }
  | { ok: false; status: 401; error: string }

/**
 * JWT를 로컬에서 디코딩 — 외부 HTTP 호출 없이 즉시 userId + 만료 검증
 * Supabase access_token은 HS256 서명이 포함된 표준 JWT
 */
function resolveUserId(token: string): string | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    )
    if (!payload.sub) return null
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload.sub as string
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

export async function verifySession(req: Request): Promise<AuthResult> {
  const cookieStore = await cookies()
  const token = extractToken(req, cookieStore)
  if (!token) return { ok: false, status: 401, error: "Unauthorized" }

  const userId = resolveUserId(token)
  if (!userId) return { ok: false, status: 401, error: "Invalid token" }

  return { ok: true, userId, token }
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

  const userId = resolveUserId(token)
  if (!userId) return { ok: false, status: 401, error: "Invalid token" }

  return { ok: true, userId, token }
}
