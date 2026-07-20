import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ADMIN_ROLES = ["master", "super_admin", "branch_admin", "admin"]

function getRoleFromToken(req: Request): string | null {
  try {
    const auth = req.headers.get("Authorization") ?? ""
    const token = auth.replace("Bearer ", "").trim()
    if (!token) return null
    return JSON.parse(atob(token.split(".")[1]))?.role ?? null
  } catch { return null }
}

export async function PATCH(req: Request) {
  const role = getRoleFromToken(req)
  if (!role || !ADMIN_ROLES.includes(role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { userId, group1, group2, group3 } = await req.json()
  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  const { error } = await supabase
    .from("profiles")
    .update({
      menu_group1: !!group1,
      menu_group2: !!group2,
      menu_group3: !!group3,
    })
    .eq("id", userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
