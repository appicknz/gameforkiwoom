import { createClient } from "@/lib/supabase/server"
import { createClient as createAdmin } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const admin = createAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await admin
    .from("profiles")
    .select("role, username, branch_id")
    .eq("id", user.id)
    .single()

  if (!profile || profile.role !== "branch_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { data: branch } = await admin
    .from("branches")
    .select("id, name, code, status")
    .eq("id", profile.branch_id)
    .single()

  return NextResponse.json({
    adminName: profile.username ?? "관리자",
    branch,
  })
}
