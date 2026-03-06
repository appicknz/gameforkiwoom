import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  try {
    // 쿠키에서 세션 가져오기
    const cookieStore = await cookies()
    const sessionCookie = cookieStore.get(`sb-${process.env.NEXT_PUBLIC_SUPABASE_URL?.split('.')[0]}-auth-token`)?.value

    if (!sessionCookie) {
      return NextResponse.json({ balance: 0, error: 'Not authenticated' }, { status: 401 })
    }

    // 세션 쿠키 파싱 (JSON 형식)
    let session
    try {
      session = JSON.parse(sessionCookie)
    } catch {
      return NextResponse.json({ balance: 0, error: 'Invalid session' }, { status: 401 })
    }

    const userId = session?.[0]?.user?.id
    if (!userId) {
      return NextResponse.json({ balance: 0, error: 'No user ID' }, { status: 401 })
    }

    // balances 테이블에서 조회
    const { data: balance, error } = await supabase
      .from('balances')
      .select('amount')
      .eq('user_id', userId)
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
