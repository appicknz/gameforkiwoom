import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: NextRequest) {
  const { branchId, status } = await request.json()

  if (!branchId || !["approved", "rejected"].includes(status)) {
    return NextResponse.json({ error: "invalid params" }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from("branches")
    .update({ status })
    .eq("id", branchId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
