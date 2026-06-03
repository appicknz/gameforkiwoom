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

  // JWT에 role이 있으면 바로 반환, 없으면 DB 조회
  let role = session.role ?? null
  if (!role) {
    const { data } = await adminSupabase
      .from("profiles")
      .select("role, username")
      .eq("id", session.userId)
      .single()
    role = data?.role ?? "user"
  }

  return NextResponse.json({ role, userId: session.userId })
}
