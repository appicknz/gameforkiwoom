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
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "파일 크기는 10MB 이하여야 합니다." }, { status: 400 })
    }

    const ext      = file.name.split(".").pop()?.toLowerCase() ?? "jpg"
    const pathname = `market-items/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const blob = await put(pathname, file, {
      access: "private",
      token:  process.env.BLOB_READ_WRITE_TOKEN,
    })

    return NextResponse.json({ url: blob.url })
  } catch (e: any) {
    console.error("[market/upload] error:", e)
    return NextResponse.json({ error: e?.message ?? "업로드 실패" }, { status: 500 })
  }
}
