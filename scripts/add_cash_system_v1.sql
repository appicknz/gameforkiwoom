-- =========================================================
-- Cash System & Admin Role Migration v1
-- =========================================================

-- 1. admin 역할 추가 (profiles.role check constraint 수정)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('user', 'admin', 'branch_admin', 'super_admin', 'master'));

-- 2. 현금 잔고 테이블 (역할별 독립 현금)
CREATE TABLE IF NOT EXISTS cash_balances (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount      BIGINT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (owner_id)
);

-- 3. 현금 거래 이력
CREATE TABLE IF NOT EXISTS cash_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  to_user_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  amount        BIGINT NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'point_sale', 'point_purchase')),
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 포인트 충전 요청
--    admin/branch_admin이 요청 → master/super_admin이 승인 → 임시계정 생성
CREATE TABLE IF NOT EXISTS point_charge_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  branch_code     TEXT REFERENCES branches(branch_code) ON DELETE SET NULL,
  amount          BIGINT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  -- 승인 후 생성된 임시계정 정보
  temp_username   TEXT,
  temp_user_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  rejected_reason TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 5. 환전(출금) 요청
--    admin/branch_admin이 요청 → master/super_admin이 승인 → 승인자 포인트 차감
CREATE TABLE IF NOT EXISTS exchange_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_user_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  target_username TEXT,
  amount          BIGINT NOT NULL,
  branch_code     TEXT REFERENCES branches(branch_code) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  rejected_reason TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 6. 비밀번호 초기화 요청
--    admin/branch_admin이 요청 → master/super_admin이 승인
CREATE TABLE IF NOT EXISTS password_reset_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_user_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_username TEXT NOT NULL,
  new_password    TEXT NOT NULL,  -- 요청자가 제안하는 임시 비밀번호
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  approved_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 7. 일별 지점 매출 기록 (충전/환전 집계)
CREATE TABLE IF NOT EXISTS daily_sales_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date        DATE NOT NULL,
  branch_code     TEXT REFERENCES branches(branch_code) ON DELETE SET NULL,
  type            TEXT NOT NULL CHECK (type IN ('charge', 'exchange')),
  amount          BIGINT NOT NULL,
  target_user_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  target_username TEXT,
  operator_id     UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- 처리한 관리자
  ref_id          UUID,  -- point_charge_requests.id or exchange_requests.id
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_point_charge_requests_status ON point_charge_requests(status);
CREATE INDEX IF NOT EXISTS idx_point_charge_requests_requester ON point_charge_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_exchange_requests_status ON exchange_requests(status);
CREATE INDEX IF NOT EXISTS idx_exchange_requests_requester ON exchange_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_daily_sales_log_date ON daily_sales_log(log_date);
CREATE INDEX IF NOT EXISTS idx_daily_sales_log_branch ON daily_sales_log(branch_code);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_from ON cash_transactions(from_user_id);
CREATE INDEX IF NOT EXISTS idx_cash_transactions_to ON cash_transactions(to_user_id);

-- 8. RLS 비활성화 (service role로만 접근, 기존 패턴 유지)
ALTER TABLE cash_balances         DISABLE ROW LEVEL SECURITY;
ALTER TABLE cash_transactions     DISABLE ROW LEVEL SECURITY;
ALTER TABLE point_charge_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE exchange_requests     DISABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_requests DISABLE ROW LEVEL SECURITY;
ALTER TABLE daily_sales_log       DISABLE ROW LEVEL SECURITY;
