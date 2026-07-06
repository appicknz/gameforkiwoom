/**
 * POST /api/admin/setup-db
 * round_bet_logs 테이블 자동 생성 (Supabase SQL HTTP API 사용)
 * 패널 또는 배포 후 최초 1회 실행
 */
import { NextResponse } from "next/server"

export async function POST() {
  try {
    const supabaseUrl   = process.env.SUPABASE_URL!
    const serviceKey    = process.env.SUPABASE_SERVICE_ROLE_KEY!
    const projectRef    = supabaseUrl.replace("https://", "").split(".")[0]

    // Supabase SQL API (v1 projects endpoint)
    const ddl = `
      create table if not exists round_bet_logs (
        id              bigserial primary key,
        game_type       text not null,
        round_number    bigint not null,
        round_started_at timestamptz not null,
        round_ended_at  timestamptz not null,
        total_users     int not null default 0,
        total_amount    bigint not null default 0,
        total_fee       bigint not null default 0,
        winner          text,
        bets            jsonb not null default '[]',
        created_at      timestamptz not null default now(),
        unique(game_type, round_number)
      );
      create index if not exists idx_rbl_created  on round_bet_logs(created_at desc);
      create index if not exists idx_rbl_game     on round_bet_logs(game_type, round_number);
      create index if not exists idx_rbl_date     on round_bet_logs(date_trunc('day', created_at at time zone 'Asia/Seoul'));
    `

    const res = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method:  "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ query: ddl }),
      }
    )

    const body = await res.text()

    if (!res.ok) {
      // Management API 실패 시 → Supabase SDK upsert로 존재 여부만 확인
      // (서비스 키로 Management API 호출 불가 → 수동 생성 안내)
      return NextResponse.json({
        ok: false,
        status: res.status,
        message: "Management API 인증 실패. Supabase 대시보드 SQL Editor에서 아래 DDL을 직접 실행해 주세요.",
        ddl,
        raw: body.slice(0, 300),
      })
    }

    return NextResponse.json({ ok: true, message: "round_bet_logs 테이블 생성 완료" })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}
