/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Turbopack은 serverExternalPackages를 지원하지 않아
  // @supabase/* 가 클라이언트 번들에 포함되고 GoTrueClient가 브라우저에서 생성됨
  // → webpack으로 전환해서 완전히 차단
  experimental: {
    turbo: undefined,
  },
  serverExternalPackages: [
    "@supabase/supabase-js",
    "@supabase/auth-js",
    "@supabase/gotrue-js",
    "@supabase/postgrest-js",
    "@supabase/realtime-js",
    "@supabase/storage-js",
  ],
  // 매 빌드마다 고유 ID 생성 → 캐시 무효화
  generateBuildId: async () => {
    return `build-${Date.now()}`
  },
}

export default nextConfig
