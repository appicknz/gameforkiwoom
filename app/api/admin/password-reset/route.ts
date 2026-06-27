export const dynamic = "force-dynamic"
import "server-only"
import { getAdminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = getAdminSupabase() as any
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"

// GET: 목록
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: me } = await adminSupabase.from("profiles").select("role").eq("id", auth.userId).single()
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ALLOWED = ["master", "super_admin", "branch_admin", "admin"]
  if (!ALLOWED.includes(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let query = adminSupabase
    .from("password_reset_requests")
    .select(`
      id, requester_id, status, memo, created_at, approved_at,
      requester:profiles!requester_id(username),
      approver:profiles!approver_id(username),
      target_user:profiles!target_user_id(username, id)
    `)
    .order("created_at", { ascending: false })
    .limit(100)

  if (!["master", "super_admin"].includes(me.role)) {
    query = query.eq("requester_id", auth.userId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: data })
}

// POST: 초기화 요청 생성 (admin/branch_admin)
export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: me } = await adminSupabase.from("profiles").select("role").eq("id", auth.userId).single()
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ALLOWED = ["branch_admin", "admin"]
  if (!ALLOWED.includes(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { targetUsername, memo } = await req.json()
  if (!targetUsername) return NextResponse.json({ error: "대상 아이디를 입력해주세요." }, { status: 400 })

  const { data: target } = await adminSupabase
    .from("profiles").select("id, role").eq("username", targetUsername).single()
  if (!target) return NextResponse.json({ error: "존재하지 않는 아이디입니다." }, { status: 404 })
  if (target.role !== "user") return NextResponse.json({ error: "유저 계정만 초기화 가능합니다." }, { status: 400 })

  const { data, error } = await adminSupabase.from("password_reset_requests").insert({
    requester_id: auth.userId,
    target_user_id: target.id,
    status: "pending",
    memo: memo ?? null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: data })
}

// PATCH: 승인 (master/super_admin) — 새 임시 비밀번호 직접 설정
export async function PATCH(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: me } = await adminSupabase.from("profiles").select("role").eq("id", auth.userId).single()
  if (!me || !["master", "super_admin"].includes(me.role)) {
    return NextResponse.json({ error: "승인 권한이 없습니다." }, { status: 403 })
  }

  const { requestId, action, newPassword } = await req.json()
  if (!requestId) return NextResponse.json({ error: "requestId 필요" }, { status: 400 })

  if (action === "reject") {
    await adminSupabase.from("password_reset_requests")
      .update({ status: "rejected", approver_id: auth.userId, approved_at: new Date().toISOString() })
      .eq("id", requestId).eq("status", "pending")
    return NextResponse.json({ success: true })
  }

  const { data: prr } = await adminSupabase.from("password_reset_requests")
    .select("*").eq("id", requestId).eq("status", "pending").single()
  if (!prr) return NextResponse.json({ error: "요청을 찾을 수 없습니다." }, { status: 404 })

  // 비밀번호를 000000으로 고정 초기화
  const TEMP_PASSWORD = "000000"
  const { error: pwErr } = await adminSupabase.auth.admin.updateUserById(
    prr.target_user_id, { password: TEMP_PASSWORD }
  )
  if (pwErr) return NextResponse.json({ error: pwErr.message }, { status: 500 })

  // profiles에 bcrypt 해시 업데이트 + 다음 로그인 시 강제 비밀번호 변경 플래그 설정
  const hash = await bcrypt.hash(TEMP_PASSWORD, 10)
  await adminSupabase.from("profiles").update({
    password_hash: hash,
    must_change_password: true,
  }).eq("id", prr.target_user_id)

  // 요청 상태 업데이트
  await adminSupabase.from("password_reset_requests").update({
    status: "approved",
    approver_id: auth.userId,
    approved_at: new Date().toISOString(),
  }).eq("id", requestId)

  return NextResponse.json({ success: true })
}
