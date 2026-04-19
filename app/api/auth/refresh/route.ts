import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { saveSession, verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"

/**
 * POST /api/auth/refresh
 * Redis 세션이 살아있는 한 비밀번호 없이 새 access_token 발급
 * - 클라이언트는 45분마다 자동 호출 → Supabase 1시간 만료 전에 갱신
 * - Supabase admin.generateLink("magiclink") 방식으로 패스워드 불필요
 */
export async function POST(req: Request) {
  // Redis 역매핑 덕분에 Supabase 토큰이 만료돼도 세션 확인 가능
  const auth = await verifySession(req)
  if (!auth.ok) {
    return NextResponse.json({ error: "세션이 만료되었습니다. 다시 로그인해주세요." }, { status: 401 })
  }

  // admin API로 해당 유저의 새 session 발급
  const { data: userData, error: userError } = await adminSupabase.auth.admin.getUserById(auth.userId)
  if (userError || !userData.user?.email) {
    return NextResponse.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 404 })
  }

  // admin.generateLink는 로그인 세션을 만들지 않으므로 임시 비밀번호로 교체 후 로그인 사용
  // 대신 adminSupabase.auth.admin.createSession 사용 (Supabase 2.x 지원)
  const { data: session, error: sessionError } = await adminSupabase.auth.admin.createSession({
    userId: auth.userId,
  })

  if (sessionError || !session?.access_token) {
    return NextResponse.json({ error: "토큰 갱신에 실패했습니다." }, { status: 500 })
  }

  // Redis 세션 갱신 (새 토큰으로 덮어쓰기, 중복 세션 무효화 포함)
  await saveSession(auth.userId, session.access_token)

  return NextResponse.json({ token: session.access_token })
}

