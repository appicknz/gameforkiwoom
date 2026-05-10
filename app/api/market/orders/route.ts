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
      id, status, price_krw, paid_at, approved_at, rejected_at, reject_reason, created_at,
      market_items(id, title, image_url),
      buyer:buyer_id(username),
      publisher:publisher_id(username)
    `)
    .order("created_at", { ascending: false })

  if (mode === "publisher" && (profile?.role === "master" || profile?.role === "super_admin" || profile?.role === "branch_admin" || profile?.role === "admin")) {
    query = query.eq("publisher_id", auth.userId)
  } else {
    query = query.eq("buyer_id", auth.userId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ orders: data ?? [] })
}
