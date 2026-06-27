import "server-only"
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const session = await verifySession(req).catch(() => null)
  if (!session?.ok) {
    return NextResponse.json({ role: null, userId: null })
  }

  // 항상 DB에서 role 조회 (JWT 클레임 신뢰 불가)
  const { data } = await adminSupabase
    .from("profiles")
    .select("role, username, must_change_password")
    .eq("id", session.userId)
    .single()
  const role               = data?.role               ?? session.role ?? "user"
  const username           = data?.username           ?? null
  const mustChangePassword = data?.must_change_password ?? false

  return NextResponse.json({ role, userId: session.userId, username, mustChangePassword })
}
