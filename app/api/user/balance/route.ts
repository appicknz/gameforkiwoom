import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(request: Request) {
  // Authorization: Bearer <access_token> 헤더에서 토큰 추출
  const auth = request.headers.get('authorization')
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null

  if (!token) {
    return NextResponse.json({ balance: 0, error: 'Not authenticated' }, { status: 401 })
  }

  // access_token으로 유저 확인 (service role로 검증)
  const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token)
  if (userError || !user) {
    return NextResponse.json({ balance: 0, error: 'Invalid token' }, { status: 401 })
  }

  const { data: balance } = await adminSupabase
    .from('balances')
    .select('amount')
    .eq('user_id', user.id)
    .single()

  return NextResponse.json({ balance: balance?.amount ?? 0 })
}
