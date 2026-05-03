import "server-only"
import { NextResponse } from "next/server"
import { adminSupabase } from "@/lib/supabase-admin"
import { cookies } from "next/headers"
import { randomUUID } from "crypto"

function decodeJwtSub(token: string): string | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"))
    return payload.sub ?? null
  } catch { return null }
}

export async function POST(req: Request) {
  const cookieStore = await cookies()
  const token =
    req.headers.get("Authorization")?.replace("Bearer ", "") ??
    cookieStore.get("app_token")?.value ?? ""

  const callerId = decodeJwtSub(token)
  if (!callerId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: caller } = await adminSupabase.from("profiles").select("role, branch_code").eq("id", callerId).single()
  if (!caller || !["master", "branch_admin"].includes(caller.role)) {
    return NextResponse.json({ error: "권한이 없습니다." }, { status: 403 })
  }

  const { username, password, count = 1, memo, branchCode } = await req.json()

  if (!username?.trim() || !password?.trim()) {
    return NextResponse.json({ error: "아이디와 비밀번호를 입력하세요." }, { status: 400 })
  }

  const safeCount = Math.max(1, Math.min(50, Number(count) || 1))
  // 총판은 자신의 지점 코드만 사용 가능
  const targetBranchCode = caller.role === "branch_admin" ? (caller.branch_code ?? branchCode) : (branchCode ?? null)

  const created: string[] = []
  const failed: string[] = []

  for (let i = 0; i < safeCount; i++) {
    // 수량이 1이면 그대로, 여러 개면 번호 붙임
    const uname = safeCount === 1 ? username.trim() : `${username.trim()}${String(i + 1).padStart(2, "0")}`
    const uid = randomUUID()
    const email = `${uid}@noreply.app`

    try {
      const { data: authUser, error: authErr } = await adminSupabase.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { username: uname },
      })
      if (authErr || !authUser.user) { failed.push(uname); continue }

      const { error: profileErr } = await adminSupabase.from("profiles").upsert({
        id: authUser.user.id,
        username: uname,
        role: "user",
        branch_code: targetBranchCode ?? null,
        branch_id: null,
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

  return NextResponse.json({ ok: true, created: created.length, failed: failed.length, usernames: created })
}
