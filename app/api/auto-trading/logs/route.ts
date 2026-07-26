export const dynamic = "force-dynamic"

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import { verifySession } from "@/lib/auth"

export async function GET(req: Request) {
  const session = await verifySession(req)
  if (!session || !["master", "admin"].includes(session.role ?? "")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  const url    = new URL(req.url)
  const limit  = Math.min(Number(url.searchParams.get("limit") ?? 100), 500)
  const offset = Number(url.searchParams.get("offset") ?? 0)

  const { data, error } = await adminSupabase
    .from("auto_trading_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ logs: data ?? [] })
}
