export const dynamic = "force-dynamic"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { NextResponse } from 'next/server'

// 현재 로그인 유저 프로필 조회
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { userId: id } = auth

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('id, username, role, created_at, branch_code, allow_mock_trade, allow_token_deposit')
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
  const { newPassword } = body

  if (!newPassword || newPassword.length < 4) {
    return NextResponse.json({ error: '비밀번호는 4자 이상이어야 합니다.' }, { status: 400 })
  }

  const { error } = await adminSupabase.auth.admin.updateUserById(userId, {
    password: newPassword,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
