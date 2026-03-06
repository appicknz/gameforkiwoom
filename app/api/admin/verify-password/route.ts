import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export async function POST(req: Request) {
  const { username, password } = await req.json()

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password required' }, { status: 400 })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  // 비밀번호 검증 (실제 로그인 시도)
  const { data, error } = await supabase.auth.signInWithPassword({
    email: `${username}@tasko.app`,
    password,
  })

  if (error || !data.user) {
    return NextResponse.json({ error: '비밀번호가 올바르지 않습니다.' }, { status: 401 })
  }

  return NextResponse.json({ success: true, user: data.user })
}
