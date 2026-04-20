-- =========================================================
-- Cash System Migration v2
-- 현금/포인트 비율 분리 + point_purchase_requests 추가
-- =========================================================

-- 1. cash_balances: 이미 있으면 amount → cash_amount 리네임 + points 컬럼 추가
--    (현금과 포인트는 별도 관리)
ALTER TABLE cash_balances
  ADD COLUMN IF NOT EXISTS cash_amount BIGINT NOT NULL DEFAULT 0;

-- 기존 amount가 있다면 cash_amount로 복사 후 삭제
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='cash_balances' AND column_name='amount'
  ) THEN
    UPDATE cash_balances SET cash_amount = amount WHERE cash_amount = 0;
    ALTER TABLE cash_balances DROP COLUMN IF EXISTS amount;
  END IF;
END $$;

-- 2. point_purchase_requests: super_admin → master에게 포인트 구매 요청
--    수동으로 현금 금액 입력 → master가 비밀번호 확인 후 포인트 직접 입력해서 승인
CREATE TABLE IF NOT EXISTS point_purchase_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requester_role  TEXT NOT NULL,           -- super_admin
  cash_amount     BIGINT NOT NULL,         -- 지불할 현금 (수동 입력)
  point_amount    BIGINT,                  -- 승인자가 입력하는 포인트 (비율 반영)
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  rejected_reason TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 3. point_charge_requests: admin/branch_admin → super_admin/master
--    유저에게 줄 포인트 충전 요청
ALTER TABLE point_charge_requests
  ADD COLUMN IF NOT EXISTS cash_amount BIGINT DEFAULT 0,        -- 받은 현금 (기록용)
  ADD COLUMN IF NOT EXISTS point_amount BIGINT DEFAULT 0;       -- 지급할 포인트

-- 기존 amount가 있다면 point_amount로 복사
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='point_charge_requests' AND column_name='amount'
  ) THEN
    UPDATE point_charge_requests SET point_amount = amount WHERE point_amount = 0;
    ALTER TABLE point_charge_requests DROP COLUMN IF EXISTS amount;
  END IF;
END $$;

-- 4. exchange_requests: amount를 point_amount로 명확하게
ALTER TABLE exchange_requests
  ADD COLUMN IF NOT EXISTS point_amount BIGINT DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='exchange_requests' AND column_name='amount'
  ) THEN
    UPDATE exchange_requests SET point_amount = amount WHERE point_amount = 0;
    ALTER TABLE exchange_requests DROP COLUMN IF EXISTS amount;
  END IF;
END $$;

-- 5. cash_transactions 타입 확장
ALTER TABLE cash_transactions DROP CONSTRAINT IF EXISTS cash_transactions_type_check;
ALTER TABLE cash_transactions
  ADD CONSTRAINT cash_transactions_type_check
  CHECK (type IN ('cash_deposit', 'cash_withdrawal', 'point_sale', 'point_purchase', 'point_charge', 'point_exchange'));

-- 6. daily_sales_log에 point_amount / cash_amount 분리
ALTER TABLE daily_sales_log
  ADD COLUMN IF NOT EXISTS point_amount BIGINT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_amount  BIGINT DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name='daily_sales_log' AND column_name='amount'
  ) THEN
    UPDATE daily_sales_log SET point_amount = amount WHERE point_amount = 0;
    ALTER TABLE daily_sales_log DROP COLUMN IF EXISTS amount;
  END IF;
END $$;

-- 7. daily_sales_log type 확장 (point_purchase 추가)
ALTER TABLE daily_sales_log DROP CONSTRAINT IF EXISTS daily_sales_log_type_check;
ALTER TABLE daily_sales_log
  ADD CONSTRAINT daily_sales_log_type_check
  CHECK (type IN ('charge', 'exchange', 'point_purchase'));

-- 8. 인덱스
CREATE INDEX IF NOT EXISTS idx_point_purchase_requests_status    ON point_purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_point_purchase_requests_requester ON point_purchase_requests(requester_id);

-- 9. RLS 비활성화
ALTER TABLE point_purchase_requests DISABLE ROW LEVEL SECURITY;
