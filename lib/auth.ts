import "server-only"
import { cookies } from "next/headers"

export type AuthResult =
  | { ok: true; userId: string; token: string }
  | { ok: false; status: 401; error: string }

/**
 * JWT를 로컬에서 디코드하여 sub(userId)와 exp를 검증
 * Supabase 외부 HTTP 호출 없이 즉시 처리 — 지연 0
 */
function resolveUserIdFromJWT(token: string): string | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    // base64url → base64 변환 후 디코드
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    )
    // 만료 검증
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

  const userId = resolveUserIdFromJWT(token)
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

  const userId = resolveUserIdFromJWT(token)
  if (!userId) return { ok: false, status: 401, error: "Invalid token" }

  return { ok: true, userId, token }
}
