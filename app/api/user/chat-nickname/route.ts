import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

async function getUserFromToken(req: Request) {
  const auth = req.headers.get("authorization")
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null
  if (!token) return null
  const { data: { user } } = await adminSupabase.auth.getUser(token)
  return user ?? null
}

export async function GET(req: Request) {
  const user = await getUserFromToken(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data, error } = await adminSupabase
    .from("profiles")
    .select("chat_nickname")
    .eq("id", user.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ chat_nickname: data?.chat_nickname ?? "" })
}

export async function POST(req: Request) {
  const user = await getUserFromToken(req)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { chat_nickname } = await req.json()

  if (!chat_nickname || typeof chat_nickname !== "string" || chat_nickname.length > 20) {
    return NextResponse.json({ error: "Invalid nickname" }, { status: 400 })
  }

  const { error } = await adminSupabase
    .from("profiles")
    .update({ chat_nickname })
    .eq("id", user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, chat_nickname })
}
