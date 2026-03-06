import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? ""

// 지점 목록 조회
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'JWT token required' }, { status: 401 })
  }

  const token = authHeader.slice(7)
  const [userId] = token.split(':')
  if (!userId) {
    return NextResponse.json({ error: 'Invalid token format' }, { status: 401 })
  }

  // 요청자 역할 확인 (master/super_admin만 지점 조회 가능)
  const { data: requester } = await adminSupabase
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .single()

  if (!requester || !['master', 'super_admin'].includes(requester.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
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
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'JWT token required' }, { status: 401 })
  }

  const token = authHeader.slice(7)
  const [userId, password] = token.split(':')
  if (!userId || !password) {
    return NextResponse.json({ error: 'Invalid token format' }, { status: 401 })
  }

  // 요청자 역할 확인 (master/super_admin만 지점 생성 가능)
  const { data: requester } = await adminSupabase
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .single()

  if (!requester || !['master', 'super_admin'].includes(requester.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const { name, code, ownerUsername } = body

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
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'JWT token required' }, { status: 401 })
  }

  const token = authHeader.slice(7)
  const [userId] = token.split(':')
  if (!userId) {
    return NextResponse.json({ error: 'Invalid token format' }, { status: 401 })
  }

  // 요청자 역할 확인 (master/super_admin만 지점 삭제 가능)
  const { data: requester } = await adminSupabase
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .single()

  if (!requester || !['master', 'super_admin'].includes(requester.role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")

  const { error } = await adminSupabase.from("branches").delete().eq("id", id!)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
