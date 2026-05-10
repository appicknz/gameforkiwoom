import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: deposits } = await adminSupabase
    .from("token_deposits")
    .select("signature, token_amount, r_amount, confirmed_at, tx_url")
    .eq("user_id", auth.userId)
    .order("confirmed_at", { ascending: false })
    .limit(20)

  return NextResponse.json({ deposits: deposits ?? [] })
}
