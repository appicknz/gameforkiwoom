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
    .from("tg_deposit_requests")
    .select("id,amount,memo,status,created_at")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ requests: [] })

  return NextResponse.json({ requests: data ?? [] })
}
