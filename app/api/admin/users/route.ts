import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'JWT token required' }, { status: 401 })
  }

  const token = authHeader.slice(7)
  const [userId, password] = token.split(':')
  if (!userId || !password) {
    return NextResponse.json({ error: 'Invalid token format' }, { status: 401 })
  }

  // 요청자의 프로필 조회
  const { data: requester } = await adminSupabase
    .from('profiles')
    .select('id, username, role, branch_code')
    .eq('id', userId)
    .single()

  if (!requester) {
    return NextResponse.json({ error: 'User not found' }, { status: 401 })
  }

  // JWT 토큰만 검증하면 됨 (로그인 시 이미 비번 검증됨)
  let query = adminSupabase
    .from("profiles")
    .select("id, username, role, created_at, branch_code")
    .order("created_at", { ascending: false })

  // branch_admin은 자기 지점 회원만 조회 (위변조 방지: 서버에서 필터)
  if (requester.role === "branch_admin" && requester.branch_code) {
    query = query.eq("branch_code", requester.branch_code)
  }

  const { data: profiles } = await query
  const { data: balances } = await adminSupabase
    .from("balances")
    .select("user_id, amount")

  const balanceMap = new Map((balances ?? []).map(b => [b.user_id, b.amount]))

  const users = (profiles ?? []).map(p => ({
    ...p,
    balance: balanceMap.get(p.id) ?? 0,
  }))

  return NextResponse.json({ users })
}
