export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { get } from "@vercel/blob"

// GET /api/market/image?url=<blob_url>
// private Blob 이미지를 서버 프록시로 스트리밍
export async function GET(req: Request) {
  try {
    const blobUrl = new URL(req.url).searchParams.get("url")
    if (!blobUrl) return NextResponse.json({ error: "url 파라미터 필요" }, { status: 400 })

    // blob URL 형식 검증 (보안)
    if (!blobUrl.startsWith("https://") || !blobUrl.includes("blob.vercel-storage.com")) {
      return NextResponse.json({ error: "유효하지 않은 이미지 URL" }, { status: 400 })
    }

    // private blob 내용 조회
    const blob = await get(blobUrl, { token: process.env.BLOB_READ_WRITE_TOKEN })
    if (!blob) return NextResponse.json({ error: "이미지를 찾을 수 없습니다." }, { status: 404 })

    // blob.url에 직접 인증 토큰을 붙여 fetch
    const upstream = await fetch(blob.downloadUrl ?? blob.url, {
      headers: { Authorization: `Bearer ${process.env.BLOB_READ_WRITE_TOKEN}` },
    })
    if (!upstream.ok) return NextResponse.json({ error: "이미지 로드 실패" }, { status: 404 })

    const contentType = upstream.headers.get("content-type") ?? blob.contentType ?? "image/jpeg"
    const buffer      = await upstream.arrayBuffer()

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":  contentType,
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch (e: any) {
    console.error("[image proxy] error:", e)
    return NextResponse.json({ error: e?.message ?? "이미지 로드 실패" }, { status: 500 })
  }
}
