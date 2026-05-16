export const dynamic = "force-dynamic"
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

  // 유저 존재 확인
  const { data: userInfo, error: userError } = await adminSupabase.auth.admin.getUserById(userId)
  if (userError || !userInfo?.user) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 401 })
  }

  // generateLink(magiclink) 방식으로 새 access_token 발급
  const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
    type: "magiclink",
    email: userInfo.user.email!,
  })
  if (linkError || !linkData?.properties?.access_token) {
    return NextResponse.json({ error: "토큰 갱신에 실패했습니다." }, { status: 500 })
  }
  const newToken = linkData.properties.access_token
  if (!newToken) {
    return NextResponse.json({ error: "토큰 갱신에 실패했습니다." }, { status: 500 })
  }

  const response = NextResponse.json({ token: newToken })

  // HTTP-only 쿠키 갱신
  response.cookies.set("app_token", newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 86400 * 60,
  })

  return response
}
