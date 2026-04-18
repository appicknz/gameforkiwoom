import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { saveSession } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// anon client: signInWithPassword 전용, 서버에서만 실행
function getAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: Request) {
  const { username, password } = await req.json()

  if (!username || !password) {
    return NextResponse.json({ error: "아이디와 비밀번호를 입력해주세요." }, { status: 400 })
  }

  // 1) profiles에서 user_id 조회
  const { data: profile, error: profileError } = await adminSupabase
    .from("profiles")
    .select("id, username, role")
    .eq("username", username)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 })
  }

  // 2) auth.users에서 이메일 조회
  const { data: userData, error: userError } = await adminSupabase.auth.admin.getUserById(profile.id)
  if (userError || !userData.user?.email) {
    return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 })
  }

  // 3) 서버에서 signInWithPassword → access_token 반환
  const { data: signIn, error: signInError } = await getAnonClient().auth.signInWithPassword({
    email: userData.user.email,
    password,
  })

  if (signInError || !signIn.session) {
    return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 })
  }

  // Redis에 최신 토큰 저장 → 이전 기기/세션 토큰 무효화
  await saveSession(profile.id, signIn.session.access_token)

  return NextResponse.json({
    token: signIn.session.access_token,
    username: profile.username,
    role: (profile as any).role ?? "user",
  })
}
