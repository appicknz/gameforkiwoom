import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from 'next/server'

const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? ''

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const pw = searchParams.get("pw")
  const branchCode = searchParams.get("branch_code") // branch_admin이 자기 지점 회원만 조회

  if (pw !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  let query = adminSupabase
    .from("profiles")
    .select("id, username, role, created_at, branch_code")
    .order("created_at", { ascending: false })

  // branch_admin은 자기 지점 회원만 조회 (위변조 방지: 서버에서 필터)
  if (branchCode) {
    query = query.eq("branch_code", branchCode)
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
