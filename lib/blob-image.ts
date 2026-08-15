/**
 * 이미지 URL을 표시 가능한 URL로 변환합니다.
 * - private Vercel Blob URL → 서버 프록시 경로
 * - Supabase Storage URL (supabase.co/storage) → 그대로 반환 (public bucket)
 * - 그 외 → 그대로 반환
 */
export function blobImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  // private Vercel Blob: 프록시 경유
  if (url.includes(".private.blob.vercel-storage.com")) {
    return `/api/market/image?v=3&url=${encodeURIComponent(url)}`
  }
  // Supabase public storage 또는 기타 URL: 직접 사용
  return url
}
