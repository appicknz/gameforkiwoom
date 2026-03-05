import { createClient } from "@/lib/supabase/server"
import { createClient as createAdmin } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

const admin = createAdmin(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await admin
    .from("profiles")
    .select("role, branch_id")
    .eq("id", user.id)
    .single()

  if (!profile || profile.role !== "branch_admin" || !profile.branch_id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const branchId = profile.branch_id

  const [memberRes, betRes, balanceRes] = await Promise.all([
    admin.from("profiles").select("id, username, created_at").eq("branch_id", branchId).eq("role", "user").order("created_at", { ascending: false }),
    admin.from("bet_history").select("id, user_id, bet_direction, bet_digit, bet_parity, bet_amount, result, created_at").eq("branch_id", branchId).order("created_at", { ascending: false }).limit(200),
    admin.from("balances").select("user_id, amount").in("user_id", (await admin.from("profiles").select("id").eq("branch_id", branchId).eq("role", "user")).data?.map(p => p.id) ?? []),
  ])

  const memberList = memberRes.data ?? []
  const betList = betRes.data ?? []
  const balanceList = balanceRes.data ?? []

  const balanceMap = new Map(balanceList.map(b => [b.user_id, b.amount]))
  const betsByUser = betList.reduce((acc: any, b: any) => {
    acc[b.user_id] = acc[b.user_id] ?? { total: 0, wins: 0 }
    acc[b.user_id].total++
    if (b.result === "win") acc[b.user_id].wins++
    return acc
  }, {})

  const members = memberList.map(m => ({
    ...m,
    balance: balanceMap.get(m.id) ?? 0,
    bet_count: betsByUser[m.id]?.total ?? 0,
    win_count: betsByUser[m.id]?.wins ?? 0,
  }))

  return NextResponse.json({ members, bets: betList })
}
