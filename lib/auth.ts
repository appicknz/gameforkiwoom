import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { createClient } from "@supabase/supabase-js"
import { cookies } from "next/headers"

// JWT 검증은 anon 클라이언트로 — service_role(adminSupabase)은 getUser() 검증이 다르게 동작
const anonClient = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export type AuthResult =
  | { ok: true; userId: string; token: string }
  | { ok: false; status: 401; error: string }

/**
 * Supabase JWT 자체만 검증 — Redis 이중 검증 제거
 * access_token이 유효하면 통과, 만료되면 401 반환
 * 클라이언트가 refresh 요청으로 자동 갱신
 */
async function resolveUserId(token: string): Promise<string | null> {
  const { data: { user }, error } = await anonClient.auth.getUser(token)
  if (!error && user) return user.id
  return null
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

  const userId = await resolveUserId(token)
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

  const userId = await resolveUserId(token)
  if (!userId) return { ok: false, status: 401, error: "Invalid token" }

  return { ok: true, userId, token }
}
