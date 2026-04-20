-- =========================================================
-- Cash System & Admin Role Migration v3 (complete, idempotent)
-- =========================================================

-- 1. profiles.role에 admin 추가
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'admin', 'branch_admin', 'super_admin', 'master'));

-- 2. cash_balances: 역할별 독립 현금 잔고
--    cash_amount = 보유 현금, 포인트는 기존 balances 테이블 사용
CREATE TABLE IF NOT EXISTS cash_balances (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cash_amount  BIGINT NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id)
);

-- 3. cash_transactions: 현금/포인트 거래 이력
CREATE TABLE IF NOT EXISTS cash_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  to_user_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  cash_amount   BIGINT NOT NULL DEFAULT 0,
  point_amount  BIGINT NOT NULL DEFAULT 0,
  type          TEXT NOT NULL CHECK (type IN (
                  'cash_deposit',       -- 외부 현금 입금
                  'cash_withdrawal',    -- 현금 출금
                  'point_purchase',     -- 포인트 구매 (현금 지불)
                  'point_sale',         -- 포인트 판매 (현금 수취)
                  'point_charge',       -- 유저에게 포인트 지급
                  'point_exchange'      -- 유저 환전(포인트 차감)
                )),
  note          TEXT,
  ref_id        UUID,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 4. point_purchase_requests: super_admin이 master에게 포인트 구매 요청
--    흐름: super_admin → 현금 금액 입력 + 요청
--          master → 요청 확인 + 비밀번호 입력 + 지급 포인트 직접 입력 + 승인
--          결과: super_admin.cash_amount += cash_amount, balances[super_admin] += point_amount
--                master balances -= point_amount
CREATE TABLE IF NOT EXISTS point_purchase_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  requester_role TEXT NOT NULL,
  cash_amount    BIGINT NOT NULL,          -- 지불할 현금 (요청자가 입력)
  point_amount   BIGINT,                   -- 받을 포인트 (승인자가 입력, 비율 반영)
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at    TIMESTAMPTZ,
  reject_reason  TEXT,
  note           TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 5. point_charge_requests: admin/branch_admin → super_admin/master
--    흐름: admin → 현금 받은 금액 + 지급할 포인트 + 요청
--          super_admin/master → 승인 → 임시계정 자동생성 + 포인트 충전
--          결과: 승인자(super_admin/master) balances -= point_amount
CREATE TABLE IF NOT EXISTS point_charge_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  branch_code     TEXT REFERENCES branches(branch_code) ON DELETE SET NULL,
  cash_amount     BIGINT NOT NULL DEFAULT 0,   -- 유저에게 받은 현금 (기록용)
  point_amount    BIGINT NOT NULL DEFAULT 0,   -- 지급할 포인트
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  temp_username   TEXT,                         -- 생성된 임시계정 ID
  temp_password   TEXT,                         -- 생성된 임시계정 PW (해시 전)
  temp_user_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  reject_reason   TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 6. exchange_requests: 유저 환전 요청
--    흐름: admin/branch_admin → 유저ID + 금액 입력 + 요청
--          master/super_admin → 승인
--          결과: 승인자 balances -= point_amount, 유저 balances -= point_amount
CREATE TABLE IF NOT EXISTS exchange_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_user_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  target_username TEXT,
  branch_code     TEXT REFERENCES branches(branch_code) ON DELETE SET NULL,
  point_amount    BIGINT NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  reject_reason   TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 7. password_reset_requests: 비밀번호 초기화 요청
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_user_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_username TEXT NOT NULL,
  new_password    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 8. daily_sales_log: 일별 지점 매출 기록
CREATE TABLE IF NOT EXISTS daily_sales_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date        DATE NOT NULL,
  branch_code     TEXT REFERENCES branches(branch_code) ON DELETE SET NULL,
  type            TEXT NOT NULL CHECK (type IN ('charge', 'exchange', 'point_purchase')),
  cash_amount     BIGINT NOT NULL DEFAULT 0,
  point_amount    BIGINT NOT NULL DEFAULT 0,
  target_user_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  target_username TEXT,
  operator_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ref_id          UUID,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 9. 인덱스
CREATE INDEX IF NOT EXISTS idx_cash_tx_from         ON cash_transactions(from_user_id);
CREATE INDEX IF NOT EXISTS idx_cash_tx_to           ON cash_transactions(to_user_id);
CREATE INDEX IF NOT EXISTS idx_cash_tx_type         ON cash_transactions(type);
CREATE INDEX IF NOT EXISTS idx_cash_tx_created      ON cash_transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_ppr_status           ON point_purchase_requests(status);
CREATE INDEX IF NOT EXISTS idx_ppr_requester        ON point_purchase_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_pcr_status           ON point_charge_requests(status);
CREATE INDEX IF NOT EXISTS idx_pcr_requester        ON point_charge_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_pcr_branch           ON point_charge_requests(branch_code);
CREATE INDEX IF NOT EXISTS idx_er_status            ON exchange_requests(status);
CREATE INDEX IF NOT EXISTS idx_er_requester         ON exchange_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_dsl_date             ON daily_sales_log(log_date);
CREATE INDEX IF NOT EXISTS idx_dsl_branch           ON daily_sales_log(branch_code);

-- 10. RLS 비활성화 (서비스 롤 전용)
ALTER TABLE cash_balances           DISABLE ROW LEVEL SECURITY;
ALTER TABLE cash_transactions       DISABLE ROW LEVEL SECURITY;
ALTER TABLE point_purchase_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE point_charge_requests   DISABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_requests       DISABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_sales_log         DISABLE ROW LEVEL SECURITY;
