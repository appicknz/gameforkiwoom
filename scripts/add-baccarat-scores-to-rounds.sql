-- rounds 테이블에 카드 합산 끝자리 점수 컬럼 추가
-- b_score: 뱅커 카드 합산 끝자리 (0~9)
-- p_score: 플레이어 카드 합산 끝자리 (0~9)

ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS b_score SMALLINT,
  ADD COLUMN IF NOT EXISTS p_score SMALLINT;

-- btc_closing_prices 테이블에도 동일하게 추가
ALTER TABLE btc_closing_prices
  ADD COLUMN IF NOT EXISTS b_score SMALLINT,
  ADD COLUMN IF NOT EXISTS p_score SMALLINT;
