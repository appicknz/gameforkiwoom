-- 지점 테이블 생성
CREATE TABLE IF NOT EXISTS branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  admin_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- profiles 테이블에 branch_code 컬럼 추가
-- 지점관리자: 자신이 운영하는 지점의 코드
-- 일반회원: 가입한 지점의 코드 (NULL이면 미소속)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS branch_code TEXT REFERENCES branches(branch_code) ON DELETE SET NULL;
