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

// PATCH: 상품 수정 (master 전체 / seller·admin·branch_admin은 자신의 상품만)
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const { data: profile } = await adminSupabase
    .from("profiles").select("role").eq("id", auth.userId).single()

  const WRITE_ROLES = ["master", "super_admin", "branch_admin", "admin", "seller"]
  if (!profile || !WRITE_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
  }

  // master·super_admin이 아니면 본인 상품인지 확인
  const isSuperUser = ["master", "super_admin"].includes(profile.role)
  if (!isSuperUser) {
    const { data: item } = await adminSupabase
      .from("market_items").select("publisher_id").eq("id", id).single()
    if (!item || item.publisher_id !== auth.userId) {
      return NextResponse.json({ error: "본인의 상품만 수정할 수 있습니다." }, { status: 403 })
    }
  }

  const body = await req.json()
  const { title, description, link_url, price_krw, category_id, image_url, is_active } = body
  const game_bonus_rate = body.game_bonus_rate != null
    ? Math.min(100, Math.max(0, parseInt(body.game_bonus_rate, 10) || 0))
    : undefined

  // 가격이 변경된 경우 Stripe price 재생성
  const { data: existingItem } = await adminSupabase
    .from("market_items").select("price_krw, stripe_price_id").eq("id", id).single()

  let stripe_price_id = existingItem?.stripe_price_id
  if (price_krw && price_krw !== existingItem?.price_krw) {
    const { stripe } = await import("@/lib/stripe")
    // 기존 price 비활성화
    if (stripe_price_id) {
      await stripe.prices.update(stripe_price_id, { active: false }).catch(() => {})
    }
    // 새 price 생성
    const { data: fullItem } = await adminSupabase
      .from("market_items").select("stripe_price_id").eq("id", id).single()
    const product = await stripe.products.retrieve(
      // product_id가 없으면 새로 생성
      "unknown"
    ).catch(async () => stripe.products.create({ name: title ?? "상품" }))
    const newPrice = await stripe.prices.create({
      product:     product.id,
      unit_amount: price_krw,
      currency:    "krw",
    })
    stripe_price_id = newPrice.id
  }

  const updatePayload: Record<string, unknown> = {
    title,
    description,
    link_url:        link_url    ?? null,
    price_krw:       price_krw   ?? existingItem?.price_krw,
    category_id:     category_id || null,
    image_url:       image_url   ?? null,
    is_active:       is_active   ?? true,
    stripe_price_id,
  }
  if (game_bonus_rate !== undefined) updatePayload.game_bonus_rate = game_bonus_rate

  const { data, error } = await adminSupabase
    .from("market_items")
    .update(updatePayload)
    .eq("id", id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

// DELETE: 상품 삭제 (master 전체 / seller·admin은 자신의 상품만)
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const { data: profile } = await adminSupabase
    .from("profiles").select("role").eq("id", auth.userId).single()

  const WRITE_ROLES = ["master", "super_admin", "branch_admin", "admin", "seller"]
  if (!profile || !WRITE_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
  }

  // master·super_admin이 아니면 본인 상품인지 확인
  const isSuperUser = ["master", "super_admin"].includes(profile.role)
  if (!isSuperUser) {
    const { data: item } = await adminSupabase
      .from("market_items").select("publisher_id").eq("id", id).single()
    if (!item || item.publisher_id !== auth.userId) {
      return NextResponse.json({ error: "본인의 상품만 삭제할 수 있습니다." }, { status: 403 })
    }
  }

  await adminSupabase.from("market_items").update({ is_active: false }).eq("id", id)
  return NextResponse.json({ ok: true })
}
