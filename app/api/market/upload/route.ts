export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { verifySession } from "@/lib/auth"

export async function POST(req: Request) {
  try {
    const auth = await verifySession(req)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 })

    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"]
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "지원하지 않는 이미지 형식입니다." }, { status: 400 })
    }
    // Vercel 서버리스 함수(Route Handler)의 요청 본문 크기 제한은 기본 4.5MB.
    // 10MB로 허용해두면 4.5MB~10MB 사이 파일은 함수 진입 전에 플랫폼 단에서
    // 잘려 500/413으로 실패하고, 클라이언트에는 이유가 보이지 않는 500만 남는다.
    // 안전 마진을 두고 4MB로 제한한다.
    if (file.size > 4 * 1024 * 1024) {
      return NextResponse.json({ error: "파일 크기는 4MB 이하여야 합니다." }, { status: 400 })
    }

    // 현재 Blob 스토어가 private로 설정되어 있으므로 원본을 그대로 private 저장한다.
    // 화면 표시는 기존 /api/market/image private 프록시가 담당한다.
    const input = Buffer.from(await file.arrayBuffer())
    const ext = file.type === "image/jpeg" ? "jpg" : file.type.split("/")[1]
    const pathname = `market-items/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error("[market/upload] BLOB_READ_WRITE_TOKEN is not set")
      return NextResponse.json({ error: "스토리지 설정 오류(BLOB_READ_WRITE_TOKEN)" }, { status: 500 })
    }

    let blob
    try {
      blob = await put(pathname, input, {
        access: "private",
        contentType: file.type,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      })
    } catch (blobError: any) {
      console.error("[market/upload] blob upload failed:", blobError)
      return NextResponse.json(
        { error: `스토리지 업로드 실패: ${blobError?.message ?? "알 수 없는 오류"}` },
        { status: 500 },
      )
    }

    return NextResponse.json({ url: blob.url })
  } catch (e: any) {
    console.error("[market/upload] error:", e)
    return NextResponse.json({ error: e?.message ?? "업로드 실패" }, { status: 500 })
  }
}
