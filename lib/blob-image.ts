/**
 * 이미지 URL을 표시 가능한 URL로 변환합니다.
 * - Vercel Blob URL (public/private 스토어 서브도메인 형식은 환경마다 다를 수 있음) → 서버 프록시 경로
 * - Supabase Storage URL (supabase.co/storage) → 그대로 반환 (public bucket)
 * - 그 외 → 그대로 반환
 *
 * 주의: app/api/market/image/route.ts의 호스트 검증 로직과 동일한 기준(".blob.vercel-storage.com"
 * 접미사)을 사용해야 합니다. 환경(로컬 샌드박스 vs 실제 배포)마다 Blob 스토어의 서브도메인 구성이
 * 다를 수 있으므로, "private" 문자열 존재 여부가 아니라 도메인 접미사만으로 판단합니다.
 */
export function blobImageUrl(url: string | null | undefined): string | null {
  if (!url) return null

  try {
    const parsed = new URL(url)
    if (parsed.protocol === "https:" && parsed.hostname.endsWith(".blob.vercel-storage.com")) {
      return `/api/market/image?v=4&url=${encodeURIComponent(url)}`
    }
  } catch {
    // 절대 URL이 아니면(상대 경로 등) 그대로 반환
  }

  // Supabase public storage 또는 기타 URL: 직접 사용
  return url
}
