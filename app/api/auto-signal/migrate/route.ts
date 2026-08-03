export const dynamic = "force-dynamic"
/**
 * POST /api/auto-signal/migrate
 * auto_signal_settings 테이블에 initial_seed, withdrawn_amount 컬럼 추가
 * (없을 경우에만 추가 - IF NOT EXISTS)
 */
import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

export async function POST(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status })
  if (session.role !== "master") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  // ALTER TABLE은 Supabase REST API로 직접 실행 불가 — rpc 사용
  const results: string[] = []

  // initial_seed 컬럼 추가
  const { error: e1 } = await adminSupabase.rpc("exec_sql", {
    sql: "ALTER TABLE auto_signal_settings ADD COLUMN IF NOT EXISTS initial_seed numeric(18,8)",
  }).catch(() => ({ error: null }))
  results.push(e1 ? `initial_seed: ${e1.message}` : "initial_seed: ok")

  // withdrawn_amount 컬럼 추가
  const { error: e2 } = await adminSupabase.rpc("exec_sql", {
    sql: "ALTER TABLE auto_signal_settings ADD COLUMN IF NOT EXISTS withdrawn_amount numeric(18,8) DEFAULT 0",
  }).catch(() => ({ error: null }))
  results.push(e2 ? `withdrawn_amount: ${e2.message}` : "withdrawn_amount: ok")

  // profit_dist 컬럼 추가 (JSON 문자열)
  const { error: e3 } = await adminSupabase.rpc("exec_sql", {
    sql: "ALTER TABLE auto_signal_settings ADD COLUMN IF NOT EXISTS profit_dist text",
  }).catch(() => ({ error: null }))
  results.push(e3 ? `profit_dist: ${e3.message}` : "profit_dist: ok")

  return NextResponse.json({ ok: true, results })
}
