import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from 'next/server'

const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? ''

export async function POST(req: Request) {
  const { pw, userId, amount } = await req.json()

  if (pw !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!userId || typeof amount !== 'number') {
    return NextResponse.json({ error: 'userId와 amount가 필요합니다.' }, { status: 400 })
  }

  // 기존 잔고 조회
  const { data: existing } = await adminSupabase
    .from('balances')
    .select('amount')
    .eq('user_id', userId)
    .single()

  if (existing) {
    // 잔고 업데이트 (기존 잔고 + 충전액)
    const { error } = await adminSupabase
      .from('balances')
      .update({ amount: existing.amount + amount })
      .eq('user_id', userId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    // 잔고 레코드 신규 생성
    const { error } = await adminSupabase
      .from('balances')
      .insert({ user_id: userId, amount })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
