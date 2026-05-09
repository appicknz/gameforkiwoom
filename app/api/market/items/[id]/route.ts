import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

// GET: 상품 상세 + 조회수 증가
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  // 조회수 증가 (에러 무시)
  await adminSupabase.rpc("increment_view", { item_id: id }).catch(() => {})

  const { data, error } = await adminSupabase
    .from("market_items")
    .select(`
      id, title, description, image_url, link_url,
      price_krw, stripe_price_id, view_count, order_count, created_at,
      category_id,
      market_categories(name, icon),
      profiles:publisher_id(id, username, role)
    `)
    .eq("id", id)
    .eq("is_active", true)
    .single()

  if (error) return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 })
  return NextResponse.json({ item: data })
}

// DELETE: 상품 비활성화 (master 전용)
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("role")
    .eq("id", auth.userId)
    .single()

  if (profile?.role !== "master") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
  }

  await adminSupabase.from("market_items").update({ is_active: false }).eq("id", id)
  return NextResponse.json({ ok: true })
}
