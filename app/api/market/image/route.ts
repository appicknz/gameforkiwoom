export const dynamic = "force-dynamic"

import { get } from "@vercel/blob"
import { NextResponse } from "next/server"

// GET /api/market/image?url=<blob_url>
// private Blob을 애플리케이션 경유로 직접 스트리밍합니다.
export async function GET(req: Request) {
  try {
    const requestUrl = new URL(req.url)
    const blobUrl = requestUrl.searchParams.get("url")
    if (!blobUrl) return NextResponse.json({ error: "url 파라미터 필요" }, { status: 400 })

    const parsedBlobUrl = new URL(blobUrl)
    if (parsedBlobUrl.protocol !== "https:" || !parsedBlobUrl.hostname.endsWith(".blob.vercel-storage.com")) {
      return NextResponse.json({ error: "유효하지 않은 이미지 URL" }, { status: 400 })
    }

    const pathname = decodeURIComponent(parsedBlobUrl.pathname.replace(/^\//, ""))
    if (!pathname.startsWith("market-items/")) {
      return NextResponse.json({ error: "허용되지 않은 이미지 경로" }, { status: 403 })
    }

    const result = await get(pathname, {
      access: "private",
      token: process.env.BLOB_READ_WRITE_TOKEN,
      ifNoneMatch: req.headers.get("if-none-match") ?? undefined,
    })
    if (!result) return NextResponse.json({ error: "이미지를 찾을 수 없습니다" }, { status: 404 })

    const cacheControl = "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400"
    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: result.blob.etag, "Cache-Control": cacheControl },
      })
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || "image/jpeg",
        "Content-Length": String(result.blob.size),
        ETag: result.blob.etag,
        "Cache-Control": cacheControl,
      },
    })
  } catch (error) {
    console.error("[image proxy] error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "이미지 로드 실패" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    )
  }
}
