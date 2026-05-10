export const dynamic = "force-dynamic"
import { get } from "@vercel/blob"
import { type NextRequest, NextResponse } from "next/server"

// private blob을 클라이언트에 스트리밍 — baccarat-game 카드 이미지 표시용
// 인증 없이 접근 가능 (이미지 자체는 public 콘텐츠, URL만 숨김)
export async function GET(request: NextRequest) {
  try {
    const pathname = request.nextUrl.searchParams.get("pathname")
    if (!pathname) return new NextResponse("Missing pathname", { status: 400 })

    const result = await get(pathname, {
      access: "private",
      ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
    })

    if (!result) return new NextResponse("Not found", { status: 404 })

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: { ETag: result.blob.etag, "Cache-Control": "public, max-age=3600" },
      })
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType,
        ETag: result.blob.etag,
        "Cache-Control": "public, max-age=3600",
      },
    })
  } catch (err) {
    console.error("[v0] card-images serve error:", err)
    return new NextResponse("Failed", { status: 500 })
  }
}
