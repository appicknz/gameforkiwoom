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
    // sharp은 플랫폼별 네이티브 바이너리(.node)를 사용하므로 webpack이 번들링하면
    // 배포 환경(Vercel 서버리스 함수)에서 바이너리를 찾지 못해 500 에러가 발생함.
    // node_modules에서 직접 로드되도록 외부 패키지로 지정.
    "sharp",
  ],
  // 매 빌드마다 고유 ID 생성 → 캐시 무효화
  generateBuildId: async () => {
    return `build-${Date.now()}`
  },
}

export default nextConfig
