export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"
import { adminSupabase } from "@/lib/supabase-admin"

const BUCKET = "market-images"

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
    const path     = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const buffer   = await file.arrayBuffer()

    const { data, error } = await adminSupabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, cacheControl: "31536000", upsert: false })

    if (error) throw new Error(error.message)

    const { data: { publicUrl } } = adminSupabase.storage.from(BUCKET).getPublicUrl(data.path)
    return NextResponse.json({ url: publicUrl })
  } catch (e: any) {
    console.error("[upload] error:", e)
    return NextResponse.json({ error: e?.message ?? "업로드 실패" }, { status: 500 })
  }
}
