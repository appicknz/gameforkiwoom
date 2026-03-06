/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // 매 빌드마다 고유 ID 생성 → .next 캐시 무효화
  generateBuildId: async () => {
    return `build-${Date.now()}`
  },
}

export default nextConfig
