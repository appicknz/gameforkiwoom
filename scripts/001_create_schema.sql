-- ============================================================
-- 001_create_schema.sql
-- 전체 DB 스키마: 지점, 프로필, 잔고, 배팅기록, 라운드
-- ============================================================

-- ── 1. 지점 (branches) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.branches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,         -- 지점 고유 코드 (사용자 가입 시 입력)
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  owner_email TEXT NOT NULL,               -- 지점 관리자 이메일
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- 본사(super_admin)만 전체 조회/수정
CREATE POLICY "branches_super_admin_all" ON public.branches
  USING (auth.jwt() ->> 'role' = 'super_admin');

-- 지점 관리자는 자기 지점만 조회
CREATE POLICY "branches_branch_admin_select" ON public.branches
  FOR SELECT USING (
    owner_email = (SELECT email FROM auth.users WHERE id = auth.uid())
  );


-- ── 2. 프로필 (profiles) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT,
  role        TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('super_admin', 'branch_admin', 'user')),
  branch_id   UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 본인 프로필 읽기/수정
CREATE POLICY "profiles_select_own"  ON public.profiles FOR SELECT  USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own"  ON public.profiles FOR INSERT  WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own"  ON public.profiles FOR UPDATE  USING (auth.uid() = id);

-- 지점 관리자: 자기 지점 유저 프로필 조회
CREATE POLICY "profiles_branch_admin_select" ON public.profiles
  FOR SELECT USING (
    branch_id IN (
      SELECT b.id FROM public.branches b
      WHERE b.owner_email = (SELECT email FROM auth.users WHERE id = auth.uid())
        AND b.status = 'approved'
    )
  );

-- 본사: 전체 조회/수정
CREATE POLICY "profiles_super_admin_all" ON public.profiles
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin');


-- ── 3. 잔고 (balances) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.balances (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  amount      BIGINT NOT NULL DEFAULT 0 CHECK (amount >= 0),  -- 단위: 원
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.balances ENABLE ROW LEVEL SECURITY;

-- 본인 잔고만 조회
CREATE POLICY "balances_select_own" ON public.balances
  FOR SELECT USING (auth.uid() = user_id);

-- 지점 관리자: 자기 지점 유저 잔고 조회
CREATE POLICY "balances_branch_admin_select" ON public.balances
  FOR SELECT USING (
    user_id IN (
      SELECT p.id FROM public.profiles p
      JOIN public.branches b ON p.branch_id = b.id
      WHERE b.owner_email = (SELECT email FROM auth.users WHERE id = auth.uid())
        AND b.status = 'approved'
    )
  );

-- 본사: 전체 조회
CREATE POLICY "balances_super_admin_select" ON public.balances
  FOR SELECT USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin');

-- 잔고는 API(service_role)로만 수정 — 직접 수정 차단
CREATE POLICY "balances_no_direct_update" ON public.balances
  FOR UPDATE USING (false);


-- ── 4. 잔고 거래 내역 (balance_transactions) ────────────────
CREATE TABLE IF NOT EXISTS public.balance_transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id   UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  type        TEXT NOT NULL CHECK (type IN ('charge', 'bet', 'win', 'refund')),
  amount      BIGINT NOT NULL,          -- 양수: 증가, 음수: 차감
  balance_before BIGINT NOT NULL,
  balance_after  BIGINT NOT NULL,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.balance_transactions ENABLE ROW LEVEL SECURITY;

-- 본인 거래 내역 조회
CREATE POLICY "txn_select_own" ON public.balance_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- 지점 관리자: 자기 지점 유저 거래 내역 조회
CREATE POLICY "txn_branch_admin_select" ON public.balance_transactions
  FOR SELECT USING (
    user_id IN (
      SELECT p.id FROM public.profiles p
      JOIN public.branches b ON p.branch_id = b.id
      WHERE b.owner_email = (SELECT email FROM auth.users WHERE id = auth.uid())
        AND b.status = 'approved'
    )
  );

-- 본사: 전체 조회
CREATE POLICY "txn_super_admin_select" ON public.balance_transactions
  FOR SELECT USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin');


-- ── 5. 라운드 (rounds) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rounds (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_number BIGSERIAL,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at     TIMESTAMPTZ,
  base_price   NUMERIC(20, 2),
  result_price NUMERIC(20, 2),
  result_digit SMALLINT,                -- 결과 끝자리 (0~9)
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.rounds ENABLE ROW LEVEL SECURITY;

-- 모든 인증 유저 조회 가능
CREATE POLICY "rounds_select_authenticated" ON public.rounds
  FOR SELECT TO authenticated USING (true);


-- ── 6. 배팅 기록 (bet_history) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.bet_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  branch_id   UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  round_id    UUID REFERENCES public.rounds(id) ON DELETE SET NULL,
  -- 배팅 종류
  bet_direction  TEXT CHECK (bet_direction IN ('long', 'short')),
  bet_digit      TEXT CHECK (bet_digit IN ('over', 'under')),
  bet_parity     TEXT CHECK (bet_parity IN ('odd', 'even')),
  -- 금액
  bet_amount  BIGINT NOT NULL CHECK (bet_amount > 0),
  payout      BIGINT NOT NULL DEFAULT 0,  -- 실제 수령액 (원금 포함)
  result      TEXT CHECK (result IN ('win', 'lose', 'pending')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.bet_history ENABLE ROW LEVEL SECURITY;

-- 본인 배팅 기록 조회
CREATE POLICY "bet_select_own" ON public.bet_history
  FOR SELECT USING (auth.uid() = user_id);

-- 지점 관리자: 자기 지점 유저 배팅 기록 조회
CREATE POLICY "bet_branch_admin_select" ON public.bet_history
  FOR SELECT USING (
    user_id IN (
      SELECT p.id FROM public.profiles p
      JOIN public.branches b ON p.branch_id = b.id
      WHERE b.owner_email = (SELECT email FROM auth.users WHERE id = auth.uid())
        AND b.status = 'approved'
    )
  );

-- 본사: 전체 조회
CREATE POLICY "bet_super_admin_select" ON public.bet_history
  FOR SELECT USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'super_admin');


-- ── 7. 신규 유저 자동 프로필 + 잔고 생성 트리거 ───────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch_id UUID;
  v_role      TEXT := 'user';
BEGIN
  -- 지점코드로 branch_id 조회
  IF new.raw_user_meta_data ->> 'branch_code' IS NOT NULL THEN
    SELECT id INTO v_branch_id
    FROM public.branches
    WHERE code = new.raw_user_meta_data ->> 'branch_code'
      AND status = 'approved';
  END IF;

  -- 지점 관리자 가입이면 role 설정
  IF new.raw_user_meta_data ->> 'role' = 'branch_admin' THEN
    v_role := 'branch_admin';
  END IF;

  -- 프로필 생성
  INSERT INTO public.profiles (id, username, role, branch_id)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    v_role,
    v_branch_id
  )
  ON CONFLICT (id) DO NOTHING;

  -- 잔고 생성 (초기 0원)
  INSERT INTO public.balances (user_id, amount)
  VALUES (new.id, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
