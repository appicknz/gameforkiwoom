import { createClient } from "@supabase/supabase-js"

// 브라우저 전용 Supabase 클라이언트 (Realtime WebSocket용)
// anon key 사용 — RLS가 모든 보안을 담당
const globalForSupabase = globalThis as unknown as { _supabaseBrowser?: ReturnType<typeof createClient> }

export const supabaseBrowser =
  globalForSupabase._supabaseBrowser ??
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      realtime: {
        params: { eventsPerSecond: 10 },
      },
    }
  )

if (typeof window !== "undefined") globalForSupabase._supabaseBrowser = supabaseBrowser
