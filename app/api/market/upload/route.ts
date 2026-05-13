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

    const ext      = file.name.split(".").pop()?.toLowerCase() ?? "jpg"
    const filename = `market/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    const blob = await put(filename, file, {
      access:      "public",
      contentType: file.type,
    })
    return NextResponse.json({ url: blob.url })
  } catch (e: any) {
    console.error("[upload] error:", e)
    return NextResponse.json({ error: e?.message ?? "업로드 실패" }, { status: 500 })
  }
}
