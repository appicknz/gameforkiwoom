-- atomic upsert_house_stats RPC
-- SELECT→UPDATE 레이스 컨디션 제거: 단일 SQL로 insert or update
CREATE OR REPLACE FUNCTION upsert_house_stats(
  p_branch_id   uuid,
  p_game_type   text,
  p_bet         bigint,
  p_payout      bigint,
  p_fee         bigint,
  p_lp_used     bigint DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO house_stats (branch_id, game_type, total_bet, total_payout, total_fee, total_lp_used, total_collected, updated_at)
  VALUES (p_branch_id, p_game_type, p_bet, p_payout, p_fee, p_lp_used, 0, now())
  ON CONFLICT (branch_id, game_type)
  DO UPDATE SET
    total_bet       = house_stats.total_bet       + EXCLUDED.total_bet,
    total_payout    = house_stats.total_payout    + EXCLUDED.total_payout,
    total_fee       = house_stats.total_fee       + EXCLUDED.total_fee,
    total_lp_used   = house_stats.total_lp_used   + EXCLUDED.total_lp_used,
    updated_at      = now();
END;
$$;
