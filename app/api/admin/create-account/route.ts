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

  // Supabase Auth에 유저 생성 — 이메일 형식 필수이므로 UUID 기반 더미 이메일 사용
  const email = `${randomUUID()}@noreply.app`
  const { data: authUser, error: authErr } = await adminSupabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username: username.trim() },
  })
  if (authErr || !authUser.user) {
    return NextResponse.json({ error: authErr?.message ?? "계정 생성 실패" }, { status: 500 })
  }

  // profiles 테이블에 역할 등록
  // branch_code/branch_id 는 branches 테이블 FK → 관리자 계정은 지점 미소속이므로 NULL
  const { error: profileErr } = await adminSupabase.from("profiles").upsert({
    id: authUser.user.id,
    username: username.trim(),
    role,
    memo: memo?.trim() ?? null,
    branch_id: null,
    branch_code: null,
  })
  if (profileErr) {
    // auth 유저는 생성됐지만 profile 실패 시 auth 유저 삭제
    await adminSupabase.auth.admin.deleteUser(authUser.user.id)
    return NextResponse.json({ error: "프로필 저장 실패: " + profileErr.message }, { status: 500 })
  }

  // 잔고 초기화
  await adminSupabase.from("balances").upsert({ user_id: authUser.user.id, amount: 0 })

  return NextResponse.json({ ok: true, id: authUser.user.id, username: username.trim(), role })
}
