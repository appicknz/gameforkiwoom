import { put, del, list } from "@vercel/blob"
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { adminSupabase } from "@/lib/supabase-admin"

const SUPER_ROLES = ["master", "super_admin"]

async function checkAuth(req: NextRequest): Promise<boolean> {
  // JWT Bearer 토큰 방식 (panel 페이지)
  const authHeader = req.headers.get("authorization")
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7)
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data } = await anonClient.auth.getUser(token)
    if (!data.user) return false
    const { data: profile } = await adminSupabase
      .from("profiles").select("role").eq("id", data.user.id).single()
    return SUPER_ROLES.includes(profile?.role ?? "")
  }
  // 레거시 ?pw= 방식 (mas 페이지)
  const pw = req.nextUrl.searchParams.get("pw") ?? ""
  return pw === (process.env.SUPER_ADMIN_PASSWORD ?? "")
}

// GET — 목록 조회
export async function GET(req: NextRequest) {
  if (!(await checkAuth(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const { blobs } = await list({ prefix: "card-images/" })
    const images = blobs
      .map(b => ({ url: b.url, pathname: b.pathname, uploadedAt: b.uploadedAt }))
      .sort((a, b) => a.pathname.localeCompare(b.pathname, undefined, { numeric: true }))
    return NextResponse.json({ images })
  } catch (err) {
    console.error("[v0] admin card-images GET error:", err)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

// POST — 업로드 (순번은 현재 이미지 수 + 1)
export async function POST(req: NextRequest) {
  if (!(await checkAuth(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })

    // 현재 업로드된 이미지 수 → 순번 결정
    const { blobs } = await list({ prefix: "card-images/" })
    const order = blobs.length + 1
    const ext = file.name.split(".").pop() ?? "jpg"
    const pathname = `card-images/${String(order).padStart(3, "0")}.${ext}`

    const blob = await put(pathname, file, { access: "public" })
    return NextResponse.json({ url: blob.url, pathname: blob.pathname })
  } catch (err) {
    console.error("[v0] admin card-images POST error:", err)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}

// DELETE — 특정 이미지 삭제
export async function DELETE(req: NextRequest) {
  if (!(await checkAuth(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const { url } = await req.json()
    if (!url) return NextResponse.json({ error: "No url" }, { status: 400 })
    await del(url)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[v0] admin card-images DELETE error:", err)
    return NextResponse.json({ error: "Delete failed" }, { status: 500 })
  }
}
