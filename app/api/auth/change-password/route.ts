export const dynamic = "force-dynamic"
import "server-only"
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
import bcrypt from "bcryptjs"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any

// POST: 본인 비밀번호 변경 (강제 변경 포함)
// body: { currentPassword, newPassword }
export async function POST(req: Request) {
  const session = await verifySession(req).catch(() => null)
  if (!session?.ok) return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 })

  const { currentPassword, newPassword } = await req.json()

  if (!newPassword || newPassword.length < 4) {
    return NextResponse.json({ error: "새 비밀번호는 4자 이상이어야 합니다." }, { status: 400 })
  }
  if (newPassword === "000000") {
    return NextResponse.json({ error: "000000은 사용할 수 없습니다. 다른 비밀번호를 입력해주세요." }, { status: 400 })
  }

  // 현재 비밀번호 검증 (must_change_password가 true인 경우에도 기존 000000 확인)
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("id, password_hash, must_change_password")
    .eq("id", session.userId)
    .single()

  if (!profile) return NextResponse.json({ error: "사용자를 찾을 수 없습니다." }, { status: 404 })

  const valid = await bcrypt.compare(currentPassword ?? "", profile.password_hash ?? "")
  if (!valid) return NextResponse.json({ error: "현재 비밀번호가 올바르지 않습니다." }, { status: 400 })

  // Supabase Auth 비밀번호 변경
  const { error: pwErr } = await adminSupabase.auth.admin.updateUserById(
    session.userId, { password: newPassword }
  )
  if (pwErr) return NextResponse.json({ error: pwErr.message }, { status: 500 })

  // profiles bcrypt 해시 업데이트 + 강제 변경 플래그 해제
  const hash = await bcrypt.hash(newPassword, 10)
  await adminSupabase.from("profiles").update({
    password_hash: hash,
    must_change_password: false,
  }).eq("id", session.userId)

  return NextResponse.json({ success: true })
}
