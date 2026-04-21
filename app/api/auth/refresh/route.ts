import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"

/**
 * POST /api/auth/refresh
 * 현재 토큰이 유효하면 새 access_token 발급
 * Redis 없이 Supabase JWT만으로 검증
 */
export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) {
    return NextResponse.json({ error: "세션이 만료되었습니다. 다시 로그인해주세요." }, { status: 401 })
  }

  // 현재 유저로 새 세션 발급
  const { data: session, error: sessionError } = await adminSupabase.auth.admin.createSession({
    userId: auth.userId,
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
