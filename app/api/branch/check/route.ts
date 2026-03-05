import { createClient } from "@supabase/supabase-js"
import { NextRequest, NextResponse } from "next/server"

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code")
  if (!code) return NextResponse.json({ valid: false, error: "코드를 입력해주세요." })

  const { data, error } = await supabaseAdmin
    .from("branches")
    .select("id, status")
    .eq("code", code.toUpperCase())
    .single()

  if (error || !data) return NextResponse.json({ valid: false, error: "유효하지 않은 지점 코드입니다." })
  if (data.status !== "approved") return NextResponse.json({ valid: false, error: "승인되지 않은 지점 코드입니다." })

  return NextResponse.json({ valid: true })
}
