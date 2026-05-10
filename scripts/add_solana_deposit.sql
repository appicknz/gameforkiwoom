-- Solana 토큰 입금 시스템
-- profiles 테이블에 HD 지갑 파생 인덱스와 주소 추가
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS wallet_index    INTEGER,
  ADD COLUMN IF NOT EXISTS wallet_address  TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_wallet_address_idx ON profiles(wallet_address);
CREATE UNIQUE INDEX IF NOT EXISTS profiles_wallet_index_idx   ON profiles(wallet_index);

-- 토큰 입금 내역 테이블
-- signature: Solana 트랜잭션 서명 (중복 입금 방지 primary key)
CREATE TABLE IF NOT EXISTS token_deposits (
  signature     TEXT        PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  wallet_address TEXT       NOT NULL,
  token_amount  NUMERIC     NOT NULL,  -- 실제 토큰 수량 (decimals 적용 전)
  r_amount      BIGINT      NOT NULL,  -- 지급된 R (1토큰 = 1R 고정)
  confirmed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tx_url        TEXT
);

CREATE INDEX IF NOT EXISTS token_deposits_user_id_idx ON token_deposits(user_id);
CREATE INDEX IF NOT EXISTS token_deposits_confirmed_at_idx ON token_deposits(confirmed_at DESC);

-- RLS
ALTER TABLE token_deposits ENABLE ROW LEVEL SECURITY;

-- 유저는 자신의 입금 내역만 조회 가능
CREATE POLICY "users_read_own_deposits" ON token_deposits
  FOR SELECT USING (auth.uid() = user_id);

-- 서비스 롤만 INSERT (Railway webhook → Vercel API → adminSupabase)
CREATE POLICY "service_insert_deposits" ON token_deposits
  FOR INSERT WITH CHECK (true);
