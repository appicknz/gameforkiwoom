import { list } from "@vercel/blob"
import { NextResponse } from "next/server"

// 공개 API — 클라이언트(baccarat-game)에서 카드 이미지 목록 조회
export async function GET() {
  try {
    const { blobs } = await list({ prefix: "card-images/" })
    // 순번(파일명 앞 숫자) 기준 정렬
    const images = blobs
      .map(b => ({ url: b.url, pathname: b.pathname, uploadedAt: b.uploadedAt }))
      .sort((a, b) => a.pathname.localeCompare(b.pathname, undefined, { numeric: true }))
    return NextResponse.json({ images })
  } catch (err) {
    console.error("[v0] card-images list error:", err)
    return NextResponse.json({ images: [] }, { status: 500 })
  }
}
