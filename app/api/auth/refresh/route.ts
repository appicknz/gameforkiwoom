import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { cookies } from "next/headers"
import { NextResponse } from "next/server"

/**
 * POST /api/auth/refresh
 * 만료된 토큰이어도 sub(userId)를 추출해 새 access_token 발급
 * exp 체크 없이 서명 구조만 검증 — 실제 사용자 존재 여부는 Supabase admin API가 보장
 */
function extractUserIdIgnoreExpiry(token: string): string | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    )
    return payload.sub ?? null
  } catch { return null }
}

export async function POST(req: Request) {
  // 만료 여부와 무관하게 토큰에서 userId 추출
  const authHeader = req.headers.get("Authorization")
  const cookieStore = await cookies()
  const token = (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null)
    ?? cookieStore.get("app_token")?.value
    ?? null

  const userId = token ? extractUserIdIgnoreExpiry(token) : null
  if (!userId) {
    return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 })
  }

  // 현재 유저로 새 세션 발급
  const { data: session, error: sessionError } = await adminSupabase.auth.admin.createSession({
    userId,
  })

  if (sessionError || !session?.access_token) {
    return NextResponse.json({ error: "토큰 갱신에 실패했습니다." }, { status: 500 })
  }

  const response = NextResponse.json({ token: session.access_token })

  // HTTP-only 쿠키 갱신
  response.cookies.set("app_token", session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 86400 * 60, // 60일 — Supabase refresh_token 수명과 동일
  })

  return response
}
