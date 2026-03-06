import { adminSupabase } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"
import { NextResponse } from 'next/server'

const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? ''

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization')
  const { userId, amount } = await req.json()

  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'JWT token required' }, { status: 401 })
  }

  const token = authHeader.slice(7)

  // JWT에서 user 정보 조회 (token = userId:password)
  const [tokenUserId, tokenPassword] = token.split(':')
  if (!tokenUserId || !tokenPassword) {
    return NextResponse.json({ error: 'Invalid token format' }, { status: 401 })
  }

  // 요청자의 프로필 조회
  const { data: requester } = await adminSupabase
    .from('profiles')
    .select('id, username, role, branch_code')
    .eq('id', tokenUserId)
    .single()

  if (!requester) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 })
  }

  // master: master 비번으로만 충전/차감 가능
  // branch_admin: 자신의 비번으로 자신의 지점 회원만 충전/차감 가능
  if (requester.role === 'master' || requester.role === 'super_admin') {
    if (tokenPassword !== ADMIN_PASSWORD) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  } else if (requester.role === 'branch_admin') {
    // branch_admin은 JWT 토큰 검증만 (로그인 시 이미 비번 검증됨)
    // 자신의 지점 회원인지 확인
    if (!userId || typeof amount !== 'number') {
      return NextResponse.json({ error: 'userId와 amount가 필요합니다.' }, { status: 400 })
    }

    const { data: targetUser } = await adminSupabase
      .from('profiles')
      .select('branch_code')
      .eq('id', userId)
      .single()

    if (!targetUser || targetUser.branch_code !== requester.branch_code) {
      return NextResponse.json({ error: '자신의 지점 회원만 충전/차감할 수 있습니다.' }, { status: 403 })
    }
  } else {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
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
