export const dynamic = "force-dynamic"
import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

export async function GET(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data, error } = await adminSupabase
    .from("balances")
    .select("amount")
    .eq("user_id", session.userId)
    .maybeSingle()

  if (error) return NextResponse.json({ error: "잔고 조회 실패" }, { status: 500 })

  return NextResponse.json({ balance: data?.amount ?? 0 })
}
