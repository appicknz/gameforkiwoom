const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

async function getUserId(email) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`, {
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
    },
  })
  const data = await res.json()
  const users = data.users || []
  const user = users.find(u => u.email === email)
  return user?.id
}

async function resetPassword(email, password) {
  const id = await getUserId(email)
  if (!id) {
    console.log(`[v0] User not found: ${email}`)
    return
  }

  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      apikey: SERVICE_ROLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password }),
  })

  const data = await res.json()
  if (res.ok) {
    console.log(`[v0] OK: ${email} → password reset`)
  } else {
    console.log(`[v0] FAIL: ${email} → ${JSON.stringify(data)}`)
  }
}

async function main() {
  console.log('[v0] Starting password reset...')
  await resetPassword('master@test.com', '1')
  await resetPassword('branch@test.com', '2')
  await resetPassword('user@test.com', '3')
  await resetPassword('appicknz@gmail.com', 'Wjdruddl0)')
  console.log('[v0] Done.')
}

main()
