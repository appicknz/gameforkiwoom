export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "인증 필요" }, { status: 401 })

  const { item, info } = await req.json()
  if (!item?.trim() || !info?.trim())
    return NextResponse.json({ error: "항목과 정보를 입력해주세요." }, { status: 400 })

  const { data, error } = await adminSupabase
    .from("settlement_methods")
    .insert({ user_id: auth.userId, item: item.trim(), info: info.trim() })
    .select("id, item, info, created_at")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ method: data })
}

export async function DELETE(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "인증 필요" }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: "id 필요" }, { status: 400 })

  await adminSupabase
    .from("settlement_methods")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.userId)

  return NextResponse.json({ ok: true })
}
