import { redis } from "@/lib/redis"
import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from 'next/server'

})

// 토큰으로 user 검증하는 헬퍼
async function getUserFromToken(token: string) {
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data, error } = await anonClient.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'JWT token required' }, { status: 401 })
  }

  const token = authHeader.slice(7)
  const authUser = await getUserFromToken(token)
  if (!authUser) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })

  const { data: requester } = await adminSupabase
    .from('profiles')
    .select('id, role, branch_code')
    .eq('id', authUser.id)
    .single()

  if (!requester || !['master', 'super_admin', 'branch_admin'].includes(requester.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { userId, amount } = await req.json()

  if (!userId || typeof amount !== 'number') {
    return NextResponse.json({ error: 'userId와 amount가 필요합니다.' }, { status: 400 })
  }

  // branch_admin은 자신의 지점 회원만 충전/차감 가능
  if (requester.role === 'branch_admin') {
    const { data: targetUser } = await adminSupabase
      .from('profiles')
      .select('branch_code')
      .eq('id', userId)
      .single()

    if (!targetUser || targetUser.branch_code !== requester.branch_code) {
      return NextResponse.json({ error: '자신의 지점 회원만 충전/차감할 수 있습니다.' }, { status: 403 })
    }
  }

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

  await Promise.all([
    redis.set(`balance:${userId}`, newBalance, { ex: 3600 }),
    redis.incr(`balance_version:${userId}`),
  ])

  return NextResponse.json({ success: true, newBalance })
}
