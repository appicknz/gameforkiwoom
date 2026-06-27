export const dynamic = "force-dynamic"
import "server-only"
import { getAdminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"

const TEMP_PASSWORD = "000000"

export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  // master 권한만 허용
  const supabase = getAdminSupabase()
  const { data: me } = await supabase
    .from("profiles").select("role").eq("id", auth.userId).single()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!me || (me as any).role !== "master") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: "userId가 필요합니다." }, { status: 400 })

  // 대상 유저 확인
  const { data: target } = await supabase
    .from("profiles").select("id, username").eq("id", userId).single()
  if (!target) return NextResponse.json({ error: "유저를 찾을 수 없습니다." }, { status: 404 })

  // Supabase Auth 비밀번호를 000000으로 변경 (getAdminSupabase 직접 사용 — Proxy 체이닝 문제 방지)
  const { error: pwErr } = await supabase.auth.admin.updateUserById(userId, {
    password: TEMP_PASSWORD,
  })

  if (pwErr) {
    console.log("[v0] reset-password-direct pwErr:", pwErr.message)
    return NextResponse.json({ error: `비밀번호 변경 실패: ${pwErr.message}` }, { status: 500 })
  }

  // profiles: must_change_password 플래그 설정
  const { error: profileErr } = await supabase
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", userId)

  if (profileErr) {
    console.log("[v0] reset-password-direct profileErr:", profileErr.message)
  }

  return NextResponse.json({ success: true })
}
