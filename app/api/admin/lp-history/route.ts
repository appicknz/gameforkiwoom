import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

// GET /api/admin/lp-history?branchId=xxx&limit=50
export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(token)
  if (authErr || !user) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

  // 권한 확인
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("role, branch_id")
    .eq("id", user.id)
    .single()

  if (!profile || !["master", "super_admin", "branch_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const branchId = searchParams.get("branchId") ?? profile.branch_id
  const limit = parseInt(searchParams.get("limit") ?? "50")

  // branch_admin은 자신 지점만 조회
  const targetBranchId = profile.role === "branch_admin" ? profile.branch_id : branchId

  const { data, error } = await adminSupabase
    .from("lp_transactions")
    .select("*")
    .eq("branch_id", targetBranchId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 요약 통계
  const totalLpUsed = (data ?? []).reduce((s, r) => s + (r.lp_amount ?? 0), 0)

  return NextResponse.json({ history: data ?? [], totalLpUsed })
}
