/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    browsersListForSwc: true, // PC 텔레그램 WebView 호환
  },
  images: {
    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 2592000,
    qualities: [60, 75, 85],
  },
  // Next.js 16에서 Turbopack은 serverExternalPackages를 제대로 지원 안 함
  // package.json "dev": "next dev --no-turbopack" 으로 webpack 강제 사용
  // webpack 환경에서 아래 패키지들이 클라이언트 번들에서 완전히 제외됨
  // → 브라우저에서 GoTrueClient 생성 구조적으로 불가
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
