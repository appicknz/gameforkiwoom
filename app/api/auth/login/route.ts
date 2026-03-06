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

  // 1. profiles 테이블에서 username → user_id 조회
  const { data: profile, error: profileError } = await adminSupabase
    .from('profiles')
    .select('id')
    .eq('username', username)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
  }

  // 2. pgcrypto로 bcrypt 비밀번호 검증 (Email 프로바이더 우회)
  const { data: isValid, error: rpcError } = await adminSupabase
    .rpc('verify_user_password', {
      user_id: profile.id,
      plain_password: password,
    })

  if (rpcError || !isValid) {
    return NextResponse.json({ error: '아이디 또는 비밀번호가 올바르지 않습니다.' }, { status: 401 })
  }

  // 3. 유저 이메일 조회
  const { data: userData } = await adminSupabase.auth.admin.getUserById(profile.id)
  if (!userData?.user?.email) {
    return NextResponse.json({ error: '사용자 정보를 찾을 수 없습니다.' }, { status: 500 })
  }

  // 4. magic link 토큰 발급 (Email 프로바이더 없이 세션 생성)
  const { data: linkData, error: linkError } = await adminSupabase.auth.admin.generateLink({
    type: 'magiclink',
    email: userData.user.email,
  })

  if (linkError || !linkData) {
    return NextResponse.json({ error: '세션 생성에 실패했습니다.' }, { status: 500 })
  }

  return NextResponse.json({
    token_hash: linkData.properties?.hashed_token,
  })
}
