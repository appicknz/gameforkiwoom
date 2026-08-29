export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

// GET: 상품 목록 (공개) — ?mine=true 시 인증된 사용자의 상품만
export async function GET(req: Request) {
  const url = new URL(req.url)
  const categoryId = url.searchParams.get("category")
  const sort       = url.searchParams.get("sort") ?? "popular"
  const direction  = url.searchParams.get("direction") === "asc"
  const q          = url.searchParams.get("q") ?? ""
  const mine       = url.searchParams.get("mine") === "true"
  const all        = url.searchParams.get("all")  === "true"   // master 전용: 비활성 포함 전체
  const limit      = Math.min(100, parseInt(url.searchParams.get("limit") ?? "50", 10))
  const offset     = Math.max(0,   parseInt(url.searchParams.get("offset") ?? "0",  10))

  let query = adminSupabase
    .from("market_items")
    .select(`
      id, title, description, image_url, link_url,
      price_krw, view_count, order_count, game_bonus_rate, created_at, is_active,
      category_id, publisher_id, content_type, data_source_type,
      market_categories(name, icon, balance_only)
    `)

  if (all) {
    // all=true: master 전용, 비활성 포함 전체 — 인증 및 role 검증
    const auth = await verifySession(req)
    if (!auth.ok) return NextResponse.json({ items: [] })
    const { data: p } = await adminSupabase.from("profiles").select("role").eq("id", auth.userId).single()
    if (!p || !["master", "super_admin"].includes(p.role)) return NextResponse.json({ items: [] })
    // is_active 필터 없음 → 전체
  } else if (mine) {
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
    case "popular": query = query.order("order_count", { ascending: direction }); break
    case "ranking": query = query.order("created_at", { ascending: direction }); break
    case "price_asc": query = query.order("price_krw", { ascending: true }); break
    case "price_desc": query = query.order("price_krw", { ascending: false }); break
    case "newest": query = query.order("created_at", { ascending: direction }); break
    default: query = query.order("order_count", { ascending: false })
  }

  // 랭킹은 아래 프로필 잔고를 기준으로 후처리합니다.
  const { data, error } = await query.range(sort === "ranking" ? 0 : offset, sort === "ranking" ? 99 : offset + limit - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // publisher 프로필 별도 조회
  const publisherIds = [...new Set((data ?? []).map((i: any) => i.publisher_id).filter(Boolean))]
  let profilesMap: Record<string, { username: string; role: string; balance: number }> = {}
  if (publisherIds.length > 0) {
    const [{ data: profiles }, { data: balances }] = await Promise.all([
      adminSupabase.from("profiles").select("id, username, role").in("id", publisherIds),
      adminSupabase.from("balances").select("user_id, amount").in("user_id", publisherIds),
    ])
    const balanceMap = new Map((balances ?? []).map((row: any) => [row.user_id, Number(row.amount ?? 0)]))
    profiles?.forEach((p: any) => { profilesMap[p.id] = { username: p.username, role: p.role, balance: Number(balanceMap.get(p.id) ?? 0) } })
  }

  let items = (data ?? []).map((item: any) => ({
    ...item,
    profiles: profilesMap[item.publisher_id] ?? null,
  }))

  if (sort === "ranking") {
    const ids = items.map((item: any) => item.publisher_id).filter(Boolean)
    const { data: balances } = ids.length ? await adminSupabase.from("balances").select("user_id, amount").in("user_id", ids) : { data: [] }
    const balanceMap = new Map((balances ?? []).map((row: any) => [row.user_id, Number(row.amount ?? 0)]))
    items = items.sort((a: any, b: any) => (Number(balanceMap.get(a.publisher_id) ?? 0) - Number(balanceMap.get(b.publisher_id) ?? 0)) * (direction ? 1 : -1)).slice(offset, offset + limit)
  }

  return NextResponse.json(
    {
      items,
      hasMore: sort === "ranking" ? (data ?? []).length === 100 : items.length === limit,  // limit개가 꽉 찼으면 다음 페이지 존재
      offset,
      limit,
    },
    {
      headers: {
        "Cache-Control": mine || all
          ? "private, no-store"
          : "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  )
}

// POST: 상품 등록 (master 전용)
export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  // 모든 로그인 사용자가 글을 작성할 수 있습니다. publisher_id는 항상 본인으로 고정합니다.
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("role, username")
    .eq("id", auth.userId)
    .single()
  const hasPointCategoryPermission = true

  const body = await req.json()
  const { title, description, image_url, link_url, price_krw, category_id, content_type, data_source_type } = body

  // 링크 필수 검증
  if (!link_url || !link_url.trim()) {
    return NextResponse.json({ error: "링크를 입력해주세요." }, { status: 400 })
  }

  // 포인트 전용 카테고리에 글쓰기 시 권한 검사
  if (category_id) {
    const { data: cat } = await adminSupabase
      .from("market_categories")
      .select("balance_only")
      .eq("id", category_id)
      .maybeSingle()
    if (cat?.balance_only && !hasPointCategoryPermission) {
      return NextResponse.json({ error: "포인트 전용 카테고리 글쓰기 권한이 없습니다." }, { status: 403 })
    }
  }
  const game_bonus_rate = Math.min(100, Math.max(0, parseInt(body.game_bonus_rate ?? "0", 10) || 0))

  // master가 아니면 publisher_id는 본인으로 강제
  const publisher_id = profile?.role === "master"
    ? (body.publisher_id ?? auth.userId)
    : auth.userId

  if (!title || !price_krw) {
    return NextResponse.json({ error: "필수 항목을 입력해주세요." }, { status: 400 })
  }

  // Stripe 상품 + 가격 동적 생성
  let stripePrice: { id: string }
  try {
    const { stripe } = await import("@/lib/stripe")
    const stripeProduct = await stripe.products.create({ name: title })
    stripePrice = await stripe.prices.create({
      product:     stripeProduct.id,
      unit_amount: price_krw,   // 원화 (KRW, 최소 단위 = 1원)
      currency:    "krw",
    })
  } catch (e) {
    console.error("[market/items] stripe error:", e)
    return NextResponse.json(
      { error: e instanceof Error ? `결제 상품 생성 실패: ${e.message}` : "결제 상품 생성 실패" },
      { status: 502 },
    )
  }

  const { data, error } = await adminSupabase
    .from("market_items")
    .insert({
      title,
      description:      description ?? "",
      image_url:        image_url   ?? null,
      link_url:         link_url.trim(),
      price_krw,
      category_id:      category_id ?? null,
      publisher_id,
      stripe_price_id:  stripePrice.id,
      game_bonus_rate,
      content_type:     content_type ?? "ebook",
      data_source_type: data_source_type ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
