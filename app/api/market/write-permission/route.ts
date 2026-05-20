export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

// POST /api/market/write-permission — 글쓰기 권한 신청
export async function POST(req: Request) {
  try {
    const auth = await verifySession(req)
    if (!auth.ok) return NextResponse.json({ error: "인증 필요" }, { status: 401 })

    const { reason } = await req.json().catch(() => ({}))

    // 이미 pending/approved 신청이 있는지 확인
    const { data: existing, error: fetchErr } = await adminSupabase
      .from("write_permission_requests" as never)
      .select("id, status")
      .eq("user_id", auth.userId)
      .in("status", ["pending", "approved"])
      .maybeSingle() as { data: { id: string; status: string } | null; error: unknown }

    if (fetchErr) {
      return NextResponse.json({ error: "조회 실패" }, { status: 500 })
    }

    if ((existing as any)?.status === "approved") {
      return NextResponse.json({ error: "이미 글쓰기 권한이 있습니다." }, { status: 409 })
    }
    if ((existing as any)?.status === "pending") {
      return NextResponse.json({ error: "이미 신청 중입니다. 마스터 승인을 기다려주세요." }, { status: 409 })
    }

    const { data, error } = await adminSupabase
      .from("write_permission_requests" as never)
      .insert({ user_id: auth.userId, reason: reason ?? null })
      .select("id, status, created_at")
      .single() as { data: unknown; error: unknown }

    if (error) {
      return NextResponse.json({ error: "신청 실패" }, { status: 500 })
    }
    return NextResponse.json({ ok: true, request: data })
  } catch {
    return NextResponse.json({ error: "서버 오류" }, { status: 500 })
  }
}

// GET /api/market/write-permission — 내 신청 상태 확인
export async function GET(req: Request) {
  try {
    const auth = await verifySession(req)
    if (!auth.ok) return NextResponse.json({ request: null })

    const { data, error } = await adminSupabase
      .from("write_permission_requests" as never)
      .select("id, status, reason, created_at, reviewed_at, allow_point_category")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle() as { data: unknown; error: unknown }

    if (error) {
      return NextResponse.json({ request: null })
    }

    return NextResponse.json({ request: data ?? null })
  } catch {
    return NextResponse.json({ request: null })
  }
}
