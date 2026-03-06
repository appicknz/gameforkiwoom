import { createClient } from "@supabase/supabase-js"

// 모듈 레벨 싱글톤 — 렌더링마다 재생성되지 않음
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
