export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

// master만 메뉴 그룹 활성화 변경 가능
export async function PATCH(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "인증 필요" }, { status: 401 })

  const { data: caller } = await adminSupabase
    .from("profiles").select("role").eq("id", auth.userId).single()

  if (!caller || caller.role !== "master") {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
  }

  const { userId, group1, group2, group3 } = await req.json()
  if (!userId) return NextResponse.json({ error: "userId 필수" }, { status: 400 })

  const update: Record<string, boolean> = {}
  if (typeof group1 === "boolean") update.menu_group1 = group1
  if (typeof group2 === "boolean") update.menu_group2 = group2
  if (typeof group3 === "boolean") update.menu_group3 = group3

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "변경할 그룹 값이 없습니다." }, { status: 400 })
  }

  const { error } = await adminSupabase
    .from("profiles")
    .update(update)
    .eq("id", userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
