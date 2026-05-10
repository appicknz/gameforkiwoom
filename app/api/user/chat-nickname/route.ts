export const dynamic = "force-dynamic"
import { adminSupabase } from "@/lib/supabase-admin"
import { getUserIdFromToken } from "@/lib/auth"
import { NextResponse } from "next/server"

function extractToken(req: Request): string | null {
  const auth = req.headers.get("authorization")
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null
}

export async function GET(req: Request) {
  const token = extractToken(req)
  const userId = token ? await getUserIdFromToken(token) : null
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await adminSupabase
    .from("profiles")
    .select("chat_nickname")
    .eq("id", userId)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ chat_nickname: data?.chat_nickname ?? "" })
}

export async function POST(req: Request) {
  const token = extractToken(req)
  const userId = token ? await getUserIdFromToken(token) : null
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { chat_nickname } = await req.json()

  if (!chat_nickname || typeof chat_nickname !== "string" || chat_nickname.length > 20) {
    return NextResponse.json({ error: "Invalid nickname" }, { status: 400 })
  }

  const { error } = await adminSupabase
    .from("profiles")
    .update({ chat_nickname })
    .eq("id", userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, chat_nickname })
}
