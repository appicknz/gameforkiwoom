import { adminSupabase } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"
import { NextResponse } from 'next/server'

const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? ''

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

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

  const newBalance = existing ? existing.amount + amount : amount

  if (existing) {
    const { error } = await adminSupabase
      .from('balances')
      .update({ amount: newBalance })
      .eq('user_id', userId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await adminSupabase
      .from('balances')
      .insert({ user_id: userId, amount: newBalance })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Redis 갱신 → SSE 스트림이 변경 감지해 클라이언트에 즉시 push
  await Promise.all([
    redis.set(`balance:${userId}`, newBalance, { ex: 3600 }),
    redis.incr(`balance_version:${userId}`),
  ])

  return NextResponse.json({ success: true, newBalance })
}
