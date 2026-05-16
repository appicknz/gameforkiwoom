export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

// GET: 내 주문 목록 (buyer) 또는 발행자 주문 목록
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: 401 })

  const url  = new URL(req.url)
  const mode = url.searchParams.get("mode") ?? "buyer" // buyer | publisher

  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("role")
    .eq("id", auth.userId)
    .single()

  let query = adminSupabase
    .from("market_orders")
    .select(`
      id, status, price_krw, bonus_amount, memo, paid_at, approved_at, rejected_at, reject_reason, created_at,
      buyer_id, publisher_id,
      market_items(id, title, image_url, link_url, market_categories(balance_only))
    `)
    .order("created_at", { ascending: false })

  if (mode === "publisher" && (profile?.role === "master" || profile?.role === "super_admin" || profile?.role === "branch_admin" || profile?.role === "admin")) {
    query = query.eq("publisher_id", auth.userId)
  } else {
    query = query.eq("buyer_id", auth.userId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = data ?? []

  // buyer/publisher username 별도 조회 (FK 조인 대신)
  const ids = [...new Set([...rows.map((r: any) => r.buyer_id), ...rows.map((r: any) => r.publisher_id)].filter(Boolean))]
  const profileMap: Record<string, string> = {}
  if (ids.length > 0) {
    const { data: profiles } = await adminSupabase.from("profiles").select("id, username").in("id", ids)
    profiles?.forEach((p: any) => { profileMap[p.id] = p.username })
  }

  const orders = rows.map((r: any) => ({
    ...r,
    buyer:     { username: profileMap[r.buyer_id] ?? null },
    publisher: { username: profileMap[r.publisher_id] ?? null },
  }))

  return NextResponse.json({ orders })
}
