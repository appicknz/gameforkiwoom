import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'

const admin = createClient(
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
  const { data: existing } = await admin
    .from('profiles')
    .select('id')
    .eq('username', username)
    .single()

  if (existing) {
    return NextResponse.json({ error: '이미 사용 중인 아이디입니다.' }, { status: 409 })
  }

  // Supabase Auth 유저 생성
  const uid = randomUUID()
  const email = `${uid}@noreply.app`
  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  })

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  const userId = authData.user.id

  // profiles 저장
  const { error: profileError } = await admin
    .from('profiles')
    .upsert({ id: userId, username, role: 'user' })

  if (profileError) {
    await admin.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  // 가입 직후 서버에서 로그인해 토큰 반환 (클라이언트에서 signInWithPassword 불필요)
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: signIn, error: signInError } = await anonClient.auth.signInWithPassword({
    email,
    password,
  })

  if (signInError || !signIn.session) {
    // 토큰 발급 실패해도 가입은 성공 - 클라이언트에서 로그인 유도
    return NextResponse.json({ success: true, username, needsLogin: true })
  }

  return NextResponse.json({
    token: signIn.session.access_token,
    username,
    role: 'user',
  })
}
