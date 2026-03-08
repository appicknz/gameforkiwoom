import { adminSupabase } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

// POST /api/pari/play
// 파리뮤추얼 정산: 서버에서 승패 계산 + 실시간 배당으로 지급
// 기존 /api/user/game/play 와 완전 독립, 기존 로직 무변경
export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: { user }, error: authErr } = await anonClient.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

    const body = await req.json()
    const {
      branchId, roundTime, closePrice,
      betDirection, betDigit, betParity,
      directionAmount, digitAmount, parityAmount,
    } = body

    if (typeof closePrice !== "number") {
      return NextResponse.json({ error: "Invalid closePrice" }, { status: 400 })
    }

    const rt = parseInt(roundTime)

    // ── 서버에서 승패 계산 ───────────────────────────────────────────────
    const lastDigit    = Math.floor(Math.abs(closePrice * 10)) % 10
    const wonDirection = closePrice >= (body.basePrice ?? closePrice) ? "long" : "short"
    const wonDigit     = lastDigit <= 4 ? "under" : "over"
    const wonParity    = lastDigit % 2 === 0 ? "even" : "odd"

    // ── 풀에서 실시간 배당 계산 ──────────────────────────────────────────
    const poolTypes = ["long_short", "under_over", "odd_even"] as const
    const HOUSE_EDGE = 0.05
    // poolMap: 배율 + 원시 풀 데이터(LP 기록용)
    const poolMap: Record<string, {
      oddsA: number; oddsB: number
      userA: number; userB: number; lpA: number; lpB: number
    }> = {}

    for (const poolType of poolTypes) {
      const { data: pool } = await adminSupabase
        .from("pari_pools")
        .select("side_a_amount, side_b_amount, lp_a, lp_b")
        .eq("branch_id", branchId)
        .eq("round_time", rt)
        .eq("pool_type", poolType)
        .maybeSingle()

      if (pool) {
        const userA = pool.side_a_amount ?? 0
        const userB = pool.side_b_amount ?? 0
        const lpA   = pool.lp_a ?? 0
        const lpB   = pool.lp_b ?? 0
        const totalA = userA + lpA
        const totalB = userB + lpB
        const total  = totalA + totalB
        poolMap[poolType] = {
          oddsA: total > 0 && totalA > 0 ? Math.max(Math.floor(total * (1 - HOUSE_EDGE) / totalA * 100) / 100, 1.01) : 1.90,
          oddsB: total > 0 && totalB > 0 ? Math.max(Math.floor(total * (1 - HOUSE_EDGE) / totalB * 100) / 100, 1.01) : 1.90,
          userA, userB, lpA, lpB,
        }
      } else {
        poolMap[poolType] = { oddsA: 1.90, oddsB: 1.90, userA: 0, userB: 0, lpA: 0, lpB: 0 }
      }
    }

    // ── 수익 계산 ────────────────────────────────────────────────────────
    let totalPayout = 0

    if (betDirection && directionAmount > 0 && betDirection === wonDirection) {
      const odds = betDirection === "long" ? poolMap["long_short"].oddsA : poolMap["long_short"].oddsB
      totalPayout += Math.floor(directionAmount * odds)
    }
    if (betDigit && digitAmount > 0 && betDigit === wonDigit) {
      const odds = betDigit === "under" ? poolMap["under_over"].oddsA : poolMap["under_over"].oddsB
      totalPayout += Math.floor(digitAmount * odds)
    }
    if (betParity && parityAmount > 0 && betParity === wonParity) {
      const odds = betParity === "odd" ? poolMap["odd_even"].oddsA : poolMap["odd_even"].oddsB
      totalPayout += Math.floor(parityAmount * odds)
    }

    // ── 풀 정산 처리 + LP 이력 기록 ─────────────────────────────────────
    await adminSupabase
      .from("pari_pools")
      .update({ is_settled: true })
      .eq("branch_id", branchId)
      .eq("round_time", rt)

    // lp_transactions: poolMap에 캐싱된 값 그대로 사용 (재조회 불필요)
    const lpTxRows: object[] = []
    for (const poolType of poolTypes) {
      const pm = poolMap[poolType]
      if (pm.lpA > 0) {
        lpTxRows.push({ branch_id: branchId, round_time: rt, pool_type: poolType, side: "a", lp_amount: pm.lpA, user_amount: pm.userA, settled_odds: pm.oddsA })
      }
      if (pm.lpB > 0) {
        lpTxRows.push({ branch_id: branchId, round_time: rt, pool_type: poolType, side: "b", lp_amount: pm.lpB, user_amount: pm.userB, settled_odds: pm.oddsB })
      }
    }
    if (lpTxRows.length > 0) {
      await adminSupabase.from("lp_transactions").insert(lpTxRows)
    }

    // ── 프로필 조회 ──────────────────────────────────────────────────────
    const { data: profileData } = await adminSupabase
      .from("profiles")
      .select("branch_id")
      .eq("id", user.id)
      .single()
    const userBranchId = profileData?.branch_id ?? null

    // ── bet_history 기록 ─────────────────────────────────────────────────
    const betHistoryRows = []
    if (betDirection && directionAmount > 0) {
      const won  = betDirection === wonDirection
      const odds = betDirection === "long" ? poolMap["long_short"].oddsA : poolMap["long_short"].oddsB
      betHistoryRows.push({
        user_id: user.id, branch_id: userBranchId, round_id: null,
        bet_direction: betDirection, bet_digit: null, bet_parity: null,
        bet_amount: directionAmount,
        payout: won ? Math.floor(directionAmount * odds) : 0,
        result: won ? "win" : "lose",
      })
    }
    if (betDigit && digitAmount > 0) {
      const won  = betDigit === wonDigit
      const odds = betDigit === "under" ? poolMap["under_over"].oddsA : poolMap["under_over"].oddsB
      betHistoryRows.push({
        user_id: user.id, branch_id: userBranchId, round_id: null,
        bet_direction: null, bet_digit: betDigit, bet_parity: null,
        bet_amount: digitAmount,
        payout: won ? Math.floor(digitAmount * odds) : 0,
        result: won ? "win" : "lose",
      })
    }
    if (betParity && parityAmount > 0) {
      const won  = betParity === wonParity
      const odds = betParity === "odd" ? poolMap["odd_even"].oddsA : poolMap["odd_even"].oddsB
      betHistoryRows.push({
        user_id: user.id, branch_id: userBranchId, round_id: null,
        bet_direction: null, bet_digit: null, bet_parity: betParity,
        bet_amount: parityAmount,
        payout: won ? Math.floor(parityAmount * odds) : 0,
        result: won ? "win" : "lose",
      })
    }
    if (betHistoryRows.length > 0) {
      await adminSupabase.from("bet_history").insert(betHistoryRows)
    }

    // ── 당첨 지급 ─────────────────────────────────────────────────────────
    let newBalance: number | null = null
    if (totalPayout > 0) {
      const { data: rpcData, error: rpcErr } = await adminSupabase
        .rpc("atomic_add_balance", { p_user_id: user.id, p_amount: totalPayout })

      if (!rpcErr) {
        newBalance = rpcData as number
        const balanceBefore = newBalance - totalPayout

        await adminSupabase.from("balance_transactions").insert({
          user_id: user.id, branch_id: userBranchId,
          type: "win", amount: totalPayout,
          balance_before: balanceBefore, balance_after: newBalance,
          note: "파리뮤추얼 당첨 수익",
        })

        await Promise.all([
          redis.set(`balance:${user.id}`, newBalance, { ex: 3600 }),
          redis.incr(`balance_version:${user.id}`),
        ])
      }
    }

    return NextResponse.json({
      success: true,
      wonDirection, wonDigit, wonParity, lastDigit,
      totalPayout, newBalance,
      odds: poolMap,
    })
  } catch (err) {
    console.error("[pari/play] error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
