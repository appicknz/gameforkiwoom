const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY

// 전체 유저 목록을 캐시해서 재사용
let _allUsers = null

async function getAllUsers() {
  if (_allUsers) return _allUsers
  const res = await fetch(
    `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1000`,
    {
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        apikey: SERVICE_ROLE_KEY,
      },
    }
  )
  console.log('[v0] admin/users status:', res.status)
  const text = await res.text()
  console.log('[v0] admin/users raw:', text.slice(0, 300))
  const data = JSON.parse(text)
  console.log('[v0] total users found:', (data.users || []).length)
  _allUsers = data.users || []
  return _allUsers
}

async function getUserId(email) {
  const users = await getAllUsers()
  const user = users.find(u => u.email === email)
  if (!user) {
    // 못 찾으면 전체 이메일 출력
    console.log('[v0] available emails:', users.map(u => u.email).join(', '))
  }
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
  console.log('[v0] SUPABASE_URL:', SUPABASE_URL)
  console.log('[v0] KEY prefix:', SERVICE_ROLE_KEY ? SERVICE_ROLE_KEY.slice(0, 20) + '...' : 'MISSING')
  console.log('[v0] Starting password reset...')
  await resetPassword('master@test.com', '1')
  await resetPassword('branch@test.com', '2')
  await resetPassword('user@test.com', '3')
  await resetPassword('appicknz@gmail.com', 'Wjdruddl0)')
  console.log('[v0] Done.')
}

main()
