import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const accounts = [
  { email: "master@test.com", password: "1" },
  { email: "branch@test.com", password: "2" },
  { email: "user@test.com", password: "3" },
  { email: "appicknz@gmail.com", password: "Wjdruddl0)" },
]

const { data: listData, error: listError } = await supabase.auth.admin.listUsers()

if (listError) {
  console.error("Failed to list users:", listError.message)
  process.exit(1)
}

for (const account of accounts) {
  const user = listData.users.find(u => u.email === account.email)
  if (!user) {
    console.log(`[SKIP] ${account.email} — not found`)
    continue
  }

  const { error } = await supabase.auth.admin.updateUserById(user.id, {
    password: account.password,
    email_confirm: true,
  })

  if (error) {
    console.log(`[FAIL] ${account.email} — ${error.message}`)
  } else {
    console.log(`[OK]   ${account.email} — password reset`)
  }
}
