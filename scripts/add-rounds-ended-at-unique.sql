-- rounds 테이블 ended_at UNIQUE 제약 추가 (upsert 중복 방지용)
-- 기존 일반 인덱스 삭제 후 UNIQUE 인덱스로 교체

DROP INDEX IF EXISTS idx_rounds_ended_at;
DROP INDEX IF EXISTS idx_rounds_ended_at_not_null;

-- 기존 중복 데이터 제거 (같은 ended_at 중 id가 작은 것만 남김)
DELETE FROM rounds
WHERE id NOT IN (
  SELECT MIN(id)
  FROM rounds
  GROUP BY ended_at
);

-- UNIQUE 제약 추가
ALTER TABLE rounds
  ADD CONSTRAINT rounds_ended_at_unique UNIQUE (ended_at);

-- 성능용 인덱스 재생성
CREATE INDEX idx_rounds_ended_at ON rounds (ended_at DESC NULLS LAST);
CREATE INDEX idx_rounds_ended_at_not_null ON rounds (ended_at DESC)
  WHERE ended_at IS NOT NULL AND result_price IS NOT NULL;
