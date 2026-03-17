import { put, del, list } from "@vercel/blob"
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { adminSupabase } from "@/lib/supabase-admin"

const SUPER_ROLES = ["master", "super_admin"]

async function checkAuth(req: NextRequest): Promise<boolean> {
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
  const pw = req.nextUrl.searchParams.get("pw") ?? ""
  return pw === (process.env.SUPER_ADMIN_PASSWORD ?? "")
}

// GET — 영상 목록 조회
export async function GET(req: NextRequest) {
  if (!(await checkAuth(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const { blobs } = await list({ prefix: "card-videos/" })
    const videos = blobs
      .map(b => ({
        url: `/api/card-videos/serve?pathname=${encodeURIComponent(b.pathname)}`,
        pathname: b.pathname,
        uploadedAt: b.uploadedAt,
        size: b.size,
      }))
      .sort((a, b) => a.pathname.localeCompare(b.pathname, undefined, { numeric: true }))
    return NextResponse.json({ videos })
  } catch (err) {
    console.error("[v0] admin card-videos GET error:", err)
    return NextResponse.json({ error: "Failed" }, { status: 500 })
  }
}

// POST — 업로드
export async function POST(req: NextRequest) {
  if (!(await checkAuth(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null
    if (!file) return NextResponse.json({ error: "No file" }, { status: 400 })

    const allowed = ["video/mp4", "video/webm", "video/mov", "video/quicktime"]
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: "MP4/WebM/MOV 파일만 허용됩니다." }, { status: 400 })
    }

    const { blobs } = await list({ prefix: "card-videos/" })
    const order = blobs.length + 1
    const ext = file.name.split(".").pop() ?? "mp4"
    const pathname = `card-videos/${String(order).padStart(3, "0")}.${ext}`

    const blob = await put(pathname, file, { access: "private" })
    return NextResponse.json({ pathname: blob.pathname })
  } catch (err) {
    console.error("[v0] admin card-videos POST error:", err)
    return NextResponse.json({ error: "Upload failed" }, { status: 500 })
  }
}

// DELETE
export async function DELETE(req: NextRequest) {
  if (!(await checkAuth(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  try {
    const { pathname } = await req.json()
    const target = pathname ?? null
    if (!target) return NextResponse.json({ error: "No target" }, { status: 400 })
    await del(target)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[v0] admin card-videos DELETE error:", err)
    return NextResponse.json({ error: "Delete failed" }, { status: 500 })
  }
}
