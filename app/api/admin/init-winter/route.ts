import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

// 일회성 route — 비밀번호 초기화 후 즉시 삭제
export async function GET() {
  const { error } = await adminSupabase.auth.admin.updateUserById(
    "53986eee-9833-4e96-b536-3c66a3bf041f",
    { password: process.env._W ?? "" }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
