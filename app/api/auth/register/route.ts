import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { username, password } = await req.json()

  if (!username || username.length < 2) {
    return NextResponse.json({ error: '아이디는 2자 이상이어야 합니다.' }, { status: 400 })
  }
  if (!password || password.length < 4) {
    return NextResponse.json({ error: '비밀번호는 4자 이상이어야 합니다.' }, { status: 400 })
  }

  // 아이디 중복 확인
  const { data: existing } = await adminSupabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .single()

  if (existing) {
    return NextResponse.json({ error: '이미 사용 중인 아이디입니다.' }, { status: 409 })
  }

  // 페이크 이메일로 Supabase Auth 가입 (이메일 형식만 맞으면 OK)
  const fakeEmail = `${username}@yourapp.fake`

  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email: fakeEmail,
    password,
    email_confirm: true,
    user_metadata: { username },
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  const userId = authData.user.id

  // profiles 테이블에 저장
  const { error: profileError } = await adminSupabase
    .from('profiles')
    .upsert({ id: userId, username, role: 'user' })

  if (profileError) {
    await adminSupabase.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, email: fakeEmail })
}
