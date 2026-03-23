-- btc_closing_prices 테이블: 30초 마감 기준가 저장
CREATE TABLE IF NOT EXISTS btc_closing_prices (
  id         BIGSERIAL PRIMARY KEY,
  time       BIGINT NOT NULL UNIQUE,   -- Unix timestamp (30초 단위)
  price      NUMERIC(16, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_btc_closing_prices_time ON btc_closing_prices (time DESC);
