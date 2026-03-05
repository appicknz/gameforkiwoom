import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD ?? ''

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const pw = searchParams.get('pw')

  if (pw !== ADMIN_PASSWORD) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: profiles } = await adminSupabase
    .from('profiles')
    .select('id, username, role, created_at')
    .order('created_at', { ascending: false })

  const { data: balances } = await adminSupabase
    .from('balances')
    .select('user_id, amount')

  const balanceMap = new Map((balances ?? []).map(b => [b.user_id, b.amount]))

  const users = (profiles ?? []).map(p => ({
    ...p,
    balance: balanceMap.get(p.id) ?? 0,
  }))

  return NextResponse.json({ users })
}
