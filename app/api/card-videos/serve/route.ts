export const dynamic = "force-dynamic"
import { get } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

// private blob 영상 스트리밍 — Range 헤더 지원으로 <video> 딜레이 없이 재생
export async function GET(request: NextRequest) {
  try {
    const pathname = request.nextUrl.searchParams.get("pathname")
    if (!pathname) return new NextResponse("Missing pathname", { status: 400 })

    const result = await get(pathname, { access: "private" })
    if (!result) return new NextResponse("Not found", { status: 404 })

    // ETag 기반 캐시 (304)
    if (
      result.statusCode === 304 ||
      (request.headers.get("if-none-match") && request.headers.get("if-none-match") === result.blob.etag)
    ) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: result.blob.etag, "Cache-Control": "public, max-age=3600" },
      })
    }

    const contentType = result.blob.contentType || "video/mp4"

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": contentType,
        ETag: result.blob.etag,
        // Accept-Ranges 선언 → 브라우저가 range 요청으로 seek 가능
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      },
    })
  } catch (err) {
    console.error("[v0] card-videos serve error:", err)
    return new NextResponse("Failed", { status: 500 })
  }
}
