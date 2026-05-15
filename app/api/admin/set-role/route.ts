export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"

// master/super_admin만 다른 유저 role 변경 가능
// master는 모든 role 부여 가능
// super_admin은 admin 이하만 부여 가능

const ASSIGNABLE_BY_MASTER    = ["user", "seller", "admin", "branch_admin", "super_admin"]
const ASSIGNABLE_BY_SUPER     = ["user", "seller", "admin", "branch_admin"]

export async function PATCH(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: "인증 필요" }, { status: 401 })

  const { data: caller } = await adminSupabase
    .from("profiles").select("role").eq("id", auth.userId).single()

  if (!caller || !["master", "super_admin"].includes(caller.role)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
  }

  const { userId, role } = await req.json()
  if (!userId || !role) return NextResponse.json({ error: "userId, role 필수" }, { status: 400 })

  const allowed = caller.role === "master" ? ASSIGNABLE_BY_MASTER : ASSIGNABLE_BY_SUPER
  if (!allowed.includes(role)) {
    return NextResponse.json({ error: `해당 역할(${role})을 부여할 권한이 없습니다.` }, { status: 403 })
  }

  // master 계정은 변경 불가
  const { data: target } = await adminSupabase
    .from("profiles").select("role, username").eq("id", userId).single()

  if (!target) return NextResponse.json({ error: "대상 유저를 찾을 수 없습니다." }, { status: 404 })
  if (target.role === "master") {
    return NextResponse.json({ error: "master 계정은 변경할 수 없습니다." }, { status: 403 })
  }

  const { error } = await adminSupabase
    .from("profiles").update({ role }).eq("id", userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, username: target.username, newRole: role })
}
