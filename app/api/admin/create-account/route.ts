import "server-only"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { cookies } from "next/headers"
import { randomUUID } from "crypto"

function decodeJwtSub(token: string): string | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    )
    return payload.sub ?? null
  } catch { return null }
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const token =
    req.headers.get("Authorization")?.replace("Bearer ", "") ??
    cookieStore.get("app_token")?.value ??
    ""

  const callerId = decodeJwtSub(token)
  if (!callerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: caller } = await adminSupabase.from("profiles").select("role").eq("id", callerId).single()
  if (!caller) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { username, password, role } = await req.json()

  if (!username?.trim() || !password?.trim()) {
    return NextResponse.json({ error: "아이디와 비밀번호를 입력하세요." }, { status: 400 })
  }

  // 권한별 생성 가능 역할 제한
  // master → 모두 생성 가능 (super_admin, branch_admin, admin)
  // super_admin → branch_admin만 생성 가능
  if (caller.role === "master") {
    const allowedRoles = ["super_admin", "branch_admin", "admin"]
    if (!allowedRoles.includes(role)) {
      return NextResponse.json({ error: "유효하지 않은 역할입니다." }, { status: 400 })
    }
  } else if (caller.role === "super_admin") {
    if (role !== "branch_admin") {
      return NextResponse.json({ error: "대총판은 총판 계정만 생성할 수 있습니다." }, { status: 403 })
    }
  } else {
    return NextResponse.json({ error: "계정 생성 권한이 없습니다." }, { status: 403 })
  }

  // 아이디 중복 확인
  const { data: existing } = await adminSupabase
    .from("profiles")
    .select("id")
    .eq("username", username.trim())
    .maybeSingle()
  if (existing) return NextResponse.json({ error: "이미 사용 중인 아이디입니다." }, { status: 409 })

  // register 와 완전히 동일한 패턴: uid 를 먼저 생성해 email 에 사용
  const uid = randomUUID()
  const email = `${uid}@noreply.app`

  const { data: authUser, error: authErr } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: username.trim() },
  })
  if (authErr || !authUser.user) {
    return NextResponse.json({ error: authErr?.message ?? "계정 생성 실패" }, { status: 500 })
  }

  const userId = authUser.user.id

  // profiles 저장 — branch_id/branch_code 는 FK 이므로 반드시 null
  const { error: profileErr } = await adminSupabase.from("profiles").upsert({
    id: userId,
    username: username.trim(),
    role,
    branch_id: null,
    branch_code: null,
  })
  if (profileErr) {
    await adminSupabase.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: "프로필 저장 실패: " + profileErr.message }, { status: 500 })
  }

  // 잔고 초기화
  await adminSupabase.from("balances").upsert({ user_id: userId, amount: 0 })

  return NextResponse.json({ ok: true, id: userId, username: username.trim(), role })
}

export async function DELETE(req: Request) {
  const cookieStore = await cookies()
  const token =
    req.headers.get("Authorization")?.replace("Bearer ", "") ??
    cookieStore.get("app_token")?.value ??
    ""

  const callerId = decodeJwtSub(token)
  if (!callerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: caller } = await adminSupabase.from("profiles").select("role").eq("id", callerId).single()
  if (!caller || caller.role !== "master") {
    return NextResponse.json({ error: "마스터 계정만 삭제할 수 있습니다." }, { status: 403 })
  }

  const { targetId } = await req.json()
  if (!targetId) return NextResponse.json({ error: "대상 ID가 필요합니다." }, { status: 400 })

  // master 계정은 삭제 불가
  const { data: target } = await adminSupabase.from("profiles").select("role, username").eq("id", targetId).single()
  if (!target) return NextResponse.json({ error: "계정을 찾을 수 없습니다." }, { status: 404 })
  if (target.role === "master") return NextResponse.json({ error: "마스터 계정은 삭제할 수 없습니다." }, { status: 403 })

  // profiles 삭제 (cascade 없을 경우 먼저 삭제)
  await adminSupabase.from("balances").delete().eq("user_id", targetId)
  await adminSupabase.from("profiles").delete().eq("id", targetId)

  // auth.users 삭제
  const { error: authErr } = await adminSupabase.auth.admin.deleteUser(targetId)
  if (authErr) return NextResponse.json({ error: "Auth 삭제 실패: " + authErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, username: target.username })
}
