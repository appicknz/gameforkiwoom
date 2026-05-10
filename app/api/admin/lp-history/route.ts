import { adminSupabase } from "@/lib/supabase-admin"
import { getUserIdFromToken } from "@/lib/auth"
import { NextResponse } from "next/server"

// GET /api/admin/lp-history?branchId=xxx&limit=50
export async function GET(req: Request) {
  const token = req.headers.get("authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = await getUserIdFromToken(token)
  if (!userId) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

  // 권한 확인
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("role, branch_id")
    .eq("id", userId)
    .single()

  if (!profile || !["master", "super_admin", "branch_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const branchId = searchParams.get("branchId") ?? profile.branch_id
  const limit = parseInt(searchParams.get("limit") ?? "50")

  // branch_admin은 자신 지점만 조회
  const targetBranchId = profile.role === "branch_admin" ? profile.branch_id : branchId

  let query = adminSupabase
    .from("lp_transactions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit)

  // targetBranchId가 null이면 전체 조회 (master/super_admin 파라미터 없는 경우)
  if (targetBranchId != null) {
    query = query.eq("branch_id", targetBranchId)
  }

  const { data, error } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 요약 통계
  const totalLpUsed = (data ?? []).reduce((s, r) => s + (r.lp_amount ?? 0), 0)

  return NextResponse.json({ history: data ?? [], totalLpUsed })
}
