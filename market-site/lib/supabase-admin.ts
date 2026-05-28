// server-only: 클라이언트 번들에 절대 포함되지 않습니다.
// serverExternalPackages + server-only 로 이중 차단
import "server-only"
import { createClient } from "@supabase/supabase-js"

type SupabaseAdminClient = ReturnType<typeof createClient>

// 서버 프로세스당 싱글톤 — 빌드(SSG) 시점에는 초기화하지 않고 첫 호출 시 lazy 생성
const globalForSupabase = globalThis as unknown as { _adminSupabase?: SupabaseAdminClient }

function getAdminSupabase(): SupabaseAdminClient {
  if (!globalForSupabase._adminSupabase) {
    const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      throw new Error("Supabase admin env vars (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are missing")
    }
    globalForSupabase._adminSupabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: "public" },
      global: { headers: { "x-connection-encrypted": "1" } },
    })
  }
  return globalForSupabase._adminSupabase
}

// Proxy를 사용해 기존 코드(`adminSupabase.from(...)`)를 변경 없이 유지하면서 lazy 초기화
export const adminSupabase = new Proxy({} as SupabaseAdminClient, {
  get(_target, prop) {
    return (getAdminSupabase() as any)[prop]
  },
})
