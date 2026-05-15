export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"
import { adminSupabase } from "@/lib/supabase-admin"

const MASTER_ROLES = ["master", "super_admin", "branch_admin", "admin"]

// PATCH: 특정 유저의 game_enabled 토글 (master/admin 전용)
export async function PATCH(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "인증 필요" }, { status: 401 })

  const { data: me } = await adminSupabase
    .from("profiles").select("role").eq("id", auth.userId).single()

  if (!me || !MASTER_ROLES.includes(me.role)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
  }

  const { userId, game_enabled } = await req.json()
  if (!userId || typeof game_enabled !== "boolean") {
    return NextResponse.json({ error: "userId, game_enabled 필수" }, { status: 400 })
  }

  const { data, error } = await adminSupabase
    .from("profiles")
    .update({ game_enabled })
    .eq("id", userId)
    .select("id, username, game_enabled")
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, profile: data })
}
