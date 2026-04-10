"use server"
import { adminSupabase } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

// GET /api/pari/pool?branchId=xxx&roundTime=xxx
// 현재 라운드의 3개 풀 현황 조회 (클라이언트에서 500ms 폴링)
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const branchId = searchParams.get("branchId")
  const roundTime = searchParams.get("roundTime")

  if (!branchId || !roundTime) {
    return NextResponse.json({ error: "branchId and roundTime required" }, { status: 400 })
  }

  // 지점 배팅 모드 확인
  const { data: branch } = await adminSupabase
    .from("branches")
    .select("betting_mode, lp_enabled, lp_amount")
    .eq("id", branchId)
    .single()

  if (!branch || branch.betting_mode !== "pari") {
    return NextResponse.json({ error: "Branch is not in pari-mutuel mode" }, { status: 400 })
  }

  const rt = parseInt(roundTime)

  // 3개 풀 upsert (없으면 LP와 함께 생성)
  const poolTypes = ["long_short", "under_over", "odd_even"] as const
  const results: Record<string, { sideA: number; sideB: number; totalA: number; totalB: number; oddsA: number; oddsB: number }> = {}

  for (const poolType of poolTypes) {
    const { data: existing } = await adminSupabase
      .from("pari_pools")
      .select("*")
      .eq("branch_id", branchId)
      .eq("round_time", rt)
      .eq("pool_type", poolType)
      .maybeSingle()

    let pool = existing

    if (!pool) {
      // 라운드 첫 조회 시 LP 투입하여 풀 생성
      const lpA = branch.lp_enabled ? branch.lp_amount / 6 : 0
      const lpB = branch.lp_enabled ? branch.lp_amount / 6 : 0

      const { data: created } = await adminSupabase
        .from("pari_pools")
        .insert({
          branch_id: branchId,
          round_time: rt,
          pool_type: poolType,
          side_a_amount: 0,
          side_b_amount: 0,
          lp_a: lpA,
          lp_b: lpB,
        })
        .select()
        .single()

      pool = created
    }

    if (!pool) continue

    const userA  = pool.side_a_amount ?? 0
    const userB  = pool.side_b_amount ?? 0
    const lpA    = pool.lp_a ?? 0
    const lpB    = pool.lp_b ?? 0
    const totalA = userA + lpA
    const totalB = userB + lpB
    const total  = totalA + totalB

    // 배당 표시 규칙:
    //  - 아직 사용자 배팅이 없으면 null (프론트에서 "—" 표시)
    //  - LP만 있거나 사용자 배팅이 생긴 후에만 배율 표시
    const HOUSE_EDGE = 0.05
    const hasUserBet = userA > 0 || userB > 0
    const oddsA = (hasUserBet && totalA > 0)
      ? Math.max(Math.floor((total * (1 - HOUSE_EDGE)) / totalA * 100) / 100, 1.01)
      : null
    const oddsB = (hasUserBet && totalB > 0)
      ? Math.max(Math.floor((total * (1 - HOUSE_EDGE)) / totalB * 100) / 100, 1.01)
      : null

    results[poolType] = {
      sideA: userA,
      sideB: userB,
      lpA,
      lpB,
      totalA,
      totalB,
      oddsA,  // null = 배팅 전 (프론트에서 "—" 표시)
      oddsB,
    }
  }

  return NextResponse.json({ pools: results, branchId, roundTime: rt })
}
