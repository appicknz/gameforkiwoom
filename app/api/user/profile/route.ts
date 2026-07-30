export const dynamic = "force-dynamic"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { NextResponse } from 'next/server'
import { createClient } from "@supabase/supabase-js"

function getAnonClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// 현재 로그인 유저 프로필 조회
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { userId: id } = auth

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('id, username, role, created_at, branch_code, allow_mock_trade, allow_token_deposit, telegram_id')
    .eq('id', id)
    .single()

  return NextResponse.json({ profile })
}

// 비밀번호 변경
export async function PATCH(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { userId } = auth

  const body = await req.json()
  const { newPassword, currentPassword } = body

  if (!newPassword || newPassword.length < 4) {
    return NextResponse.json({ error: '비밀번호는 4자 이상이어야 합니다.' }, { status: 400 })
  }

  // 현재 비밀번호 검증 — Supabase Auth signInWithPassword 사용
  if (currentPassword) {
    const { data: userData } = await adminSupabase.auth.admin.getUserById(userId)
    const email = userData?.user?.email
    if (!email) return NextResponse.json({ error: "사용자 정보를 찾을 수 없습니다." }, { status: 400 })

    const { error: signInError } = await getAnonClient().auth.signInWithPassword({ email, password: currentPassword })
    if (signInError) return NextResponse.json({ error: "현재 비밀번호가 일치하지 않습니다." }, { status: 400 })
  }

  const { error } = await adminSupabase.auth.admin.updateUserById(userId, { password: newPassword })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
