import { NextResponse } from "next/server"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { verifySession } from "@/lib/auth"

/** PATCH /api/admin/update-tg-bet-amount — 텔레그램 고정 주문금액 설정 */
export async function PATCH(req: Request) {
  const session = await verifySession(req)
  if (!session.ok || !["master", "admin"].includes(session.role ?? "")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const { userId, amount } = await req.json()
  if (!userId || typeof amount !== "number" || amount <= 0) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 })
  }

  const { error } = await adminSupabase
    .from("profiles")
    .update({ tg_bet_amount: amount })
    .eq("id", userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, amount })
}
