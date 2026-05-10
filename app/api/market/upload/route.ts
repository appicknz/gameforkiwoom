export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { verifySession } from "@/lib/auth"

export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const formData = await req.formData()
  const file = formData.get("file") as File | null
  if (!file) return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 })

  const ext      = file.name.split(".").pop() ?? "jpg"
  const filename = `market/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

  const blob = await put(filename, file, { access: "public" })
  return NextResponse.json({ url: blob.url })
}
