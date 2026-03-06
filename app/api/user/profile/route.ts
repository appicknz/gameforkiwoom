import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from 'next/server'

// access_token으로 유저 인증
async function getUserFromToken(req: Request) {
  const auth = req.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) return null
  const { data: { user } } = await adminSupabase.auth.getUser(token)
  return user ?? null
}

// 현재 로그인 유저 프로필 조회
export async function GET(req: Request) {
  const user = await getUserFromToken(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await adminSupabase
    .from('profiles')
    .select('id, username, role, created_at, branch_code')
    .eq('id', user.id)
    .single()

  return NextResponse.json({ profile })
}

// 비밀번호 변경
export async function PATCH(req: Request) {
  const user = await getUserFromToken(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { newPassword } = body

  if (!newPassword || newPassword.length < 4) {
    return NextResponse.json({ error: '비밀번호는 4자 이상이어야 합니다.' }, { status: 400 })
  }

  const { error } = await adminSupabase.auth.admin.updateUserById(user.id, {
    password: newPassword,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
