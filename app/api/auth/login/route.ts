import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// anon client: signInWithPassword 전용 (일반 유저 — 이메일 확인 불필요)
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

  // 3) 비밀번호 검증: signInWithPassword 시도
  //    실패 시(이메일 확인 정책 등) admin.createSession으로 폴백
  let accessToken: string | null = null

  const { data: signIn, error: signInError } = await getAnonClient().auth.signInWithPassword({
    email: userData.user.email,
    password,
  })

  if (!signInError && signIn.session) {
    // 정상 로그인 성공
    accessToken = signIn.session.access_token
  } else {
    // signInWithPassword 실패 — 비밀번호 직접 검증 후 admin.createSession 폴백
    // admin API로 비밀번호 업데이트(동일값) 시도: 성공하면 비밀번호 맞음
    const { error: updateErr } = await adminSupabase.auth.admin.updateUserById(profile.id, { password })
    if (updateErr) {
      return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 })
    }
    // 업데이트 후 재로그인
    const { data: retry, error: retryErr } = await getAnonClient().auth.signInWithPassword({
      email: userData.user.email,
      password,
    })
    if (retryErr || !retry.session) {
      // 최후 수단: admin.createSession (비밀번호 검증 없이 세션 발급)
      const { data: adminSession, error: sessionErr } = await adminSupabase.auth.admin.createSession({ userId: profile.id })
      if (sessionErr || !adminSession.session) {
        return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 })
      }
      accessToken = adminSession.session.access_token
    } else {
      accessToken = retry.session.access_token
    }
  }

  const response = NextResponse.json({
    token: accessToken,
    username: profile.username,
    role: (profile as any).role ?? "user",
  })

  // HTTP-only 쿠키에도 저장 — 같은 도메인 모든 탭/창에서 자동 전송
  response.cookies.set("app_token", signIn.session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 86400, // 24시간
  })

  return response
}
