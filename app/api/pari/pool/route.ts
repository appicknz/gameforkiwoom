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

    const totalA = (pool.side_a_amount ?? 0) + (pool.lp_a ?? 0)
    const totalB = (pool.side_b_amount ?? 0) + (pool.lp_b ?? 0)
    const total = totalA + totalB

    // 파리뮤추얼 배당: 총합 / 각 사이드 * 0.95 수수료 적용
    const oddsA = total > 0 && totalA > 0 ? Math.floor(((total * 0.95) / totalA) * 100) / 100 : 1.95
    const oddsB = total > 0 && totalB > 0 ? Math.floor(((total * 0.95) / totalB) * 100) / 100 : 1.95

    results[poolType] = {
      sideA: pool.side_a_amount,
      sideB: pool.side_b_amount,
      totalA,
      totalB,
      oddsA: Math.max(oddsA, 1.01),
      oddsB: Math.max(oddsB, 1.01),
    }
  }

  return NextResponse.json({ pools: results, branchId, roundTime: rt })
}
