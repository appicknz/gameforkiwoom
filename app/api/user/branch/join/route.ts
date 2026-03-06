import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const authHeader = req.headers.get("Authorization")
  const token = authHeader?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // JWT 검증 (서버에서만 - 위변조 방지)
  const { data: { user }, error: authError } = await adminSupabase.auth.getUser(token)
  if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json()
  const { branchCode } = body

  if (!branchCode || typeof branchCode !== "string") {
    return NextResponse.json({ error: "지점코드를 입력하세요." }, { status: 400 })
  }

  // 지점코드 유효성 확인
  const { data: branch } = await adminSupabase
    .from("branches")
    .select("id, name, code")
    .eq("code", branchCode.trim().toUpperCase())
    .single()

  if (!branch) {
    return NextResponse.json({ error: "존재하지 않는 지점코드입니다." }, { status: 404 })
  }

  // profiles.branch_code 업데이트
  const { error: updateError } = await adminSupabase
    .from("profiles")
    .update({ branch_code: branch.code })
    .eq("id", user.id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  return NextResponse.json({ success: true, branchName: branch.name })
}
