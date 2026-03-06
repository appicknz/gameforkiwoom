import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// 서버 전용 admin client (SERVICE_ROLE_KEY 사용)
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: Request) {
  const { username, password } = await req.json()

  if (!username || !password) {
    return NextResponse.json({ error: '아이디와 비밀번호를 입력해주세요.' }, { status: 400 })
  }

  // 1) profiles에서 user_id 조회
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, username, role')
    .eq('username', username)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
  }

  // 2) auth.users에서 이메일 조회
  const { data: userData, error: userError } = await admin.auth.admin.getUserById(profile.id)
  if (userError || !userData.user?.email) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
  }

  // 3) 서버에서 직접 signInWithPassword → access_token 반환
  //    클라이언트에서 supabase.auth.signInWithPassword() 호출 불필요
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const { data: signIn, error: signInError } = await anonClient.auth.signInWithPassword({
    email: userData.user.email,
    password,
  })

  if (signInError || !signIn.session) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
  }

  return NextResponse.json({
    token: signIn.session.access_token,
    username: profile.username,
    role: (profile as any).role ?? 'user',
  })
}
