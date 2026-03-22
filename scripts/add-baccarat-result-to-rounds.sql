-- rounds 테이블에 바카라 게임 결과 컬럼 추가
ALTER TABLE rounds
  ADD COLUMN IF NOT EXISTS baccarat_result TEXT CHECK (baccarat_result IN ('player', 'banker', 'tie'));

-- 인덱스 추가 (통계 쿼리 성능)
CREATE INDEX IF NOT EXISTS idx_rounds_baccarat_result ON rounds (baccarat_result);
