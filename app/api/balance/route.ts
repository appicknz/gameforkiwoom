import { NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

// 잔고 조회 API
export async function GET() {
  const cookieStore = await cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { data: balance, error } = await supabase
    .from("balances")
    .select("amount, updated_at")
    .eq("user_id", user.id)
    .single()

  if (error || !balance) {
    return NextResponse.json({ error: "Balance not found" }, { status: 404 })
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("username, role, branch_id")
    .eq("id", user.id)
    .single()

  return NextResponse.json({
    balance: balance.amount,
    updatedAt: balance.updated_at,
    username: profile?.username ?? null,
    role: profile?.role ?? "user",
  })
}
