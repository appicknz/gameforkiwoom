// server-only: 클라이언트 번들에 절대 포함되지 않습니다.
import "server-only"
import { createClient } from "@supabase/ssr"

// 서버 프로세스당 싱글톤 (API Route / Server Component 전용)
export const adminSupabase = createClient(
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
)
