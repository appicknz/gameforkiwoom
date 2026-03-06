import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? ""

// 지점 목록 조회
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const pw = searchParams.get("pw")
  if (pw !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data, error } = await adminSupabase
    .from("branches")
    .select("id, code, name, status, owner_email, created_at")
    .order("created_at", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ branches: data ?? [] })
}

// 지점 생성 (super_admin/master 전용)
// ownerUsername: 해당 유저를 branch_admin으로 승격하고 owner_email에 기록
export async function POST(req: Request) {
  const body = await req.json()
  const { pw, name, code, ownerUsername } = body

  if (pw !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!name || !code || !ownerUsername) {
    return NextResponse.json({ error: "지점명, 코드, 관리자 아이디를 모두 입력하세요." }, { status: 400 })
  }

  // 코드 중복 확인
  const { data: existing } = await adminSupabase
    .from("branches")
    .select("id")
    .eq("code", code.toUpperCase())
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: "이미 사용 중인 지점코드입니다." }, { status: 409 })
  }

  // ownerUsername이 있으면 해당 유저 조회
  let ownerEmail: string | null = null
  if (ownerUsername) {
    const { data: ownerProfile } = await adminSupabase
      .from("profiles")
      .select("id, username")
      .eq("username", ownerUsername)
      .maybeSingle()

    if (!ownerProfile) {
      return NextResponse.json({ error: "해당 아이디의 회원을 찾을 수 없습니다." }, { status: 404 })
    }

    // 지점 관리자로 role 승격 및 branch_code 설정
    await adminSupabase
      .from("profiles")
      .update({ role: "branch_admin", branch_code: code.toUpperCase() })
      .eq("id", ownerProfile.id)

    ownerEmail = ownerProfile.username
  }

  const { data, error } = await adminSupabase
    .from("branches")
    .insert({ name, code: code.toUpperCase(), status: "approved", owner_email: ownerEmail })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ branch: data })
}

// 지점 삭제
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const pw = searchParams.get("pw")
  const id = searchParams.get("id")

  if (pw !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { error } = await adminSupabase.from("branches").delete().eq("id", id!)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
