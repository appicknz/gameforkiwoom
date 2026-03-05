import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const [branchRes, memberRes, betRes, balanceRes] = await Promise.all([
    supabaseAdmin.from("branches").select("*").order("created_at", { ascending: false }),
    supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false }),
    supabaseAdmin.from("bet_history").select("id, user_id, result"),
    supabaseAdmin.from("balances").select("user_id, amount"),
  ])

  const branchList = branchRes.data ?? []
  const memberList = memberRes.data ?? []
  const betList = betRes.data ?? []
  const balanceList = balanceRes.data ?? []

  const balanceMap = new Map(balanceList.map((b: any) => [b.user_id, b.amount]))
  const betsByUser = betList.reduce((acc: any, b: any) => {
    acc[b.user_id] = acc[b.user_id] ?? { total: 0, wins: 0 }
    acc[b.user_id].total++
    if (b.result === "win") acc[b.user_id].wins++
    return acc
  }, {} as Record<string, { total: number; wins: number }>)

  const enrichedMembers = memberList.map((m: any) => ({
    ...m,
    balance: balanceMap.get(m.id) ?? 0,
    bet_count: betsByUser[m.id]?.total ?? 0,
    win_count: betsByUser[m.id]?.wins ?? 0,
  }))

  const branchMemberCount = memberList.reduce((acc: any, m: any) => {
    if (m.branch_id) acc[m.branch_id] = (acc[m.branch_id] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)

  const enrichedBranches = branchList.map((b: any) => ({
    ...b,
    member_count: branchMemberCount[b.id] ?? 0,
  }))

  return NextResponse.json({
    branches: enrichedBranches,
    members: enrichedMembers,
    stats: {
      totalBranches: branchList.length,
      pendingBranches: branchList.filter((b: any) => b.status === "pending").length,
      totalMembers: memberList.filter((m: any) => m.role === "user").length,
      totalBets: betList.length,
      totalWins: betList.filter((b: any) => b.result === "win").length,
    },
  })
}
