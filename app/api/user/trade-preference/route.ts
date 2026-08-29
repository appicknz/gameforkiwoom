import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data, error } = await adminSupabase
    .from("profiles")
    .select("trade_amount_percent, trade_amount_percent_locked")
    .eq("id", auth.userId)
    .single()

  if (error) return NextResponse.json({ error: "설정을 불러오지 못했습니다." }, { status: 500 })
  return NextResponse.json({
    percent: data?.trade_amount_percent ?? 25,
    locked: data?.trade_amount_percent_locked ?? false,
  })
}

export async function PATCH(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => null)
  const percent = Number(body?.percent)
  const locked = body?.locked
  if (!Number.isInteger(percent) || percent < 0 || percent > 100 || typeof locked !== "boolean") {
    return NextResponse.json({ error: "유효하지 않은 설정입니다." }, { status: 400 })
  }

  const { data, error } = await adminSupabase
    .from("profiles")
    .update({ trade_amount_percent: percent, trade_amount_percent_locked: locked })
    .eq("id", auth.userId)
    .select("trade_amount_percent, trade_amount_percent_locked")
    .single()

  if (error) return NextResponse.json({ error: "설정을 저장하지 못했습니다." }, { status: 500 })
  return NextResponse.json({ percent: data.trade_amount_percent, locked: data.trade_amount_percent_locked })
}
