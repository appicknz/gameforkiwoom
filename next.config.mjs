/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // @supabase/* 를 서버 전용 외부 패키지로 지정
  // → 클라이언트 번들에 포함되지 않아 브라우저에서 GoTrueClient 생성 불가
  serverExternalPackages: [
    "@supabase/supabase-js",
    "@supabase/auth-js",
    "@supabase/node-fetch",
    "@supabase/postgrest-js",
    "@supabase/realtime-js",
    "@supabase/storage-js",
    "@supabase/gotrue-js",
  ],
  // 매 빌드마다 고유 ID 생성 → .next 캐시 무효화
  generateBuildId: async () => {
    return `build-${Date.now()}`
  },
}

export default nextConfig
