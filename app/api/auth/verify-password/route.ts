export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"
import { adminSupabase } from "@/lib/supabase-admin"
import bcrypt from "bcryptjs"

// 현재 비밀번호가 맞는지 확인 — 비밀번호 변경 1단계에서 사용
export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { password } = await req.json()
  if (!password) return NextResponse.json({ error: "비밀번호를 입력해주세요." }, { status: 400 })

  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("password_hash")
    .eq("id", auth.userId)
    .single()

  const hash = (profile as { password_hash?: string } | null)?.password_hash ?? ""
  if (!hash) return NextResponse.json({ error: "비밀번호 정보를 찾을 수 없습니다." }, { status: 400 })

  const match = await bcrypt.compare(password, hash)
  if (!match) return NextResponse.json({ error: "현재 비밀번호가 일치하지 않습니다." }, { status: 400 })

  return NextResponse.json({ success: true })
}
