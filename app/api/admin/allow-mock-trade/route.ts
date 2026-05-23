export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

// master만 allow_mock_trade 변경 가능
export async function PATCH(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "인증 필요" }, { status: 401 })

  const { data: caller } = await adminSupabase
    .from("profiles").select("role").eq("id", auth.userId).single()

  if (!caller || caller.role !== "master") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
  }

  const { userId, allow } = await req.json()
  if (!userId || typeof allow !== "boolean") {
    return NextResponse.json({ error: "userId, allow 필수" }, { status: 400 })
  }

  const { error } = await adminSupabase
    .from("profiles")
    .update({ allow_mock_trade: allow })
    .eq("id", userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
