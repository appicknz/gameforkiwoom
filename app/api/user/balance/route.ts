import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const auth = await verifySession(request)
  if (!auth.ok) return NextResponse.json({ balance: 0, error: auth.error }, { status: auth.status })
  const { userId } = auth

  const { data: balance } = await adminSupabase
    .from('balances')
    .select('amount')
    .eq('user_id', userId)
    .single()

  return NextResponse.json({ balance: balance?.amount ?? 0 })
}
