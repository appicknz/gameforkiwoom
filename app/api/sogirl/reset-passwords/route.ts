import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

// 테스트 계정 비밀번호를 Supabase Admin API로 올바르게 재설정
export async function GET() {
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const accounts = [
    { email: "master@test.com", password: "1" },
    { email: "branch@test.com", password: "2" },
    { email: "user@test.com", password: "3" },
    { email: "appicknz@gmail.com", password: "Wjdruddl0)" },
  ]

  const results = []

  for (const account of accounts) {
    // 먼저 유저 ID 조회
    const { data: listData } = await supabaseAdmin.auth.admin.listUsers()
    const user = listData?.users?.find(u => u.email === account.email)

    if (!user) {
      results.push({ email: account.email, status: "not found" })
      continue
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: account.password,
      email_confirm: true,
    })

    results.push({ email: account.email, status: error ? error.message : "ok" })
  }

  return NextResponse.json({ results })
}
