// server-only: 클라이언트 번들에 절대 포함되지 않습니다.
// serverExternalPackages + server-only 로 이중 차단
import "server-only"
import { createClient } from "@supabase/supabase-js"

// 서버 프로세스당 싱글톤 (API Route / Server Component 전용)
const globalForSupabase = globalThis as unknown as { _adminSupabase?: ReturnType<typeof createClient> }

if (!globalForSupabase._adminSupabase) {
  globalForSupabase._adminSupabase = createClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        // Supabase Pro PgBouncer(connection pooler) 활성화
        // POSTGRES_URL_NON_POOLING 대신 POSTGRES_PRISMA_URL(pooling) 사용
        // → Vercel Serverless 동시 실행 수백 개에도 DB 연결 60개 제한 안 걸림
        schema: "public",
      },
      global: {
        headers: {
          // PgBouncer transaction mode 호환 — prepared statements 비활성
          "x-connection-encrypted": "1",
        },
      },
    }
  )
}

export const adminSupabase = globalForSupabase._adminSupabase!
