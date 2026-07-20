import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getUserIdFromToken(req: Request): string | null {
  try {
    const auth = req.headers.get("Authorization") ?? ""
    const token = auth.replace("Bearer ", "").trim()
    if (!token) return null
    return JSON.parse(atob(token.split(".")[1]))?.sub ?? null
  } catch { return null }
}

export async function GET(req: Request) {
  const userId = getUserIdFromToken(req)
  if (!userId) {
    return NextResponse.json({ group1: false, group2: false, group3: false })
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("menu_group1, menu_group2, menu_group3")
    .eq("id", userId)
    .single()

  if (error || !data) {
    return NextResponse.json({ group1: false, group2: false, group3: false })
  }

  return NextResponse.json({
    group1: !!data.menu_group1,
    group2: !!data.menu_group2,
    group3: !!data.menu_group3,
  })
}
