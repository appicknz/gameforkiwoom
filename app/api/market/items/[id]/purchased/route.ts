export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

// GET: 현재 로그인 유저가 해당 아이템을 구매(status=paid)했는지 확인
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ purchased: false })

  const { id } = await params

  const { data } = await adminSupabase
    .from("market_orders")
    .select("id")
    .eq("item_id", id)
    .eq("buyer_id", auth.userId)
    .eq("status", "paid")
    .limit(1)
    .single()

  return NextResponse.json({ purchased: !!data })
}
