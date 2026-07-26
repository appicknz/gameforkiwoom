export const dynamic = "force-dynamic"
import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

export async function POST(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const amount = Number(body.amount)
  const memo   = String(body.memo ?? "").slice(0, 200)

  if (!amount || amount < 1000) {
    return NextResponse.json({ error: "1,000원 이상 입력하세요." }, { status: 400 })
  }

  const { data, error } = await adminSupabase
    .from("tg_deposit_requests")
    .insert({
      user_id:  session.userId,
      amount,
      memo:     memo || null,
      status:   "pending",
    })
    .select("id")
    .single()

  if (error) {
    return NextResponse.json({ error: "신청 실패: " + error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: data.id })
}
