// server-only: 이 파일은 절대 클라이언트 번들에 포함되지 않습니다.
// Next.js가 클라이언트에서 import 시 빌드 에러를 발생시킵니다.
import "server-only"
import { createClient } from "@supabase/supabase-js"

// 모듈 레벨에서 한 번만 생성 (서버 프로세스당 싱글톤)
// 클라이언트 번들에는 절대 포함되지 않으므로 GoTrueClient 경합 없음
export const adminSupabase = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
