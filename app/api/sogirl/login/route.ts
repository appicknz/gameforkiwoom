import { NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  const { id, password } = await request.json()

  const adminId = process.env.SUPER_ADMIN_ID
  const adminPassword = process.env.SUPER_ADMIN_PASSWORD

  if (!adminId || !adminPassword) {
    return NextResponse.json({ error: "서버 설정 오류" }, { status: 500 })
  }

  if (id !== adminId || password !== adminPassword) {
    return NextResponse.json({ error: "아이디 또는 비밀번호가 틀립니다" }, { status: 401 })
  }

  const response = NextResponse.json({ ok: true })

  // HttpOnly 쿠키로 어드민 세션 발급 (24시간)
  response.cookies.set("sogirl_admin", "1", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24,
    path: "/",
  })

  return response
}
