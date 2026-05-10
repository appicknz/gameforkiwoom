export const dynamic = "force-dynamic"
// @ts-nocheck
import "server-only"
import { redis } from "@/lib/redis"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"

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

// GET: 목록
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: me } = await adminSupabase.from("profiles").select("role").eq("id", auth.userId).single()
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ALLOWED = ["master", "super_admin", "branch_admin", "admin"]
  if (!ALLOWED.includes(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  let query = adminSupabase
    .from("exchange_requests")
    .select(`
      id, requester_id, requester_role, point_amount, status, memo, created_at, approved_at,
      requester:profiles!requester_id(username),
      approver:profiles!approver_id(username),
      target_user:profiles!target_user_id(username, id)
    `)
    .order("created_at", { ascending: false })
    .limit(500)

  // branch_admin은 자신의 지점(branch_code) 내 admin들이 요청한 것 + 자신이 요청한 것
  if (me.role === "branch_admin") {
    // 자신과 같은 branch_code를 가진 admin들의 id 조회
    const { data: myProfile } = await adminSupabase
      .from("profiles").select("branch_code").eq("id", auth.userId).single()
    const branchCode = myProfile?.branch_code
    if (branchCode) {
      const { data: branchAdmins } = await adminSupabase
        .from("profiles").select("id").eq("branch_code", branchCode).in("role", ["admin"])
      const adminIds = (branchAdmins ?? []).map((p: any) => p.id)
      adminIds.push(auth.userId)
      query = query.in("requester_id", adminIds)
    } else {
      query = query.eq("requester_id", auth.userId)
    }
  } else if (me.role === "admin") {
    // 지점 admin: 자기 지점 유저들의 환전 요청 조회
    const { data: branchUsers } = await adminSupabase
      .from("profiles").select("id").eq("branch_id", auth.userId)
    const userIds = (branchUsers ?? []).map((p: any) => p.id)
    userIds.push(auth.userId)
    query = query.in("requester_id", userIds)
  } else if (!["master", "super_admin"].includes(me.role)) {
    query = query.eq("requester_id", auth.userId)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: data })
}

// POST: 환전 요청 생성 (admin/branch_admin)
export async function POST(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: me } = await adminSupabase.from("profiles").select("role").eq("id", auth.userId).single()
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const ALLOWED = ["branch_admin", "admin", "super_admin", "master"]
  if (!ALLOWED.includes(me.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  const { targetUsername, pointAmount, memo } = await req.json()
  if (!targetUsername) return NextResponse.json({ error: "대상 아이디를 입력해주세요." }, { status: 400 })
  if (!pointAmount || pointAmount <= 0) return NextResponse.json({ error: "포인트 금액을 입력해주세요." }, { status: 400 })

  // 대상 유저 확인
  const { data: targetUser } = await adminSupabase
    .from("profiles").select("id, role").eq("username", targetUsername).single()
  if (!targetUser) return NextResponse.json({ error: "존재하지 않는 아이디입니다." }, { status: 404 })
  if (targetUser.role !== "user") return NextResponse.json({ error: "유저 계정만 환전 가능합니다." }, { status: 400 })

  // 유저 포인트 확인
  const { data: targetBal } = await adminSupabase
    .from("balances").select("amount").eq("user_id", targetUser.id).single()
  if (!targetBal || targetBal.amount < pointAmount) {
    return NextResponse.json({ error: "대상 유저의 포인트가 부족합니다." }, { status: 400 })
  }

  const { data, error } = await adminSupabase.from("exchange_requests").insert({
    requester_id: auth.userId,
    requester_role: me.role,
    target_user_id: targetUser.id,
    point_amount: pointAmount,
    status: "pending",
    memo: memo ?? null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: data })
}

// PATCH: 환전 완료/거절/승인
export async function PATCH(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: me } = await adminSupabase.from("profiles").select("role").eq("id", auth.userId).single()
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (!["master", "super_admin", "branch_admin", "admin"].includes(me.role)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
  }

  const { requestId, action } = await req.json()
  if (!requestId) return NextResponse.json({ error: "requestId 필요" }, { status: 400 })

  // admin/branch_admin: 환전 완료 처리 (실제 외부 환전 후 완료 버튼)
  if (action === "complete") {
    if (!["admin", "branch_admin", "master", "super_admin"].includes(me.role)) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
    }
    const { data: er } = await adminSupabase.from("exchange_requests")
      .select("*").eq("id", requestId).eq("status", "pending").single()
    if (!er) return NextResponse.json({ error: "요청을 찾을 수 없거나 이미 처리됐습니다." }, { status: 404 })

    // 유저 포인트 차감 (환전 완료 시 포인트 소각)
    await upsertBalance(er.target_user_id, -er.point_amount)

    // daily_sales_log 업데이트
    const today = new Date().toISOString().slice(0, 10)
    const { data: targetProfile } = await adminSupabase
      .from("profiles").select("branch_code").eq("id", er.requester_id).single()
    const branchCode = targetProfile?.branch_code ?? "NONE"
    await adminSupabase.rpc("increment_daily_sales", {
      p_date: today, p_branch: branchCode,
      p_charge_count: 0, p_charge_total: 0,
      p_exchange_count: 1, p_exchange_total: er.point_amount,
    })

    await adminSupabase.from("exchange_requests").update({
      status: "approved",
      approver_id: auth.userId,
      approved_at: new Date().toISOString(),
    }).eq("id", requestId)

    return NextResponse.json({ success: true })
  }

  if (action === "reject") {
    if (!["master", "super_admin", "branch_admin", "admin"].includes(me.role)) {
      return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
    }
    await adminSupabase.from("exchange_requests")
      .update({ status: "rejected", approver_id: auth.userId, approved_at: new Date().toISOString() })
      .eq("id", requestId).eq("status", "pending")
    return NextResponse.json({ success: true })
  }

  // 기존 approve (master/super_admin)
  if (!["master", "super_admin"].includes(me.role)) return NextResponse.json({ error: "승인 권한이 없습니다." }, { status: 403 })

  const { data: er } = await adminSupabase.from("exchange_requests")
    .select("*").eq("id", requestId).eq("status", "pending").single()
  if (!er) return NextResponse.json({ error: "요청을 찾을 수 없거나 이미 처리됐습니다." }, { status: 404 })

  // 승인자(super_admin/master) 포인트 차감
  const { data: approverBal } = await adminSupabase.from("balances").select("amount").eq("user_id", auth.userId).single()
  if (!approverBal || approverBal.amount < er.point_amount) {
    return NextResponse.json({ error: "승인자의 포인트가 부족합니다." }, { status: 400 })
  }
  await upsertBalance(auth.userId, -er.point_amount)

  // 대상 유저 포인트 차감
  await upsertBalance(er.target_user_id, -er.point_amount)

  // daily_sales_log 업데이트
  const today = new Date().toISOString().slice(0, 10)
  const { data: targetProfile } = await adminSupabase
    .from("profiles").select("branch_code").eq("id", er.requester_id).single()
  const branchCode = targetProfile?.branch_code ?? "NONE"

  await adminSupabase.rpc("increment_daily_sales", {
    p_date: today, p_branch: branchCode,
    p_charge_count: 0, p_charge_total: 0,
    p_exchange_count: 1, p_exchange_total: er.point_amount,
  })

  // 상태 업데이트
  await adminSupabase.from("exchange_requests").update({
    status: "approved",
    approver_id: auth.userId,
    approved_at: new Date().toISOString(),
  }).eq("id", requestId)

  return NextResponse.json({ success: true })
}
