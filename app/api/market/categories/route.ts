export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

const MASTER_ROLES = ["master", "super_admin"]

export async function GET() {
  const { data, error } = await adminSupabase
    .from("market_categories")
    .select("*")
    .order("sort_order", { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ categories: data })
}

// POST: 카테고리 추가 (master 전용)
export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "인증 필요" }, { status: 401 })

  const { data: profile } = await adminSupabase
    .from("profiles").select("role").eq("id", auth.userId).single()
  if (!profile || !MASTER_ROLES.includes(profile.role))
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })

  const { name, icon, sort_order } = await req.json()
  if (!name) return NextResponse.json({ error: "이름은 필수입니다." }, { status: 400 })

  const { data, error } = await adminSupabase
    .from("market_categories")
    .insert({ name, icon: icon ?? "", sort_order: sort_order ?? 99 })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ category: data })
}

// PATCH: 카테고리 수정 (master 전용) — body: { id, name?, icon?, sort_order? }
export async function PATCH(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "인증 필요" }, { status: 401 })

  const { data: profile } = await adminSupabase
    .from("profiles").select("role").eq("id", auth.userId).single()
  if (!profile || !MASTER_ROLES.includes(profile.role))
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })

  const { id, name, icon, sort_order } = await req.json()
  if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 })

  const { data, error } = await adminSupabase
    .from("market_categories")
    .update({ name, icon, sort_order })
    .eq("id", id)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ category: data })
}

// DELETE: 카테고리 삭제 (master 전용) — ?id=<uuid>
export async function DELETE(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "인증 필요" }, { status: 401 })

  const { data: profile } = await adminSupabase
    .from("profiles").select("role").eq("id", auth.userId).single()
  if (!profile || !MASTER_ROLES.includes(profile.role))
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })

  const id = new URL(req.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 })

  const { error } = await adminSupabase
    .from("market_categories").delete().eq("id", id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
