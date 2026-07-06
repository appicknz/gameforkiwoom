import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const adminSupabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST() {
  try {
    // round_bet_logs 테이블 생성
    const { error } = await adminSupabase.rpc("exec_sql", {
      sql: `
        CREATE TABLE IF NOT EXISTS round_bet_logs (
          id              bigserial PRIMARY KEY,
          game_type       text NOT NULL,
          round_number    bigint NOT NULL,
          round_started_at timestamptz NOT NULL,
          round_ended_at  timestamptz NOT NULL,
          total_users     int NOT NULL DEFAULT 0,
          total_amount    bigint NOT NULL DEFAULT 0,
          total_fee       bigint NOT NULL DEFAULT 0,
          winner          text,
          bets            jsonb NOT NULL DEFAULT '[]',
          created_at      timestamptz NOT NULL DEFAULT now(),
          UNIQUE(game_type, round_number)
        );
        CREATE INDEX IF NOT EXISTS idx_round_bet_logs_created ON round_bet_logs(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_round_bet_logs_game_round ON round_bet_logs(game_type, round_number);
      `
    })
    if (error) {
      // exec_sql RPC 없을 수 있음 — 직접 insert로 테이블 존재 여부 확인
      return NextResponse.json({ ok: false, error: error.message })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  }
}
