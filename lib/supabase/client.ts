"use client"

import { createBrowserClient } from "@supabase/ssr"

// globalThis 싱글톤: hot reload / React Strict Mode / v0 preview 환경에서
// 인스턴스가 여러 개 생성되는 것을 원천 차단
declare global {
  // eslint-disable-next-line no-var
  var _supabaseBrowserClient: ReturnType<typeof createBrowserClient> | undefined
}

if (!globalThis._supabaseBrowserClient) {
  globalThis._supabaseBrowserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // 프로젝트 고유 storage key → 다른 Supabase 프로젝트와 충돌 방지
        storageKey: "tasko-app-auth-token",
        flowType: "pkce",
        // 자동 세션 갱신 비활성화: 우리는 자체 JWT(app_token) 방식 사용
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    }
  )
}

export const supabaseBrowser = globalThis._supabaseBrowserClient!
