export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

// 최초 1회 테이블 자동 생성 (없을 경우 대비)
async function ensureTable() {
  await adminSupabase.rpc("exec_sql" as never, {
    sql: `
      CREATE TABLE IF NOT EXISTS write_permission_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
        reason text,
        status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
        reviewed_by uuid REFERENCES profiles(id),
        reviewed_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_wpr_user ON write_permission_requests(user_id);
      CREATE INDEX IF NOT EXISTS idx_wpr_status ON write_permission_requests(status);
    `,
  } as never).catch(() => {})
}

// POST /api/market/write-permission — 글쓰기 권한 신청
export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "인증 필요" }, { status: 401 })

  await ensureTable()

  const { reason } = await req.json().catch(() => ({}))

  // 이미 pending/approved 신청이 있는지 확인
  const { data: existing } = await adminSupabase
    .from("write_permission_requests" as never)
    .select("id, status")
    .eq("user_id", auth.userId)
    .in("status", ["pending", "approved"])
    .maybeSingle() as { data: { id: string; status: string } | null }

  if (existing?.status === "approved") {
    return NextResponse.json({ error: "이미 글쓰기 권한이 있습니다." }, { status: 409 })
  }
  if (existing?.status === "pending") {
    return NextResponse.json({ error: "이미 신청 중입니다. 마스터 승인을 기다려주세요." }, { status: 409 })
  }

  const { data, error } = await adminSupabase
    .from("write_permission_requests" as never)
    .insert({ user_id: auth.userId, reason: reason ?? null })
    .select("id, status, created_at")
    .single() as { data: unknown; error: unknown }

  if (error) return NextResponse.json({ error: "신청 실패" }, { status: 500 })
  return NextResponse.json({ ok: true, request: data })
}

// GET /api/market/write-permission — 내 신청 상태 확인
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ request: null })

  await ensureTable()

  const { data } = await adminSupabase
    .from("write_permission_requests" as never)
    .select("id, status, reason, created_at, reviewed_at")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as { data: unknown }

  return NextResponse.json({ request: data ?? null })
}
