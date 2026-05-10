import { redis } from "@/lib/redis"
import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { createClient } from "@supabase/supabase-js"

  const { data: existing } = await adminSupabase
    .from("balances").select("amount").eq("user_id", userId).single()
  const newAmt = (existing?.amount ?? 0) + delta
  if (existing) {
    await adminSupabase.from("balances").update({ amount: newAmt }).eq("user_id", userId)
  } else {
    await adminSupabase.from("balances").insert({ user_id: userId, amount: newAmt })
  }
  await redis.set(`balance:${userId}`, newAmt, { ex: 3600 })
  await redis.incr(`balance_version:${userId}`)
  return newAmt
}

// 랜덤 6자리 영숫자
function randomAlphaNum(len: number) {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789"
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("")
}

// GET: 목록
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: me } = await adminSupabase.from("profiles").select("role, branch_code").eq("id", auth.userId).single()
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ALLOWED = ["master", "super_admin", "branch_admin", "admin"]
  if (!ALLOWED.includes(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let query = adminSupabase
    .from("point_charge_requests")
    .select(`
      id, requester_id, requester_role, branch_code, point_amount,
      temp_username, temp_password, status, memo, created_at, approved_at, activated_at,
      requester:profiles!requester_id(username),
      approver:profiles!approver_id(username)
    `)
    .order("created_at", { ascending: false })
    .limit(200)

  // branch_admin/admin은 자신이 요청한 것만
  if (!["master", "super_admin"].includes(me.role)) {
    query = query.eq("requester_id", auth.userId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: data })
}

// POST: 충전 요청 생성
export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: me } = await adminSupabase.from("profiles").select("role, branch_code").eq("id", auth.userId).single()
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ALLOWED = ["master", "super_admin", "branch_admin", "admin"]
  if (!ALLOWED.includes(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { pointAmount, memo } = await req.json()
  if (!pointAmount || pointAmount <= 0) {
    return NextResponse.json({ error: "포인트 금액을 입력해주세요." }, { status: 400 })
  }

  const { data, error } = await adminSupabase.from("point_charge_requests").insert({
    requester_id: auth.userId,
    requester_role: me.role,
    branch_code: me.branch_code ?? null,
    point_amount: pointAmount,
    status: "pending",
    memo: memo ?? null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: data })
}

// PATCH: 승인 (master/super_admin) 또는 계정 활성화
export async function PATCH(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: me } = await adminSupabase.from("profiles").select("role").eq("id", auth.userId).single()
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { requestId, action, password1, password2 } = await req.json()
  if (!requestId) return NextResponse.json({ error: "requestId 필요" }, { status: 400 })

  // 임시 계정 활성화 (비밀번호 2회 입력 검증)
  if (action === "activate") {
    if (!password1 || !password2) return NextResponse.json({ error: "비밀번호를 입력해주세요." }, { status: 400 })
    if (password1 !== password2) return NextResponse.json({ error: "비밀번호가 일치하지 않습니다." }, { status: 400 })

    const { data: pcr } = await adminSupabase.from("point_charge_requests")
      .select("*").eq("id", requestId).eq("status", "approved").single()
    if (!pcr) return NextResponse.json({ error: "승인된 요청을 찾을 수 없습니다." }, { status: 404 })

    // 임시계정 비밀번호를 입력한 비밀번호로 변경
    const { error: pwErr } = await adminSupabase.auth.admin.updateUserById(pcr.temp_user_id, { password: password1 })
    if (pwErr) return NextResponse.json({ error: pwErr.message }, { status: 500 })

    // 상태를 activated로 업데이트
    await adminSupabase.from("point_charge_requests")
      .update({ status: "activated", activated_at: new Date().toISOString() }).eq("id", requestId)

    return NextResponse.json({ success: true, username: pcr.temp_username })
  }

  // 거절
  if (action === "reject") {
    if (!["master", "super_admin"].includes(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    await adminSupabase.from("point_charge_requests")
      .update({ status: "rejected", approver_id: auth.userId, approved_at: new Date().toISOString() })
      .eq("id", requestId).eq("status", "pending")
    return NextResponse.json({ success: true })
  }

  // 승인: 임시 계정 생성 + 포인트 충전
  if (!["master", "super_admin"].includes(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { data: pcr } = await adminSupabase.from("point_charge_requests")
    .select("*").eq("id", requestId).eq("status", "pending").single()
  if (!pcr) return NextResponse.json({ error: "요청을 찾을 수 없거나 이미 처리됐습니다." }, { status: 404 })

  // 승인자 포인트 차감 확인
  const { data: approverBal } = await adminSupabase.from("balances").select("amount").eq("user_id", auth.userId).single()
  if (!approverBal || approverBal.amount < pcr.point_amount) {
    return NextResponse.json({ error: "포인트가 부족합니다." }, { status: 400 })
  }

  // 임시 계정 생성 (랜덤 ID, 임시 비밀번호)
  const tempUsername = `tmp_${randomAlphaNum(6)}`
  const tempPassword = randomAlphaNum(8)
  const uid = randomUUID()
  const email = `${uid}@noreply.app`

  const { data: authData, error: authErr } = await adminSupabase.auth.admin.createUser({
    email, password: tempPassword, email_confirm: true,
    user_metadata: { username: tempUsername },
  })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  const tempUserId = authData.user.id
  await adminSupabase.from("profiles").upsert({
    id: tempUserId, username: tempUsername, role: "user",
    branch_code: pcr.branch_code ?? null,
  })

  // 포인트 충전
  await upsertBalance(tempUserId, pcr.point_amount)

  // 승인자 포인트 차감
  await upsertBalance(auth.userId, -pcr.point_amount)

  // 요청자 포인트도 차감 (요청자가 직접 자신의 포인트 재고에서 소비하는 경우)
  // 단, 승인자와 요청자가 다를 때만 요청자 포인트 차감
  if (pcr.requester_id !== auth.userId) {
    const { data: reqBal } = await adminSupabase.from("balances").select("amount").eq("user_id", pcr.requester_id).single()
    // 요청자 포인트 차감은 별도 정책에 따라 결정 — 여기서는 승인자만 차감
  }

  // daily_sales_log 업데이트 (RPC로 증분 처리)
  const today = new Date().toISOString().slice(0, 10)
  const branchCode = pcr.branch_code ?? "NONE"
  await adminSupabase.rpc("increment_daily_sales", {
    p_date: today, p_branch: branchCode,
    p_charge_count: 1, p_charge_total: pcr.point_amount,
    p_exchange_count: 0, p_exchange_total: 0,
  })

  // 요청 업데이트
  await adminSupabase.from("point_charge_requests").update({
    status: "approved",
    approver_id: auth.userId,
    temp_user_id: tempUserId,
    temp_username: tempUsername,
    temp_password: tempPassword,
    approved_at: new Date().toISOString(),
  }).eq("id", requestId)

  return NextResponse.json({ success: true, tempUsername, tempPassword, tempUserId })
}
