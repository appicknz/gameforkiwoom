import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { username, password } = await req.json()

  if (!username || !password) {
    return NextResponse.json({ error: '아이디와 비밀번호를 입력해주세요.' }, { status: 400 })
  }

  // profiles에서 username → id 조회
  const { data: profile, error: profileError } = await adminSupabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
  }

  // user id로 이메일 조회
  const { data: userData } = await adminSupabase.auth.admin.getUserById(profile.id)
  if (!userData?.user?.email) {
    return NextResponse.json({ error: '사용자 정보를 찾을 수 없습니다.' }, { status: 500 })
  }

  // 이메일을 클라이언트로 전달 (클라이언트에서 signInWithPassword 호출)
  return NextResponse.json({ email: userData.user.email })
}
