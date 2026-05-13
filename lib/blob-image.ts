/**
 * private Vercel Blob URL을 서버 프록시 경로로 변환합니다.
 * blob URL이 아닌 경우(예: https://외부 이미지) 그대로 반환합니다.
 */
export function blobImageUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.includes("blob.vercel-storage.com")) {
    return `/api/market/image?url=${encodeURIComponent(url)}`
  }
  return url
}
