export const dynamic = "force-dynamic"
export const runtime = "nodejs"

import { adminSupabase as admin } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

// GET — 최근 전송 로그 조회
export async function GET(req: Request) {
  const session = await verifySession(req)
  if (!session.ok || !["master", "admin"].includes(session.role ?? "")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any)
    .from("telegram_send_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) {
    // 테이블 없으면 빈 배열 + 안내
    return NextResponse.json({ logs: [], tableExists: false })
  }

  return NextResponse.json({ logs: data ?? [], tableExists: true })
}

// POST — 테이블 초기화 (master 전용)
export async function POST(req: Request) {
  const session = await verifySession(req)
  if (!session.ok || session.role !== "master") {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { action } = await req.json().catch(() => ({ action: "" }))

  if (action === "setup") {
    // Supabase REST로 직접 테이블 생성 불가 — SQL 반환
    const sql = `CREATE TABLE IF NOT EXISTS telegram_send_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ DEFAULT now(),
  round_number BIGINT NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('betting_button','result')),
  ok           BOOL NOT NULL DEFAULT false,
  tg_message_id INT,
  error_msg    TEXT,
  payload      JSONB
);
CREATE INDEX IF NOT EXISTS idx_tg_send_logs_round ON telegram_send_logs(round_number DESC);`
    return NextResponse.json({ sql })
  }

  if (action === "clear") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any).from("telegram_send_logs").delete().lt("created_at", new Date(Date.now() - 7 * 86400000).toISOString())
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 })
}
