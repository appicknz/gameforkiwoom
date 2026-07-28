-- daily_snapshots: 매일 자정(KST 00:00) 또는 반영 버튼 클릭 시
-- 그 시점의 자동매매 요약 수치를 고정 저장.
-- 과거 날짜 클릭 시 이 값을 그대로 표시함.

CREATE TABLE IF NOT EXISTS daily_snapshots (
  id            BIGSERIAL PRIMARY KEY,
  date_label    TEXT NOT NULL UNIQUE,       -- "2026-07-28" (KST 기준)
  close_type    TEXT NOT NULL DEFAULT 'day_close',  -- 'day_close' | 'confirmed_by_master'
  snapped_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 요약 수치 (화면에 표시되는 그대로 저장)
  margin        NUMERIC(14,4) NOT NULL,     -- 시작 잔고(확정 잔고)
  est_value     NUMERIC(14,4) NOT NULL,     -- MARGIN + TOTAL PNL
  total_pnl     NUMERIC(14,4) NOT NULL,     -- 당일 전체 PNL
  total_roi     NUMERIC(10,4) NOT NULL,     -- 평균 ROI (%)
  sl_pnl        NUMERIC(14,4) NOT NULL DEFAULT 0,   -- SL 청산 합산 PNL
  sl_count      INT           NOT NULL DEFAULT 0,   -- SL 청산 건수

  -- 건수
  position_count INT          NOT NULL DEFAULT 0,   -- 전체 포지션 수
  profit_count   INT          NOT NULL DEFAULT 0,   -- 수익 건수
  loss_count     INT          NOT NULL DEFAULT 0,   -- 손실 건수
  liq_count      INT          NOT NULL DEFAULT 0    -- 청산(stop_loss) 건수
);

CREATE INDEX IF NOT EXISTS idx_daily_snapshots_date ON daily_snapshots(date_label DESC);
