import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"

// GET /api/admin/user-bets?userId=xxx&limit=50&offset=0
// admin/branch_admin/super_admin/master 가 특정 유저의 배팅 내역 조회
export async function GET(req: Request) {
  const auth = await verifySession(req)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const { data: requester } = await adminSupabase
    .from("profiles")
    .select("role, branch_code, id")
    .eq("id", auth.userId)
    .single()

  if (!requester || !["master", "super_admin", "branch_admin", "admin"].includes(requester.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const url = new URL(req.url)
  const userId = url.searchParams.get("userId")
  const limit  = Math.min(parseInt(url.searchParams.get("limit") ?? "50"), 200)
  const offset = parseInt(url.searchParams.get("offset") ?? "0")

  if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 })

  // admin은 자기 지점 유저만 조회 가능
  if (requester.role === "admin") {
    const { data: targetProfile } = await adminSupabase
      .from("profiles")
      .select("branch_code")
      .eq("id", userId)
      .single()
    if (!targetProfile || targetProfile.branch_code !== requester.branch_code) {
      return NextResponse.json({ error: "Forbidden: not your branch member" }, { status: 403 })
    }
  }

  // game_round_participants에서 해당 유저의 배팅 기록 조회 (바카라 + 레이스 통합)
  const { data: baccarat, error: e1 } = await adminSupabase
    .from("game_round_participants")
    .select("round_number, game_type, bet_amount, payout_amount, is_winner, bet_on, settled_at, balance_after")
    .eq("user_id", userId)
    .eq("game_type", "baccarat")
    .order("settled_at", { ascending: false })
    .range(offset, offset + limit - 1)

  const { data: race, error: e2 } = await adminSupabase
    .from("game_round_participants")
    .select("round_number, game_type, bet_amount, payout_amount, is_winner, bet_on, settled_at, balance_after")
    .eq("user_id", userId)
    .eq("game_type", "race")
    .order("settled_at", { ascending: false })
    .range(offset, offset + limit - 1)

  if (e1 || e2) return NextResponse.json({ error: (e1 ?? e2)?.message }, { status: 500 })

  // 합쳐서 최신순 정렬
  const all = [...(baccarat ?? []), ...(race ?? [])]
    .sort((a, b) => new Date(b.settled_at ?? 0).getTime() - new Date(a.settled_at ?? 0).getTime())
    .slice(0, limit)

  return NextResponse.json({ bets: all })
}
