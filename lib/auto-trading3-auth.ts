import "server-only"
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"
import { adminSupabase } from "@/lib/supabase-admin"

export async function requireAutoTrading3User(req: Request) {
  const session = await verifySession(req)
  if (!session.ok) {
    return { ok: false as const, response: NextResponse.json({ error: session.error }, { status: session.status }) }
  }

  const { data: profile, error } = await adminSupabase
    .from("profiles")
    .select("username")
    .eq("id", session.userId)
    .maybeSingle()

  if (error) {
    return { ok: false as const, response: NextResponse.json({ error: "사용자 확인 실패" }, { status: 500 }) }
  }
  if (profile?.username !== "역삼1") {
    return { ok: false as const, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) }
  }

  return { ok: true as const, session }
}
