-- 라운드별 결과·배당 기록
CREATE TABLE IF NOT EXISTS game_round_history (
  id            BIGSERIAL PRIMARY KEY,
  game_type     TEXT        NOT NULL CHECK (game_type IN ('baccarat', 'race')),
  round_number  BIGINT      NOT NULL,
  result        TEXT        NOT NULL,          -- 'player'|'banker'|'tie' / 'bit'|'coin'|'tie'
  odds_player   NUMERIC(8,4),
  odds_banker   NUMERIC(8,4),
  odds_tie      NUMERIC(8,4),
  odds_bit      NUMERIC(8,4),
  odds_coin     NUMERIC(8,4),
  total_bet     BIGINT      NOT NULL DEFAULT 0,
  total_payout  BIGINT      NOT NULL DEFAULT 0,
  participant_count INT     NOT NULL DEFAULT 0,
  settled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (game_type, round_number)
);

-- 라운드별 참여 회원·수익 기록
CREATE TABLE IF NOT EXISTS game_round_participants (
  id            BIGSERIAL PRIMARY KEY,
  game_type     TEXT        NOT NULL,
  round_number  BIGINT      NOT NULL,
  user_id       UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  username      TEXT,
  bet_side      TEXT        NOT NULL,
  bet_amount    BIGINT      NOT NULL,
  applied_odds  NUMERIC(8,4),
  payout        BIGINT      NOT NULL DEFAULT 0,
  profit        BIGINT      NOT NULL DEFAULT 0,  -- payout - bet_amount
  result        TEXT        NOT NULL,             -- 'win'|'lose'|'tie'
  settled_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grh_game_round  ON game_round_history     (game_type, round_number DESC);
CREATE INDEX IF NOT EXISTS idx_grp_round       ON game_round_participants (game_type, round_number DESC);
CREATE INDEX IF NOT EXISTS idx_grp_user        ON game_round_participants (user_id, settled_at DESC);
