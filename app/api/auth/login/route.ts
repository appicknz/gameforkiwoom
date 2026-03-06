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

  // profiles 테이블에서 username으로 user_id 조회
  const { data: profile, error: profileError } = await adminSupabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
  }

  // admin으로 직접 세션 토큰 생성 (Email 프로바이더 우회)
  const { data: sessionData, error: sessionError } = await adminSupabase.auth.admin.generateLink({
    type: 'magiclink',
    email: `${profile.id}@noreply.internal`,
  })

  // magiclink 대신 signInWithPassword를 admin Supabase로 시뮬레이션:
  // getUserById로 이메일 조회 후, 별도 검증 없이 access_token 직접 발급
  const { data: userData, error: userError } = await adminSupabase.auth.admin.getUserById(profile.id)
  if (userError || !userData?.user) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
  }

  // 비밀번호 검증: 이메일+비밀번호로 signInWithPassword (service role은 provider 제약 없음)
  const anonSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const { data: signInData, error: signInError } = await anonSupabase.auth.signInWithPassword({
    email: userData.user.email!,
    password,
  })

  if (signInError) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
  }

  return NextResponse.json({
    access_token: signInData.session!.access_token,
    refresh_token: signInData.session!.refresh_token,
  })
}
