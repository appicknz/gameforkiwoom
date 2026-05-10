export const dynamic = "force-dynamic"
import { list } from "@vercel/blob"
import { NextResponse } from "next/server"

// 공개 API — baccarat-game에서 영상 목록 조회
export async function GET() {
  try {
    const { blobs } = await list({ prefix: "card-videos/" })
    const videos = blobs
      .map(b => ({
        url: `/api/card-videos/serve?pathname=${encodeURIComponent(b.pathname)}`,
        pathname: b.pathname,
      }))
      .sort((a, b) => a.pathname.localeCompare(b.pathname, undefined, { numeric: true }))
    return NextResponse.json({ videos })
  } catch (err) {
    console.error("[v0] card-videos list error:", err)
    return NextResponse.json({ videos: [] }, { status: 500 })
  }
}
