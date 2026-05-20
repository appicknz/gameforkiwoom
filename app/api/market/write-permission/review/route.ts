export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

// GET /api/market/write-permission/review — 전체 신청 목록 (마스터 전용)
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "인증 필요" }, { status: 401 })

  const { data: me } = await adminSupabase
    .from("profiles")
    .select("role")
    .eq("id", auth.userId)
    .single()

  if (me?.role !== "master") return NextResponse.json({ error: "권한 없음" }, { status: 403 })

  const url    = new URL(req.url)
  const status = url.searchParams.get("status") ?? "pending"  // pending | approved | rejected | all

  let query = adminSupabase
    .from("write_permission_requests" as never)
    .select(`
      id, status, reason, created_at, reviewed_at, allow_point_category,
      profiles!write_permission_requests_user_id_fkey(id, username, role)
    `)
    .order("created_at", { ascending: true })

  if (status !== "all") {
    query = (query as ReturnType<typeof query.eq>).eq("status", status)
  }

  const { data, error } = await query as { data: unknown[]; error: unknown }
  if (error) return NextResponse.json({ error: "조회 실패" }, { status: 500 })

  return NextResponse.json({ requests: data ?? [] })
}

// PATCH /api/market/write-permission/review — 승인 / 거절
export async function PATCH(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "인증 필요" }, { status: 401 })

  const { data: me } = await adminSupabase
    .from("profiles")
    .select("role")
    .eq("id", auth.userId)
    .single()

  if (me?.role !== "master") return NextResponse.json({ error: "권한 없음" }, { status: 403 })

  const { requestId, action, allowPointCategory } = await req.json()
  if (!requestId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "잘못된 요청" }, { status: 400 })
  }

  const newStatus = action === "approve" ? "approved" : "rejected"

  // 신청 상태 업데이트 (승인 시 allow_point_category 함께 저장)
  const { data: updated, error } = await adminSupabase
    .from("write_permission_requests" as never)
    .update({
      status:               newStatus,
      reviewed_by:          auth.userId,
      reviewed_at:          new Date().toISOString(),
      ...(action === "approve" ? { allow_point_category: !!allowPointCategory } : {}),
    })
    .eq("id", requestId)
    .select("user_id")
    .single() as { data: { user_id: string } | null; error: unknown }

  if (error || !updated) return NextResponse.json({ error: "처리 실패" }, { status: 500 })

  // 승인 시 profiles.role을 'seller'로 설정 (마켓 판매 전용 역할)
  if (action === "approve") {
    const { data: targetProfile } = await adminSupabase
      .from("profiles")
      .select("role")
      .eq("id", updated.user_id)
      .single()

    // user/member 등 기본 역할만 seller로 변경 (admin 이상은 건드리지 않음)
    const LOW_ROLES = ["user", "member", null, undefined, ""]
    if (LOW_ROLES.includes(targetProfile?.role)) {
      await adminSupabase
        .from("profiles")
        .update({ role: "seller" })
        .eq("id", updated.user_id)
    }
  }

  return NextResponse.json({ ok: true, status: newStatus })
}
