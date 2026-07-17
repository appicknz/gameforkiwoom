export const dynamic = "force-dynamic"
import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { NextResponse } from 'next/server'

const ALLOWED_ROLES = ['master', 'super_admin', 'branch_admin', 'admin']

export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // 요청자의 프로필 조회
  const { data: requester } = await adminSupabase
    .from('profiles')
    .select('id, role, branch_code')
    .eq('id', auth.userId)
    .single()

  if (!requester || !ALLOWED_ROLES.includes(requester.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const filterBranchCode = searchParams.get("branch_code")
  const filterRole = searchParams.get("role")

  let query = adminSupabase
    .from("profiles")
    .select("id, username, role, created_at, branch_code, game_enabled, allow_mock_trade, allow_token_deposit, telegram_id, telegram_username, telegram_first_name, telegram_linked_at")
    .order("created_at", { ascending: false })

  // branch_admin은 자기 지점 회원만 조회 (특정 지점 필터 가능)
  if (requester.role === "branch_admin" && requester.branch_code) {
    query = query.eq("branch_code", filterBranchCode ?? requester.branch_code)
  } else if (filterBranchCode) {
    query = query.eq("branch_code", filterBranchCode)
  }

  // 역할 필터
  if (filterRole) {
    query = query.eq("role", filterRole)
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
