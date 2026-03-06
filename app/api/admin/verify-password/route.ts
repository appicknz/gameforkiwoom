import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

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

  // 1) profiles에서 user id 조회
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .single()

  if (!profile) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 })
  }

  // 2) auth.users에서 실제 이메일 조회
  const { data: userData } = await adminSupabase.auth.admin.getUserById(profile.id)
  if (!userData.user?.email) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 })
  }

  // 3) 실제 이메일 + 입력 비밀번호로 로그인 시도
  const { error: signInError } = await getAnonClient().auth.signInWithPassword({
    email: userData.user.email,
    password,
  })

  if (signInError) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 })
  }

  return NextResponse.json({ success: true })
}
