import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const ALLOWED_ROLES = ['master', 'super_admin', 'branch_admin', 'admin']

function getAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: Request) {
  // 세션 검증 (Authorization 헤더 있으면 사용, 없으면 username으로만 처리)
  const auth = await verifySession(req)
  const body = await req.json()
  const { username, password } = body

  if (!username || !password) {
    return NextResponse.json({ error: "아이디와 비밀번호를 입력해주세요." }, { status: 400 })
  }

  // profiles에서 username으로 조회
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("id, role")
    .eq("username", username)
    .single()

  if (!profile) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 })
  }

  // 세션이 있으면 본인 계정인지 확인
  if (auth.ok && auth.userId !== profile.id) {
    return NextResponse.json({ error: "인증에 실패했습니다." }, { status: 401 })
  }

  if (!ALLOWED_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
  }

  // auth.users에서 이메일 조회 후 비밀번호 검증
  const { data: userData } = await adminSupabase.auth.admin.getUserById(profile.id)
  if (!userData.user?.email) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 })
  }

  const { error: signInError } = await getAnonClient().auth.signInWithPassword({
    email: userData.user.email,
    password,
  })

  if (signInError) {
    return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 })
  }

  return NextResponse.json({ success: true })
}
