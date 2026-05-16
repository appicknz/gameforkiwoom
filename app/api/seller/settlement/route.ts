export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

const SELLER_ROLES = ["master", "super_admin", "branch_admin", "admin", "seller"]

async function checkPermission(auth: { ok: boolean; userId: string }) {
  const { data: profile } = await adminSupabase
    .from("profiles").select("role").eq("id", auth.userId).single()
  if (profile && SELLER_ROLES.includes(profile.role)) return true
  const { data: perm } = await adminSupabase
    .from("write_permission_requests" as never)
    .select("status").eq("user_id", auth.userId).eq("status", "approved")
    .maybeSingle() as { data: { status: string } | null; error: unknown }
  return !!perm
}

// GET: 정산 데이터 + 정산수단 목록
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "인증 필요" }, { status: 401 })
  if (!(await checkPermission(auth))) return NextResponse.json({ error: "권한 없음" }, { status: 403 })

  // 내 상품 ID 목록
  const { data: myItems } = await adminSupabase
    .from("market_items")
    .select("id, title, game_bonus_rate")
    .eq("publisher_id", auth.userId)

  const itemIds = (myItems ?? []).map((i: any) => i.id)
  const itemMap: Record<string, any> = {}
  for (const i of myItems ?? []) itemMap[i.id] = i

  // 내 상품에 대한 paid 주문 (일별 집계용)
  let rows: any[] = []
  if (itemIds.length > 0) {
    const { data } = await adminSupabase
      .from("market_orders")
      .select("id, item_id, price_krw, bonus_credited, paid_at, created_at")
      .in("item_id", itemIds)
      .not("paid_at", "is", null)
      .order("paid_at", { ascending: false })
    rows = data ?? []
  }

  // 일별 집계
  const dailyMap: Record<string, { date: string; sales: number; bonus: number; count: number }> = {}
  for (const o of rows) {
    const date = (o.paid_at ?? o.created_at)?.slice(0, 10)
    if (!date) continue
    if (!dailyMap[date]) dailyMap[date] = { date, sales: 0, bonus: 0, count: 0 }
    const price = o.price_krw ?? 0
    const rate  = itemMap[o.item_id]?.game_bonus_rate ?? 0
    dailyMap[date].sales  += price
    dailyMap[date].bonus  += Math.floor(price * rate / 100)
    dailyMap[date].count  += 1
  }
  const daily = Object.values(dailyMap).sort((a, b) => b.date.localeCompare(a.date))

  // 정산수단 목록
  const { data: methods } = await adminSupabase
    .from("settlement_methods")
    .select("id, label, info, created_at")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })

  const totalSales = daily.reduce((s, d) => s + d.sales, 0)
  const totalBonus = daily.reduce((s, d) => s + d.bonus, 0)

  return NextResponse.json({ daily, methods: methods ?? [], totalSales, totalBonus })
}

// POST: 정산수단 등록
export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "인증 필요" }, { status: 401 })
  if (!(await checkPermission(auth))) return NextResponse.json({ error: "권한 없음" }, { status: 403 })

  const { label, info } = await req.json()
  if (!label?.trim() || !info?.trim()) {
    return NextResponse.json({ error: "항목과 정보를 모두 입력해주세요." }, { status: 400 })
  }

  const { data, error } = await adminSupabase
    .from("settlement_methods")
    .insert({ user_id: auth.userId, label: label.trim(), info: info.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ method: data })
}

// DELETE: 정산수단 삭제
export async function DELETE(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "인증 필요" }, { status: 401 })

  const { id } = await req.json()
  await adminSupabase
    .from("settlement_methods")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.userId)

  return NextResponse.json({ ok: true })
}
