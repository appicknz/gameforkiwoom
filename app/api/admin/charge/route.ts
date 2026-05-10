import { redis } from "@/lib/redis"
import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { getUserIdFromToken } from "@/lib/auth"
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'JWT token required' }, { status: 401 })
  }

  const token = authHeader.slice(7)
  const userId = await getUserIdFromToken(token)
  if (!userId) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })

  const { data: requester } = await adminSupabase
    .from('profiles')
    .select('id, role, branch_code')
    .eq('id', userId)
    .single()

  if (!requester || !['master', 'super_admin', 'branch_admin'].includes(requester.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { userId: targetUserId, amount } = await req.json()

  if (!targetUserId || typeof amount !== 'number') {
    return NextResponse.json({ error: 'userId와 amount가 필요합니다.' }, { status: 400 })
  }

  // branch_admin은 자신의 지점 회원만 충전/차감 가능
  if (requester.role === 'branch_admin') {
    const { data: targetUser } = await adminSupabase
      .from('profiles')
      .select('branch_code')
      .eq('id', targetUserId)
      .single()

    if (!targetUser || targetUser.branch_code !== requester.branch_code) {
      return NextResponse.json({ error: '자신의 지점 회원만 충전/차감할 수 있습니다.' }, { status: 403 })
    }
  }

  const { data: existing } = await adminSupabase
    .from('balances')
    .select('amount')
    .eq('user_id', targetUserId)
    .single()

  const newBalance = existing ? existing.amount + amount : amount

  if (existing) {
    const { error } = await adminSupabase
      .from('balances')
      .update({ amount: newBalance })
      .eq('user_id', targetUserId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await adminSupabase
      .from('balances')
      .insert({ user_id: targetUserId, amount: newBalance })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await Promise.all([
    redis.set(`balance:${targetUserId}`, newBalance, { ex: 3600 }),
    redis.incr(`balance_version:${targetUserId}`),
  ])

  return NextResponse.json({ success: true, newBalance })
}
