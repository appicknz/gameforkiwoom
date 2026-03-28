-- race_results 테이블: 5분 레이스 라운드 결과 저장
-- 누구든 어디서든 접속해도 동일한 결과를 볼 수 있도록 DB에 영구 저장

CREATE TABLE IF NOT EXISTS race_results (
  id          BIGSERIAL PRIMARY KEY,
  time        BIGINT      NOT NULL UNIQUE,  -- 라운드 종료 Unix timestamp
  price       NUMERIC     NOT NULL,          -- 5분 마감 기준가
  bit_score   INTEGER     NOT NULL DEFAULT 0, -- BIT팀 라운드 누적 스코어
  coin_score  INTEGER     NOT NULL DEFAULT 0, -- COIN팀 라운드 누적 스코어
  winner      TEXT        NOT NULL CHECK (winner IN ('bit', 'coin', 'tie')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS race_results_time_idx ON race_results (time DESC);
