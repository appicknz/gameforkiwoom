export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

// POST /api/admin/migrate-seller-roles
// write_permission_requests에서 approved인데 role이 아직 user인 계정을 seller로 일괄 업데이트
export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "인증 필요" }, { status: 401 })

  const { data: me } = await adminSupabase
    .from("profiles").select("role").eq("id", auth.userId).single()
  if (me?.role !== "master") return NextResponse.json({ error: "권한 없음" }, { status: 403 })

  // approved 신청의 user_id 목록 조회
  const { data: approved } = await adminSupabase
    .from("write_permission_requests" as never)
    .select("user_id")
    .eq("status", "approved") as { data: { user_id: string }[] | null }

  if (!approved?.length) return NextResponse.json({ ok: true, updated: 0 })

  const userIds = approved.map(r => r.user_id)

  // 해당 유저 중 role이 user인 것만 seller로 변경
  const { data: updated, error } = await adminSupabase
    .from("profiles")
    .update({ role: "seller" })
    .in("id", userIds)
    .in("role", ["user", "member"])
    .select("id, username, role")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, updated: updated?.length ?? 0, users: updated })
}
