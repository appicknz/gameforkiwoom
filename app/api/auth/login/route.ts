import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { redis } from "@/lib/redis"
import { sessionVersionKey } from "@/lib/auth"
import jwt from "jsonwebtoken"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? process.env.INTERNAL_SECRET ?? "fallback-secret"

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

  // 3) signInWithPassword 시도
  const { data: signIn, error: signInError } = await getAnonClient().auth.signInWithPassword({
    email: userData.user.email,
    password,
  })

  let accessToken: string | null = signIn?.session?.access_token ?? null

  if (signInError || !accessToken) {
    const msg = signInError?.message ?? ""
    // "Email not confirmed" 오류: 이메일 확인 정책에 막힌 것이므로
    // 비밀번호 자체는 맞음 → 이메일 확인을 강제로 처리 후 재시도
    if (msg.includes("Email not confirmed") || msg.includes("email_not_confirmed")) {
      await adminSupabase.auth.admin.updateUserById(profile.id, { email_confirm: true })
      const { data: retry, error: retryErr } = await getAnonClient().auth.signInWithPassword({
        email: userData.user.email,
        password,
      })
      if (retryErr || !retry.session) {
        return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 })
      }
      accessToken = retry.session.access_token
    } else {
      // "Invalid credentials" 또는 기타 오류 = 비밀번호 틀림
      return NextResponse.json({ error: "아이디 또는 비밀번호가 올바르지 않습니다." }, { status: 401 })
    }
  }

  // session_version 증가 — 기존 세션 무효화 (중복 로그인 방지)
  const sv = await redis.incr(sessionVersionKey(profile.id))
  // 30일 후 자동 만료
  await redis.expire(sessionVersionKey(profile.id), 60 * 60 * 24 * 30)

  // 30일짜리 자체 JWT 발행 (sv 클레임 포함)
  const appToken = jwt.sign(
    { sub: profile.id, sv, role: (profile as Record<string, unknown>).role ?? "user" },
    JWT_SECRET,
    { expiresIn: "30d" }
  )

  const response = NextResponse.json({
    token: appToken,
    username: profile.username,
    role: (profile as Record<string, unknown>).role ?? "user",
  })

  // HTTP-only 쿠키에도 저장 (30일)
  response.cookies.set("app_token", appToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })

  return response
}
