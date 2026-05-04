import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"
import bcrypt from "bcryptjs"

const redis = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! })

// 현금 잔고 upsert 헬퍼
async function upsertCashBalance(userId: string, delta: number) {
  const { data: existing } = await adminSupabase
    .from("cash_balances").select("amount").eq("user_id", userId).single()
  const newAmt = (existing?.amount ?? 0) + delta
  if (existing) {
    await adminSupabase.from("cash_balances")
      .update({ amount: newAmt, updated_at: new Date().toISOString() }).eq("user_id", userId)
  } else {
    await adminSupabase.from("cash_balances").insert({ user_id: userId, amount: newAmt })
  }
  return newAmt
}

// 포인트 잔고 upsert 헬퍼
async function upsertBalance(userId: string, delta: number) {
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

// GET: 목록 조회
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: me } = await adminSupabase.from("profiles").select("role").eq("id", auth.userId).single()
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ROLES = ["master", "super_admin", "branch_admin", "admin"]
  if (!ROLES.includes(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const url = new URL(req.url)
  const fromBranches = url.searchParams.get("from") === "branches"

  // master/super_admin은 전체 조회, branch_admin은 자신의 요청 or 자신이 관리하는 지점(admin) 요청
  // ?from=branches 쿼리 시 branch_admin은 admin 역할 요청만 필터
  let query = adminSupabase
    .from("point_purchase_requests")
    .select(`
      id, requester_id, requester_role, cash_amount, point_amount,
      status, memo, created_at, approved_at, rate,
      requester:profiles!requester_id(username, branch_id),
      approver:profiles!approver_id(username)
    `)
    .order("created_at", { ascending: false })
    .limit(200)

  if (me.role === "branch_admin") {
    if (fromBranches) {
      // branches.owner_email 에는 username이 저장됨 (이메일 아님)
      const { data: ownedBranches } = await adminSupabase
        .from("branches").select("code").eq("owner_email", me.username)
      const codes = (ownedBranches ?? []).map((b: any) => b.code)
      if (codes.length === 0) return NextResponse.json({ requests: [] })

      const { data: branchAdmins } = await adminSupabase
        .from("profiles").select("id").eq("role", "admin").in("branch_code", codes)
      const adminIds = (branchAdmins ?? []).map((p: any) => p.id)
      if (adminIds.length === 0) return NextResponse.json({ requests: [] })

      query = query.in("requester_id", adminIds)
    } else {
      query = query.eq("requester_id", auth.userId)
    }
  } else if (!["master", "super_admin"].includes(me.role)) {
    query = query.eq("requester_id", auth.userId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: data })
}

// POST: 새 요청 생성 (super_admin/branch_admin/admin이 현금 내고 포인트 구매 요청)
export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: me } = await adminSupabase.from("profiles").select("role, username").eq("id", auth.userId).single()
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ALLOWED = ["super_admin", "branch_admin", "admin"]
  if (!ALLOWED.includes(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { cashAmount, memo } = await req.json()
  if (!cashAmount || cashAmount <= 0) {
    return NextResponse.json({ error: "현금 금액을 입력해주세요." }, { status: 400 })
  }

  const { data, error } = await adminSupabase.from("point_purchase_requests").insert({
    requester_id: auth.userId,
    requester_role: me.role,
    cash_amount: cashAmount,
    status: "pending",
    memo: memo ?? null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: data })
}

// PATCH: 승인 (master/super_admin만 — 비밀번호 입력 후 포인트 금액 직접 지정)
export async function PATCH(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: me } = await adminSupabase.from("profiles").select("role").eq("id", auth.userId).single()
  if (!me || !["master", "super_admin", "branch_admin"].includes(me.role)) {
    return NextResponse.json({ error: "승인 권한이 없습니다." }, { status: 403 })
  }

  const { requestId, pointAmount, rate, password, action } = await req.json()
  if (!requestId) return NextResponse.json({ error: "requestId 필요" }, { status: 400 })

  if (action === "reject") {
    await adminSupabase.from("point_purchase_requests")
      .update({ status: "rejected", approver_id: auth.userId, approved_at: new Date().toISOString() })
      .eq("id", requestId).eq("status", "pending")
    return NextResponse.json({ success: true })
  }

  // 승인: 비밀번호 검증 필수
  if (!password) return NextResponse.json({ error: "비밀번호를 입력해주세요." }, { status: 400 })
  if (!pointAmount || pointAmount <= 0) return NextResponse.json({ error: "포인트 금액을 입력해주세요." }, { status: 400 })

  // 승인자 비밀번호 검증
  const { data: authUserData } = await adminSupabase.auth.admin.getUserById(auth.userId)
  if (!authUserData?.user?.email) return NextResponse.json({ error: "계정 정보를 확인할 수 없습니다." }, { status: 500 })

  const { createClient } = await import("@supabase/supabase-js")
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error: pwErr } = await anonClient.auth.signInWithPassword({
    email: authUserData.user.email, password
  })
  if (pwErr) return NextResponse.json({ error: "비밀번호가 올바르지 않습니다." }, { status: 401 })

  // 요청 조회
  const { data: req2 } = await adminSupabase.from("point_purchase_requests")
    .select("*").eq("id", requestId).eq("status", "pending").single()
  if (!req2) return NextResponse.json({ error: "요청을 찾을 수 없거나 이미 처리됐습니다." }, { status: 404 })

  // 요청자(지점/총판)에게 포인트 충전
  await upsertBalance(req2.requester_id, pointAmount)

  // 승인자(총판)의 포인트 잔액에서 지급 포인트만큼 차감
  await upsertBalance(auth.userId, -pointAmount)

  // 현금 거래 이력 기록 (실패해도 상태 업데이트는 진행)
  try {
    await adminSupabase.from("cash_transactions").insert({
      from_user_id: req2.requester_id,
      to_user_id: auth.userId,
      cash_amount: req2.cash_amount,
      point_amount: pointAmount,
      tx_type: "purchase_approve",
      memo: `포인트 구매 승인 #${requestId.slice(0, 8)}`,
    })
  } catch (e) {
    // 이력 기록 실패 무시 — 상태 업데이트는 반드시 진행
  }

  // 요청 상태 업데이트 — 항상 실행
  const { error: updateErr } = await adminSupabase.from("point_purchase_requests").update({
    status: "approved",
    approver_id: auth.userId,
    point_amount: pointAmount,
    rate: rate ?? null,
    approver_password_verified: true,
    approved_at: new Date().toISOString(),
  }).eq("id", requestId)

  if (updateErr) {
    return NextResponse.json({ error: `상태 업데이트 실패: ${updateErr.message}` }, { status: 500 })
  }

  return NextResponse.json({ success: true, pointAmount })
}
