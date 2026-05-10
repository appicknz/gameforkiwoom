export const dynamic = "force-dynamic"
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
      category_id, publisher_id,
      market_categories(name, icon)
    `)
    .eq("id", id)
    .eq("is_active", true)
    .single()

  if (error || !data) return NextResponse.json({ error: "상품을 찾을 수 없습니다." }, { status: 404 })

  // publisher 프로필 별도 조회
  let profiles = null
  if (data.publisher_id) {
    const { data: p } = await adminSupabase
      .from("profiles")
      .select("id, username, role")
      .eq("id", data.publisher_id)
      .single()
    profiles = p ?? null
  }

  return NextResponse.json({ item: { ...data, profiles } })
}

// PATCH: 상품 수정 (master 전용)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const { data: profile } = await adminSupabase
    .from("profiles").select("role").eq("id", auth.userId).single()

  if (profile?.role !== "master") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
  }

  const body = await req.json()
  const { title, description, link_url, price_krw, category_id, publisher_id, image_url, is_active } = body

  const { data, error } = await adminSupabase
    .from("market_items")
    .update({
      title, description, link_url, price_krw,
      category_id: category_id || null,
      publisher_id, image_url,
      is_active: is_active ?? true,
      stripe_price_id: null, // 가격 변경 시 stripe price 재생성 필요
    })
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
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
