/**
 * 하우스 손익 통계 API (마스터 전용)
 * GET  /api/admin/house-stats  - 전체/지점별 하우스 손익 조회
 * POST /api/admin/house-stats  - 수금 처리 (수수료 초기화)
 */
import { adminSupabase as admin } from "@/lib/supabase-admin"
import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"

async function getUserFromToken(token: string) {
  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data, error } = await anonClient.auth.getUser(token)
  if (error || !data.user) return null
  return data.user
}

async function getMasterBranchId(userId: string): Promise<string | null> {
  const { data } = await admin
    .from("profiles")
    .select("branch_id, branches(name)")
    .eq("id", userId)
    .single()
  return data?.branch_id ?? null
}

async function isMaster(userId: string): Promise<boolean> {
  const { data } = await admin
    .from("profiles")
    .select("role, branch_id, branches(parent_id)")
    .eq("id", userId)
    .single()
  // 슈퍼어드민이거나 parent_id가 없는 최상위 지점 어드민
  if (data?.role === "superadmin") return true
  if (data?.role === "admin" && !(data?.branches as any)?.parent_id) return true
  return false
}

// GET: 하우스 통계 조회
export async function GET(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const user = await getUserFromToken(token)
    if (!user) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

    const { searchParams } = new URL(request.url)
    const branchFilter = searchParams.get("branch_id")

    const master = await isMaster(user.id)
    const myBranchId = await getMasterBranchId(user.id)

    let query = admin
      .from("house_stats")
      .select(`
        id,
        branch_id,
        game_type,
        total_bet,
        total_payout,
        total_lp_used,
        total_fee,
        total_collected,
        updated_at,
        branches(name, code)
      `)

    if (master && branchFilter) {
      query = query.eq("branch_id", branchFilter)
    } else if (!master && myBranchId) {
      query = query.eq("branch_id", myBranchId)
    }

    const { data: stats, error: statsErr } = await query.order("branch_id")
    if (statsErr) throw statsErr

    // 수금 이력 (최근 20개)
    let collectQuery = admin
      .from("fee_collections")
      .select(`
        id, branch_id, game_type, collected_amount, note, created_at,
        branches(name)
      `)
      .order("created_at", { ascending: false })
      .limit(20)

    if (!master && myBranchId) {
      collectQuery = collectQuery.eq("branch_id", myBranchId)
    }

    const { data: collections } = await collectQuery

    // 마스터용 전체 집계
    let masterSummary = null
    if (master) {
      const allStats = stats ?? []
      masterSummary = {
        totalBet:       allStats.reduce((s, r) => s + (r.total_bet ?? 0), 0),
        totalPayout:    allStats.reduce((s, r) => s + (r.total_payout ?? 0), 0),
        totalLpUsed:    allStats.reduce((s, r) => s + (r.total_lp_used ?? 0), 0),
        totalFee:       allStats.reduce((s, r) => s + (r.total_fee ?? 0), 0),
        totalCollected: allStats.reduce((s, r) => s + (r.total_collected ?? 0), 0),
        pendingFee:     allStats.reduce((s, r) => s + Math.max(0, (r.total_fee ?? 0) - (r.total_collected ?? 0)), 0),
        houseProfit:    allStats.reduce((s, r) => s + ((r.total_bet ?? 0) - (r.total_payout ?? 0)), 0),
      }
    }

    return NextResponse.json({ stats, collections, masterSummary })
  } catch (err) {
    console.error("[house-stats GET]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// POST: 수금 처리 (수수료 초기화)
export async function POST(request: Request) {
  try {
    const token = request.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const user = await getUserFromToken(token)
    if (!user) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

    const master = await isMaster(user.id)
    if (!master) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await request.json()
    const { branch_id, game_type, note } = body

    if (!branch_id || !game_type) {
      return NextResponse.json({ error: "branch_id and game_type required" }, { status: 400 })
    }

    // 현재 미수금 조회
    const { data: stat } = await admin
      .from("house_stats")
      .select("total_fee, total_collected")
      .eq("branch_id", branch_id)
      .eq("game_type", game_type)
      .single()

    if (!stat) return NextResponse.json({ error: "Stats not found" }, { status: 404 })

    const pendingAmount = Math.max(0, (stat.total_fee ?? 0) - (stat.total_collected ?? 0))
    if (pendingAmount <= 0) {
      return NextResponse.json({ error: "No pending fee to collect" }, { status: 400 })
    }

    // 수금 이력 기록
    await admin.from("fee_collections").insert({
      branch_id,
      game_type,
      collected_amount: pendingAmount,
      collected_by: user.id,
      note: note ?? "수금 처리",
    })

    // total_collected 업데이트 (미수금 초기화)
    await admin
      .from("house_stats")
      .update({
        total_collected: (stat.total_collected ?? 0) + pendingAmount,
        updated_at: new Date().toISOString(),
      })
      .eq("branch_id", branch_id)
      .eq("game_type", game_type)

    return NextResponse.json({ success: true, collectedAmount: pendingAmount })
  } catch (err) {
    console.error("[house-stats POST]", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
