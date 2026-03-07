-- atomic_deduct_balance: 잔고 차감 (충분할 때만 성공)
-- 동시 요청이 들어와도 DB 레벨에서 단일 UPDATE로 처리 → race condition 방지
CREATE OR REPLACE FUNCTION atomic_deduct_balance(
  p_user_id UUID,
  p_amount   NUMERIC
)
RETURNS NUMERIC   -- 차감 후 잔고 반환. 잔고 부족이면 -1 반환
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  UPDATE balances
  SET    amount = amount - p_amount
  WHERE  user_id   = p_user_id
    AND  amount   >= p_amount   -- 잔고가 충분할 때만 UPDATE
  RETURNING amount INTO v_new_balance;

  -- UPDATE가 0건이면 잔고 부족
  IF NOT FOUND THEN
    RETURN -1;
  END IF;

  RETURN v_new_balance;
END;
$$;

-- atomic_add_balance: 잔고 증가 (당첨 수익)
CREATE OR REPLACE FUNCTION atomic_add_balance(
  p_user_id UUID,
  p_amount   NUMERIC
)
RETURNS NUMERIC   -- 증가 후 잔고 반환
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance NUMERIC;
BEGIN
  UPDATE balances
  SET    amount = amount + p_amount
  WHERE  user_id = p_user_id
  RETURNING amount INTO v_new_balance;

  RETURN COALESCE(v_new_balance, 0);
END;
$$;
