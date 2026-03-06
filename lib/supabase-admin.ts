// server-only: 클라이언트 번들에 절대 포함되지 않습니다.
import "server-only"
import { createServerClient } from "@supabase/ssr"

// 서버 프로세스당 싱글톤 (API Route / Server Component 전용)
// cookies 불필요: Service Role Key는 세션 쿠키가 필요 없음
export const adminSupabase = createServerClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    cookies: { getAll: () => [], setAll: () => {} },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
