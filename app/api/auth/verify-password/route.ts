export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"
import { adminSupabase } from "@/lib/supabase-admin"
import { createClient } from "@supabase/supabase-js"

function getAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// 현재 비밀번호가 맞는지 확인 — 비밀번호 변경 1단계에서 사용
// Supabase Auth signInWithPassword로 검증 (password_hash 컬럼 불필요)
export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { password } = await req.json()
  if (!password) return NextResponse.json({ error: "비밀번호를 입력해주세요." }, { status: 400 })

  // 현재 유저의 이메일 조회
  const { data: userData, error: userError } = await adminSupabase.auth.admin.getUserById(auth.userId)
  if (userError || !userData.user?.email) {
    return NextResponse.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 400 })
  }

  // signInWithPassword로 비밀번호 검증
  const { error: signInError } = await getAnonClient().auth.signInWithPassword({
    email: userData.user.email,
    password,
  })

  if (signInError) {
    return NextResponse.json({ error: "현재 비밀번호가 일치하지 않습니다." }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
