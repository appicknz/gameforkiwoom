-- profiles 테이블에 chat_nickname 컬럼 추가
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS chat_nickname TEXT;
