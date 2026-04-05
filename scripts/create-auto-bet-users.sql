-- 자동배팅 유저 생성 (사용자2~사용자30, 비밀번호: Wjdruddl0), 지점코드: 0002
-- branch_id for code '0002': 28733fb0-1907-45b3-90f6-30c725785ee5

DO $$
DECLARE
  v_uid uuid;
  v_email text;
  v_username text;
  v_branch_id uuid := '28733fb0-1907-45b3-90f6-30c725785ee5'::uuid;
  v_password text := 'Wjdruddl0)';
  i int;
BEGIN
  FOR i IN 2..30 LOOP
    v_username := '사용자' || i;
    v_uid := gen_random_uuid();
    v_email := v_uid || '@noreply.app';

    -- 이미 존재하면 skip
    IF EXISTS (SELECT 1 FROM profiles WHERE username = v_username) THEN
      CONTINUE;
    END IF;

    -- auth.users에 생성
    INSERT INTO auth.users (
      id, email, encrypted_password, email_confirmed_at,
      raw_user_meta_data, created_at, updated_at,
      aud, role, instance_id
    ) VALUES (
      v_uid,
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      jsonb_build_object('username', v_username),
      now(),
      now(),
      'authenticated',
      'authenticated',
      '00000000-0000-0000-0000-000000000000'
    );

    -- profiles 생성
    INSERT INTO profiles (id, username, role, branch_id)
    VALUES (v_uid, v_username, 'user', v_branch_id)
    ON CONFLICT (id) DO NOTHING;

    -- balances 생성 (1천만원)
    INSERT INTO balances (user_id, balance)
    VALUES (v_uid, 10000000)
    ON CONFLICT (user_id) DO UPDATE SET balance = 10000000;

  END LOOP;
END $$;

-- 결과 확인
SELECT p.username, b.balance, p.branch_id
FROM profiles p
JOIN balances b ON b.user_id = p.id
WHERE p.username LIKE '사용자%'
  AND p.branch_id = '28733fb0-1907-45b3-90f6-30c725785ee5'
ORDER BY p.username;
