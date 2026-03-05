import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // 현재 로그인한 사용자 정보 얻기 (Authorization 헤더에서)
    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      // 클라이언트 쪽에서 직접 호출하면 session이 없으므로, anon key로 현재 사용자 조회
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session?.user) {
        return NextResponse.json({ balance: 0, error: 'Not authenticated' }, { status: 401 })
      }

      const { data: balance, error } = await supabase
        .from('balances')
        .select('amount')
        .eq('user_id', session.user.id)
        .single()

      if (error) {
        return NextResponse.json({ balance: 0 }, { status: 200 })
      }

      return NextResponse.json({ balance: balance?.amount ?? 0 })
    }

    // Bearer token에서 사용자 ID 추출
    const token = authHeader.substring(7)
    const { data: { user }, error: userError } = await supabase.auth.getUser(token)

    if (userError || !user) {
      return NextResponse.json({ balance: 0, error: 'Invalid token' }, { status: 401 })
    }

    const { data: balance, error } = await supabase
      .from('balances')
      .select('amount')
      .eq('user_id', user.id)
      .single()

    if (error) {
      return NextResponse.json({ balance: 0 }, { status: 200 })
    }

    return NextResponse.json({ balance: balance?.amount ?? 0 })
  } catch (error) {
    console.error('[v0] Balance fetch error:', error)
    return NextResponse.json({ balance: 0, error: 'Failed to fetch balance' }, { status: 500 })
  }
}
