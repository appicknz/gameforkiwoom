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

  // 호출자가 master인지 확인
  const { data: caller } = await adminSupabase.from("profiles").select("role").eq("id", callerId).single()
  if (!caller || caller.role !== "master") {
    return NextResponse.json({ error: "마스터 계정만 관리자를 생성할 수 있습니다." }, { status: 403 })
  }

  const { username, password, role, memo } = await req.json()

  if (!username?.trim() || !password?.trim()) {
    return NextResponse.json({ error: "아이디와 비밀번호를 입력하세요." }, { status: 400 })
  }

  const allowedRoles = ["super_admin", "branch_admin", "admin"]
  if (!allowedRoles.includes(role)) {
    return NextResponse.json({ error: "유효하지 않은 역할입니다." }, { status: 400 })
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
