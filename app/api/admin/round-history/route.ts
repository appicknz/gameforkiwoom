export const dynamic = "force-dynamic"
/**
 * GET /api/admin/round-history
 * ?gameType=baccarat|race&limit=20&offset=0
 *
 * 라운드별 결과·배당 목록 반환
 * 각 라운드의 참여 회원 목록도 포함
 */
import { adminSupabase as admin } from "@/lib/supabase-admin"
import { getUserIdFromToken } from "@/lib/auth"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET(request: Request) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const userId = await getUserIdFromToken(token)
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: profile } = await admin.from("profiles").select("role").eq("id", userId).single()
  const role = profile?.role ?? ""
  if (!["master", "super_admin", "branch_admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const url   = new URL(request.url)
  const gameType = url.searchParams.get("gameType") ?? "baccarat"
  const limit    = Math.min(parseInt(url.searchParams.get("limit")  ?? "20"), 100)
  const offset   = parseInt(url.searchParams.get("offset") ?? "0")
  const roundNum = url.searchParams.get("roundNumber")

  // 특정 라운드 참여자 조회
  if (roundNum) {
    const { data: participants, error } = await admin
      .from("game_round_participants")
      .select("*")
      .eq("game_type", gameType)
      .eq("round_number", parseInt(roundNum))
      .order("settled_at", { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ participants: participants ?? [] })
  }

  // 라운드 목록 조회
  const { data: rounds, error, count } = await admin
    .from("game_round_history")
    .select("*", { count: "exact" })
    .eq("game_type", gameType)
    .order("round_number", { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ rounds: rounds ?? [], total: count ?? 0 })
}
