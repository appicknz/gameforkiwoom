export const dynamic = "force-dynamic"
import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"

export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data } = await adminSupabase
    .from("balances")
    .select("amount")
    .eq("user_id", auth.userId)
    .single()

  return NextResponse.json({ balance: data?.amount ?? 0 })
}
