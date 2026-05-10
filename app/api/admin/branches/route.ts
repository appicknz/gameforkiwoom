export const dynamic = "force-dynamic"
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
    // branches.owner_email 에는 username이 저장됨 (이메일 아님)
    query = query.eq("owner_email", requester.username)
  } else if (requester.role === 'admin' && requester.branch_code) {
    // 지점 관리자: 자기 지점만
    query = query.eq("code", requester.branch_code)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const branches = data ?? []

  // branch_admin 전용: 각 지점의 누적 지급 포인트 + 현재 유저 포인트 합계 계산
  if (requester.role === 'branch_admin' && branches.length > 0) {
    const enriched = await Promise.all(branches.map(async (branch: any) => {
      // 해당 지점의 admin 계정 userId 조회
      const { data: adminProfiles } = await adminSupabase
        .from("profiles")
        .select("id")
        .eq("role", "admin")
        .eq("branch_code", branch.code)

      const adminIds = (adminProfiles ?? []).map((p: any) => p.id)

      // 누적 지급 포인트: 총판이 이 지점 admin에게 승인한 point_purchase_requests 합계
      let totalGranted = 0
      if (adminIds.length > 0 ) {
        const { data: purchaseRows } = await adminSupabase
          .from("point_purchase_requests")
          .select("point_amount")
          .in("requester_id", adminIds)
          .eq("status", "approved")
        totalGranted = (purchaseRows ?? []).reduce((s: number, r: any) => s + (r.point_amount ?? 0), 0)
      }

      // 현재 지점 소속 유저(일반 user)들의 포인트 합계
      const { data: userProfiles } = await adminSupabase
        .from("profiles")
        .select("id")
        .eq("branch_code", branch.code)
        .eq("role", "user")
      const userIds = (userProfiles ?? []).map((p: any) => p.id)

      let totalUserPoints = 0
      if (userIds.length > 0) {
        const { data: balanceRows } = await adminSupabase
          .from("balances")
          .select("amount")
          .in("user_id", userIds)
        totalUserPoints = (balanceRows ?? []).reduce((s: number, b: any) => s + (b.amount ?? 0), 0)
      }

      return { ...branch, total_granted: totalGranted, total_user_points: totalUserPoints }
    }))

    return NextResponse.json({ branches: enriched })
  }

  return NextResponse.json({ branches })
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
  const { name, code, ownerUsername, password } = body

  if (!name || !code) {
    return NextResponse.json({ error: "지점명과 코드를 입력하세요." }, { status: 400 })
  }

  // branch_admin이 지점 생성 시 비밀번호 필수
  if (requester.role === 'branch_admin' && !password?.trim()) {
    return NextResponse.json({ error: "비밀번호를 입력하세요." }, { status: 400 })
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

  // branch_admin이 생성한 경우: 지점코드를 아이디, 입력 비밀번호로 admin 계정 자동 생성
  if (requester.role === 'branch_admin' && password?.trim()) {
    const { randomUUID } = await import("crypto")
    const uid = randomUUID()
    const email = `${uid}@noreply.app`
    const upperCode = code.toUpperCase()

    // 이미 같은 username(지점코드)이 있으면 생성 건너뜀
    const { data: dup } = await adminSupabase.from("profiles").select("id").eq("username", upperCode).maybeSingle()
    if (!dup) {
      const { data: authUser, error: authErr } = await adminSupabase.auth.admin.createUser({
        email,
        password: password.trim(),
        email_confirm: true,
        // role을 metadata에 명시 → handle_new_user 트리거가 올바른 role로 profiles INSERT
        user_metadata: { username: upperCode, role: "admin", branch_code: upperCode },
      })
      if (!authErr && authUser.user) {
        const adminUserId = authUser.user.id
        // 트리거 이후 branch_id(총판 ID) 추가 업데이트
        await adminSupabase.from("profiles").update({
          branch_id: requester.id,
        }).eq("id", adminUserId)
      }
    }
  }

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
