-- round_bet_logs: 라운드별 전체 배팅 현황 스냅샷
-- Supabase 대시보드 SQL Editor에서 실행하세요.

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
