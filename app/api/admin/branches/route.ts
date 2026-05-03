import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"

const SUPER_ROLES = ['master', 'super_admin']
const ALLOWED_ROLES = ['master', 'super_admin', 'branch_admin', 'admin']

// 지점 목록 조회
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: requester } = await adminSupabase
    .from('profiles')
    .select('id, role, branch_code, username')
    .eq('id', auth.userId)
    .single()

  if (!requester || !ALLOWED_ROLES.includes(requester.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let query = adminSupabase
    .from("branches")
    .select("id, code, name, status, owner_email, created_at, betting_mode, lp_enabled, lp_amount")
    .order("created_at", { ascending: false })

  if (requester.role === 'branch_admin') {
    // 총판: 자신이 owner인 지점 전체 조회
    query = query.eq("owner_email", requester.username)
  } else if (requester.role === 'admin' && requester.branch_code) {
    // 지점 관리자: 자기 지점만
    query = query.eq("code", requester.branch_code)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ branches: data ?? [] })
}

// 지점 생성 (master/super_admin/branch_admin)
export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: requester } = await adminSupabase
    .from('profiles')
    .select('id, role, username')
    .eq('id', auth.userId)
    .single()

  const canCreate = ['master', 'super_admin', 'branch_admin']
  if (!requester || !canCreate.includes(requester.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const { name, code, ownerUsername } = body

  if (!name || !code) {
    return NextResponse.json({ error: "지점명과 코드를 입력하세요." }, { status: 400 })
  }

  // master/super_admin은 ownerUsername 필수, branch_admin은 자기 자신이 owner
  const isSuperRole = SUPER_ROLES.includes(requester.role)
  if (isSuperRole && !ownerUsername) {
    return NextResponse.json({ error: "관리자 아이디를 입력하세요." }, { status: 400 })
  }

  const { data: existing } = await adminSupabase
    .from("branches")
    .select("id")
    .eq("code", code.toUpperCase())
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: "이미 사용 중인 지점코드입니다." }, { status: 409 })
  }

  let ownerName = requester.username

  if (isSuperRole) {
    const { data: ownerProfile } = await adminSupabase
      .from("profiles")
      .select("id, username")
      .eq("username", ownerUsername)
      .maybeSingle()

    if (!ownerProfile) {
      return NextResponse.json({ error: "해당 아이디의 회원을 찾을 수 없습니다." }, { status: 404 })
    }

    await adminSupabase
      .from("profiles")
      .update({ role: "branch_admin", branch_code: code.toUpperCase() })
      .eq("id", ownerProfile.id)

    ownerName = ownerProfile.username
  }

  const { data, error } = await adminSupabase
    .from("branches")
    .insert({ name, code: code.toUpperCase(), status: "approved", owner_email: ownerName })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ branch: data })
}

// 지점 삭제 (master/super_admin만)
export async function DELETE(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: requester } = await adminSupabase
    .from('profiles')
    .select('id, role')
    .eq('id', auth.userId)
    .single()

  if (!requester || !SUPER_ROLES.includes(requester.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")

  const { error } = await adminSupabase.from("branches").delete().eq("id", id!)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
