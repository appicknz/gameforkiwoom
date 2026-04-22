import { createClient } from "@supabase/supabase-js"
import { randomUUID } from "crypto"

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const USERS = [
  { username: "비트벳1", role: "super_admin" },
  { username: "비트벳2", role: "branch_admin" },
  { username: "비트벳3", role: "admin" },
  { username: "비트벳4", role: "user" },
]
const PASSWORD = "qlxmqlxm!"

async function createUser({ username, role }) {
  // 이미 존재하면 삭제 후 재생성
  const { data: existing } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .single()

  if (existing) {
    await admin.auth.admin.deleteUser(existing.id)
    await admin.from("profiles").delete().eq("id", existing.id)
    console.log(`[삭제] 기존 계정 제거: ${username}`)
  }

  const uid = randomUUID()
  const email = `${uid}@noreply.app`

  const { data: authData, error: authError } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { username },
  })

  if (authError) {
    console.error(`[실패] ${username}: ${authError.message}`)
    return
  }

  const userId = authData.user.id

  const { error: profileError } = await admin
    .from("profiles")
    .upsert({ id: userId, username, role })

  if (profileError) {
    console.error(`[실패] ${username} 프로필: ${profileError.message}`)
    await admin.auth.admin.deleteUser(userId)
    return
  }

  console.log(`[성공] ${username} (${role}) 생성 완료`)
}

for (const user of USERS) {
  await createUser(user)
}

console.log("\n--- 계정 정보 ---")
for (const { username, role } of USERS) {
  console.log(`아이디: ${username} / 비밀번호: ${PASSWORD} / 권한: ${role}`)
}
