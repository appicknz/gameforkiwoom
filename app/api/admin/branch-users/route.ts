export const dynamic = "force-dynamic"
import "server-only"
import { adminSupabase } from "@/lib/supabase-admin"
import { getUserIdFromToken } from "@/lib/auth"
import { NextResponse } from "next/server"

async function verifyAdmin(req: Request) {
  const header = req.headers.get("authorization") ?? ""
  if (!header.startsWith("Bearer ")) return null
  const token = header.slice(7)
  const userId = await getUserIdFromToken(token)
  if (!userId) return null
  const { data: profile } = await adminSupabase
    .from("profiles").select("id, role, branch_id, branch_code").eq("id", userId).single()
  if (!profile || !["admin", "branch_admin", "super_admin", "master"].includes(profile.role)) return null
  return profile
}

// GET /api/admin/branch-users
// 지점 admin → 자기 지점 회원 목록 + 최근 배팅 내역 (선택 유저)
export async function GET(req: Request) {
  const me = await verifyAdmin(req)
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const url = new URL(req.url)
  const userId = url.searchParams.get("userId") // 특정 유저 배팅 내역 조회 시
  const page   = parseInt(url.searchParams.get("page") ?? "1")
  const limit  = 20

  // 지점 멤버 목록
  let memberQuery = adminSupabase
    .from("profiles")
    .select("id, username, branch_code, balance:balances(amount)")
    .eq("role", "user")
    .order("created_at", { ascending: false })

  if (me.role === "admin") {
    // 자기 지점 회원만 — branch_code 기준으로 조회 (branch_id는 null일 수 있음)
    if (me.branch_code) {
      memberQuery = memberQuery.eq("branch_code", me.branch_code)
    } else {
      memberQuery = memberQuery.eq("branch_id", me.id)
    }
  } else if (me.role === "branch_admin") {
    // 소속 지점들의 회원 — branch_code 기준
    const { data: ownedBranches } = await adminSupabase
      .from("branches").select("code").eq("owner_email", me.branch_code ?? "")
    const codes = (ownedBranches ?? []).map((b: any) => b.code)
    if (codes.length > 0) {
      memberQuery = memberQuery.in("branch_code", codes)
    }
  }

  const { data: members } = await memberQuery.limit(200)
  const memberList = (members ?? []).map((m: any) => ({
    id: m.id,
    username: m.username,
    balance: m.balance?.[0]?.amount ?? m.balance?.amount ?? 0,
  }))

  // 배팅 내역 (특정 유저 or 지점 전체)
  let bets: any[] = []
  if (userId || me.role === "admin") {
    const targetIds = userId
      ? [userId]
      : memberList.map((m: any) => m.id)

    if (targetIds.length > 0) {
      const { data: betRows } = await adminSupabase
        .from("bet_history")
        .select(`
          id, user_id, game_type, round_id, bet_direction, bet_digit, bet_parity,
          bet_amount, payout, result, created_at,
          user:profiles!user_id(username),
          round:rounds!round_id(round_number)
        `)
        .in("user_id", targetIds)
        .order("created_at", { ascending: false })
        .range((page - 1) * limit, page * limit - 1)

      bets = (betRows ?? []).map((b: any) => {
        // game_type이 없으면 bet_direction으로 추측
        let gameType = b.game_type
        if (!gameType) {
          const dir = b.bet_direction ?? ""
          if (dir.startsWith("baccarat_")) gameType = "baccarat"
          else if (dir === "bit" || dir === "coin") gameType = "race"
          else gameType = "baccarat" // default
        }
        return {
          ...b,
          game_type: gameType,
          username: b.user?.username ?? "-",
          round_number: b.round?.round_number ?? "-",
        }
      })
    }
  }

  return NextResponse.json({ members: memberList, bets })
}
