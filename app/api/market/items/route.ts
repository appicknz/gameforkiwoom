export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

// GET: 상품 목록 (공개)
export async function GET(req: Request) {
  const url = new URL(req.url)
  const categoryId = url.searchParams.get("category")
  const sort       = url.searchParams.get("sort") ?? "popular"   // popular | price_asc | price_desc | newest
  const q          = url.searchParams.get("q") ?? ""

  let query = adminSupabase
    .from("market_items")
    .select(`
      id, title, description, image_url, link_url,
      price_krw, view_count, order_count, created_at,
      category_id, publisher_id,
      market_categories(name, icon)
    `)
    .eq("is_active", true)

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

  // master 권한 확인
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("role")
    .eq("id", auth.userId)
    .single()

  if (profile?.role !== "master") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
  }

  const body = await req.json()
  const { title, description, image_url, link_url, price_krw, category_id, publisher_id } = body

  if (!title || !price_krw || !publisher_id) {
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
