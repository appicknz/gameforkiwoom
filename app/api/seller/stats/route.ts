export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

const SELLER_ROLES = ["master", "super_admin", "branch_admin", "admin", "seller"]

export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "인증 필요" }, { status: 401 })

  const { data: profile } = await adminSupabase
    .from("profiles").select("role").eq("id", auth.userId).single()

  if (!profile || !SELLER_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
  }

  // 내 상품 목록 (비활성 포함)
  const { data: items } = await adminSupabase
    .from("market_items")
    .select("id, title, image_url, price_krw, view_count, order_count, is_active, created_at, category_id, market_categories(name, icon)")
    .eq("publisher_id", auth.userId)
    .order("created_at", { ascending: false }) as { data: any[] | null }

  const safeItems = items ?? []

  // 내 상품에 대한 주문 내역
  const itemIds = safeItems.map((i: any) => i.id)
  let orders: any[] = []
  if (itemIds.length > 0) {
    const { data: orderRows } = await adminSupabase
      .from("market_orders")
      .select("id, item_id, amount_krw, status, created_at")
      .in("item_id", itemIds)
      .order("created_at", { ascending: false })
    orders = orderRows ?? []
  }

  // 집계
  const totalRevenue   = orders.filter((o: any) => o.status === "paid").reduce((s: number, o: any) => s + (o.amount_krw ?? 0), 0)
  const totalOrders    = orders.filter((o: any) => o.status === "paid").length
  const totalViews     = safeItems.reduce((s: number, i: any) => s + (i.view_count ?? 0), 0)
  const activeItems    = safeItems.filter((i: any) => i.is_active).length

  // 최근 30일 일별 매출
  const now = new Date()
  const dailyMap: Record<string, number> = {}
  for (let d = 29; d >= 0; d--) {
    const dt = new Date(now); dt.setDate(now.getDate() - d)
    const key = dt.toISOString().slice(0, 10)
    dailyMap[key] = 0
  }
  for (const o of orders.filter((o: any) => o.status === "paid")) {
    const key = o.created_at?.slice(0, 10)
    if (key && key in dailyMap) dailyMap[key] += o.amount_krw ?? 0
  }
  const dailySales = Object.entries(dailyMap).map(([date, revenue]) => ({ date, revenue }))

  return NextResponse.json({
    items:        safeItems,
    orders,
    stats: { totalRevenue, totalOrders, totalViews, activeItems, totalItems: safeItems.length },
    dailySales,
  })
}
