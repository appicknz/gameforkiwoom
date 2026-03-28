-- house_stats: 지점별 하우스 손익 집계 테이블
-- 라운드마다 서버에서 누적 업데이트
CREATE TABLE IF NOT EXISTS house_stats (
  id BIGSERIAL PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  game_type VARCHAR(20) NOT NULL DEFAULT 'baccarat', -- 'baccarat' | 'race'

  -- 총 배팅액 (유저가 건 돈)
  total_bet BIGINT NOT NULL DEFAULT 0,

  -- 총 지급액 (유저에게 나간 돈)
  total_payout BIGINT NOT NULL DEFAULT 0,

  -- LP 투입액 (시스템이 파리뮤추얼 균형을 위해 투입한 돈)
  total_lp_used BIGINT NOT NULL DEFAULT 0,

  -- 수수료 수입 (하우스 엣지)
  -- = total_bet - total_payout - total_lp_used (양수면 하우스 이익)
  total_fee BIGINT NOT NULL DEFAULT 0,

  -- 수금 처리된 금액 (마스터가 수금하면 이만큼 차감)
  total_collected BIGINT NOT NULL DEFAULT 0,

  -- 미수금 (수금 전 잔액) = total_fee - total_collected
  -- 계산 컬럼으로 조회 시 사용

  -- 마지막 업데이트
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(branch_id, game_type)
);

-- 수금 이력 테이블
CREATE TABLE IF NOT EXISTS fee_collections (
  id BIGSERIAL PRIMARY KEY,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  game_type VARCHAR(20) NOT NULL DEFAULT 'baccarat',
  collected_amount BIGINT NOT NULL,
  collected_by UUID NOT NULL REFERENCES auth.users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_house_stats_branch ON house_stats(branch_id);
CREATE INDEX IF NOT EXISTS idx_fee_collections_branch ON fee_collections(branch_id);
CREATE INDEX IF NOT EXISTS idx_fee_collections_created ON fee_collections(created_at DESC);

-- 기존 branches 테이블에 game_type별 LP 설정 추가
ALTER TABLE branches
  ADD COLUMN IF NOT EXISTS lp_amount_baccarat BIGINT NOT NULL DEFAULT 50000,
  ADD COLUMN IF NOT EXISTS lp_amount_race BIGINT NOT NULL DEFAULT 50000;

-- 기존 lp_amount 값이 있으면 두 컬럼 모두에 복사
UPDATE branches SET
  lp_amount_baccarat = lp_amount,
  lp_amount_race = lp_amount
WHERE lp_amount > 0;
