import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

export const runtime = "nodejs"

// GET: 내 수수료 잔고 조회
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await adminSupabase
    .from("commission_balances")
    .select("amount, role, updated_at")
    .eq("user_id", auth.userId)
    .single()

  if (error && error.code !== "PGRST116") {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ balance: data?.amount ?? 0, role: data?.role ?? null })
}
