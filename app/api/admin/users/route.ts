import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from 'next/server'

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

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'JWT token required' }, { status: 401 })
  }

  const token = authHeader.slice(7)
  const authUser = await getUserFromToken(token)
  if (!authUser) {
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 })
  }

  // 요청자의 프로필 조회
  const { data: requester } = await adminSupabase
    .from('profiles')
    .select('id, role, branch_code')
    .eq('id', authUser.id)
    .single()

  if (!requester || !['master', 'super_admin', 'branch_admin'].includes(requester.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let query = adminSupabase
    .from("profiles")
    .select("id, username, role, created_at, branch_code")
    .order("created_at", { ascending: false })

  // branch_admin은 자기 지점 회원만 조회
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
