export const dynamic = "force-dynamic"
import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"

const TEMP_PASSWORD = "000000"

export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // master 권한만 허용
  const { data: me } = await adminSupabase
    .from("profiles").select("role").eq("id", auth.userId).single()
  if (!me || me.role !== "master") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 })

  // 대상 유저 확인
  const { data: target } = await adminSupabase
    .from("profiles").select("id, username").eq("id", userId).single()
  if (!target) return NextResponse.json({ error: "유저를 찾을 수 없습니다." }, { status: 404 })

  // Supabase Auth 비밀번호를 000000으로 변경
  const { error: pwErr } = await adminSupabase.auth.admin.updateUserById(userId, {
    password: TEMP_PASSWORD,
  })
  if (pwErr) return NextResponse.json({ error: pwErr.message }, { status: 500 })

  // profiles: password_hash 동기화 + must_change_password 플래그 설정
  const hash = await bcrypt.hash(TEMP_PASSWORD, 10)
  await adminSupabase.from("profiles").update({
    password_hash: hash,
    must_change_password: true,
  }).eq("id", userId)

  return NextResponse.json({ success: true })
}
