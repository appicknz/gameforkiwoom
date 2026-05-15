export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

// GET: 상품 목록 (공개) — ?mine=true 시 인증된 사용자의 상품만
export async function GET(req: Request) {
  const url = new URL(req.url)
  const categoryId = url.searchParams.get("category")
  const sort       = url.searchParams.get("sort") ?? "popular"
  const q          = url.searchParams.get("q") ?? ""
  const mine       = url.searchParams.get("mine") === "true"

  let query = adminSupabase
    .from("market_items")
    .select(`
      id, title, description, image_url, link_url,
      price_krw, view_count, order_count, created_at, is_active,
      category_id, publisher_id,
      market_categories(name, icon)
    `)

  if (mine) {
    // mine=true: 인증 필요, 본인 상품 전체 (비활성 포함)
    const auth = await verifySession(req)
    if (!auth.ok) return NextResponse.json({ items: [] })
    query = query.eq("publisher_id", auth.userId)
  } else {
    query = query.eq("is_active", true)
  }

  if (categoryId && categoryId !== "all") {
    query = query.eq("category_id", categoryId)
  }
  if (q) {
    query = query.ilike("title", `%${q}%`)
  }

  switch (sort) {
    case "popular":   query = query.order("order_count", { ascending: false }); break
    case "price_asc": query = query.order("price_krw",   { ascending: true  }); break
    case "price_desc":query = query.order("price_krw",   { ascending: false }); break
    case "newest":    query = query.order("created_at",  { ascending: false }); break
    default:          query = query.order("order_count", { ascending: false })
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // publisher 프로필 별도 조회
  const publisherIds = [...new Set((data ?? []).map((i: any) => i.publisher_id).filter(Boolean))]
  let profilesMap: Record<string, { username: string; role: string }> = {}
  if (publisherIds.length > 0) {
    const { data: profiles } = await adminSupabase
      .from("profiles")
      .select("id, username, role")
      .in("id", publisherIds)
    profiles?.forEach((p: any) => { profilesMap[p.id] = { username: p.username, role: p.role } })
  }

  const items = (data ?? []).map((item: any) => ({
    ...item,
    profiles: profilesMap[item.publisher_id] ?? null,
  }))

  return NextResponse.json({ items })
}

// POST: 상품 등록 (master 전용)
export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  // 글쓰기 권한 확인: master / super_admin / branch_admin / admin
  const WRITE_ROLES = ["master", "super_admin", "branch_admin", "admin", "seller"]
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("role, username")
    .eq("id", auth.userId)
    .single()

  if (!profile || !WRITE_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
  }

  const body = await req.json()
  const { title, description, image_url, link_url, price_krw, category_id } = body

  // master가 아니면 publisher_id는 본인으로 강제
  const publisher_id = profile.role === "master"
    ? (body.publisher_id ?? auth.userId)
    : auth.userId

  if (!title || !price_krw) {
    return NextResponse.json({ error: "필수 항목을 입력해주세요." }, { status: 400 })
  }

  // Stripe 상품 + 가격 동적 생성
  const { stripe } = await import("@/lib/stripe")
  const stripeProduct = await stripe.products.create({ name: title })
  const stripePrice   = await stripe.prices.create({
    product:     stripeProduct.id,
    unit_amount: price_krw,   // 원화 (KRW, 최소 단위 = 1원)
    currency:    "krw",
  })

  const { data, error } = await adminSupabase
    .from("market_items")
    .insert({
      title,
      description: description ?? "",
      image_url:   image_url  ?? null,
      link_url:    link_url   ?? null,
      price_krw,
      category_id: category_id ?? null,
      publisher_id,
      stripe_price_id: stripePrice.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
