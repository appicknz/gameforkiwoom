import "server-only"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { randomUUID } from "crypto"

function decodeJwtSub(token: string): string | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"))
    return payload.sub ?? null
  } catch { return null }
}

function getAuth(req: Request) {
  const token = req.headers.get("Authorization")?.replace("Bearer ", "") ?? ""
  const userId = decodeJwtSub(token)
  return { userId }
}

// ── GET: 요청 목록 조회 ──
// admin: 자신이 보낸 요청
// branch_admin: 자신이 관리하는 지점들이 보낸 요청
export async function GET(req: Request) {
  const { userId } = getAuth(req)
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: me } = await adminSupabase.from("profiles").select("role, id, username").eq("id", userId).single()
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  let query = adminSupabase
    .from("user_account_requests")
    .select(`
      id, requester_id, branch_id, username_prefix, count, memo, status,
      created_at, approved_at, created_usernames,
      requester:profiles!requester_id ( username )
    `)
    .order("created_at", { ascending: false })

  if (me.role === "admin") {
    query = query.eq("requester_id", userId)
  } else if (me.role === "branch_admin") {
    // 방법1: branches.owner_email = me.username → branch codes → admin profiles
    const { data: ownedBranches } = await adminSupabase
      .from("branches").select("code").eq("owner_email", me.username)
    const codes = (ownedBranches ?? []).map((b: any) => b.code)

    let branchAdminIds: string[] = []

    if (codes.length > 0) {
      const { data: branchAdmins } = await adminSupabase
        .from("profiles").select("id").eq("role", "admin").in("branch_code", codes)
      branchAdminIds = (branchAdmins ?? []).map((b: any) => b.id)
    }

    // 방법2: branches 체인 실패 시 role=admin 전체 fallback
    if (branchAdminIds.length === 0) {
      const { data: allAdmins } = await adminSupabase
        .from("profiles").select("id").eq("role", "admin")
      branchAdminIds = (allAdmins ?? []).map((b: any) => b.id)
    }

    if (branchAdminIds.length === 0) return NextResponse.json({ requests: [] })
    query = query.in("requester_id", branchAdminIds)
  } else if (!["master", "super_admin"].includes(me.role)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 })
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: data ?? [] })
}

// ── POST: 지점(admin)이 계정 생성 요청 ──
export async function POST(req: Request) {
  const { userId } = getAuth(req)
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: me } = await adminSupabase.from("profiles").select("role").eq("id", userId).single()
  if (!me || me.role !== "admin") {
    return NextResponse.json({ error: "지점 관리자만 요청할 수 있습니다." }, { status: 403 })
  }

  const { username, password, count, memo } = await req.json()
  if (!username?.trim() || !password?.trim()) {
    return NextResponse.json({ error: "ID와 비밀번호를 입력하세요." }, { status: 400 })
  }
  const safeCount = Math.max(1, Math.min(100, Number(count) || 1))

  const { data, error } = await adminSupabase.from("user_account_requests").insert({
    requester_id:    userId,
    branch_id:       userId,
    username_prefix: username.trim(),
    password:        password.trim(),
    count:           safeCount,
    memo:            memo?.trim() || null,
    status:          "pending",
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, request: data })
}

// ── PATCH: 총판(branch_admin)이 승인 / 거절 ──
export async function PATCH(req: Request) {
  const { userId } = getAuth(req)
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: me } = await adminSupabase.from("profiles").select("role, id, branch_code").eq("id", userId).single()
  if (!me || !["master", "super_admin", "branch_admin"].includes(me.role)) {
    return NextResponse.json({ error: "권한 없음" }, { status: 403 })
  }

  const { requestId, action } = await req.json()
  if (!requestId || !["approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "requestId, action(approve|reject) 필요" }, { status: 400 })
  }

  const { data: reqRow } = await adminSupabase
    .from("user_account_requests").select("*").eq("id", requestId).single()
  if (!reqRow) return NextResponse.json({ error: "요청을 찾을 수 없습니다." }, { status: 404 })
  if (reqRow.status !== "pending") return NextResponse.json({ error: "이미 처리된 요청입니다." }, { status: 409 })

  if (action === "reject") {
    await adminSupabase.from("user_account_requests")
      .update({ status: "rejected", approver_id: userId })
      .eq("id", requestId)
    return NextResponse.json({ ok: true })
  }

  // 승인: 실제 계정 생성
  const created: string[] = []
  const failed:  string[] = []
  const count = reqRow.count ?? 1

  // branch_id(지점) → branch_code 조회
  const { data: branchProfile } = await adminSupabase
    .from("profiles").select("branch_code").eq("id", reqRow.branch_id).single()
  const branchCode = branchProfile?.branch_code ?? null

  // 지점의 상위 총판 ID로 branch_id 설정
  const branchId = reqRow.branch_id

  for (let i = 0; i < count; i++) {
    const uname = count === 1
      ? reqRow.username_prefix
      : `${reqRow.username_prefix}${String(i + 1).padStart(2, "0")}`
    const uid   = randomUUID()
    const email = `${uid}@noreply.app`

    try {
      const { data: authUser, error: authErr } = await adminSupabase.auth.admin.createUser({
        email,
        password: reqRow.password,
        email_confirm: true,
        user_metadata: { username: uname },
      })
      if (authErr || !authUser.user) { failed.push(uname); continue }

      const { error: profileErr } = await adminSupabase.from("profiles").upsert({
        id:          authUser.user.id,
        username:    uname,
        role:        "user",
        branch_code: branchCode,
        branch_id:   branchId,
      })
      if (profileErr) {
        await adminSupabase.auth.admin.deleteUser(authUser.user.id)
        failed.push(uname); continue
      }
      await adminSupabase.from("balances").upsert({ user_id: authUser.user.id, amount: 0 })
      created.push(uname)
    } catch {
      failed.push(uname)
    }
  }

  await adminSupabase.from("user_account_requests").update({
    status:           "approved",
    approver_id:      userId,
    approved_at:      new Date().toISOString(),
    created_usernames: created,
  }).eq("id", requestId)

  return NextResponse.json({ ok: true, created: created.length, failed: failed.length, usernames: created })
}
