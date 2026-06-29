export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { head } from "@vercel/blob"

// GET /api/market/image?url=<blob_url>
// private Blob → head()로 서명된 downloadUrl을 얻어 스트리밍
export async function GET(req: Request) {
  try {
    const blobUrl = new URL(req.url).searchParams.get("url")
    if (!blobUrl) return NextResponse.json({ error: "url 파라미터 필요" }, { status: 400 })

    // blob URL 형식 검증 (보안)
    if (!blobUrl.startsWith("https://") || !blobUrl.includes("blob.vercel-storage.com")) {
      return NextResponse.json({ error: "유효하지 않은 이미지 URL" }, { status: 400 })
    }

    // head()로 메타데이터 + downloadUrl 획득
    const meta = await head(blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN })

    // private blob: Authorization 헤더와 함께 fetch
    const upstream = await fetch(meta.downloadUrl, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    })
    if (!upstream.ok) return NextResponse.json({ error: "이미지 로드 실패" }, { status: 404 })

    const contentType = upstream.headers.get("content-type") ?? meta.contentType ?? "image/jpeg"
    const buffer      = await upstream.arrayBuffer()

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":  contentType,
        // 24시간 브라우저 캐시 + CDN(Vercel Edge) 7일 캐시
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      },
    })
  } catch (e: any) {
    console.error("[image proxy] error:", e)
    return NextResponse.json({ error: e?.message ?? "이미지 로드 실패" }, { status: 500 })
  }
}
