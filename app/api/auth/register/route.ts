import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

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

  // Supabase Auth 유저 생성
  // 이메일 검증 우회: uuid@noreply.app 형식 사용 후 phone_confirmed 처리
  const uid = randomUUID()
  const email = `${uid}@noreply.app`
  const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
    email,
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
    .upsert({
      id: userId,
      username,
      role: 'user',
    })

  if (profileError) {
    // 롤백: auth 유저 삭제
    await adminSupabase.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  // magic link 토큰 발급 (가입 직후 자동 로그인용)
  const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
    type: 'magiclink',
    email,
  })

  if (linkError || !linkData) {
    // 토큰 발급 실패해도 가입은 성공 처리
    return NextResponse.json({ success: true, token_hash: null })
  }

  return NextResponse.json({
    success: true,
    username,
    token_hash: linkData.properties?.hashed_token,
  })
}
