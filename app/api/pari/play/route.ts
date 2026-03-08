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
    const { branchId, roundTime, basePrice, closePrice, bets } = body
    // bets: { direction?: "long"|"short", directionAmount?: number, digit?: "under"|"over", digitAmount?: number, parity?: "odd"|"even", parityAmount?: number }

    if (typeof basePrice !== "number" || typeof closePrice !== "number") {
      return NextResponse.json({ error: "Invalid price data" }, { status: 400 })
    }

    // ── 서버에서 직접 승패 계산 (기존 play route와 동일 로직) ──
    const wonDirection = closePrice >= basePrice ? "long" : "short"
    const lastDigit = Math.floor(Math.abs(closePrice * 10)) % 10
    const wonDigit = lastDigit <= 4 ? "under" : "over"
    const wonParity = lastDigit % 2 === 0 ? "even" : "odd"

    const rt = parseInt(roundTime)

    // ── 풀에서 실시간 배당 계산 ──────────────────────────────
    const poolTypes = ["long_short", "under_over", "odd_even"] as const
    const poolMap: Record<string, { oddsA: number; oddsB: number }> = {}

    for (const poolType of poolTypes) {
      const { data: pool } = await adminSupabase
        .from("pari_pools")
        .select("side_a_amount, side_b_amount, lp_a, lp_b")
        .eq("branch_id", branchId)
        .eq("round_time", rt)
        .eq("pool_type", poolType)
        .maybeSingle()

      if (pool) {
        const totalA = (pool.side_a_amount ?? 0) + (pool.lp_a ?? 0)
        const totalB = (pool.side_b_amount ?? 0) + (pool.lp_b ?? 0)
        const total = totalA + totalB
        poolMap[poolType] = {
          oddsA: total > 0 && totalA > 0 ? Math.max(Math.floor((total * 0.95 / totalA) * 100) / 100, 1.01) : 1.95,
          oddsB: total > 0 && totalB > 0 ? Math.max(Math.floor((total * 0.95 / totalB) * 100) / 100, 1.01) : 1.95,
        }
      } else {
        poolMap[poolType] = { oddsA: 1.95, oddsB: 1.95 }
      }
    }

    // ── 수익 계산 ────────────────────────────────────────────
    let totalPayout = 0

    if (bets.direction && bets.directionAmount > 0) {
      const won = bets.direction === wonDirection
      if (won) {
        const odds = bets.direction === "long" ? poolMap["long_short"].oddsA : poolMap["long_short"].oddsB
        totalPayout += Math.floor(bets.directionAmount * odds)
      }
    }
    if (bets.digit && bets.digitAmount > 0) {
      const won = bets.digit === wonDigit
      if (won) {
        const odds = bets.digit === "under" ? poolMap["under_over"].oddsA : poolMap["under_over"].oddsB
        totalPayout += Math.floor(bets.digitAmount * odds)
      }
    }
    if (bets.parity && bets.parityAmount > 0) {
      const won = bets.parity === wonParity
      if (won) {
        const odds = bets.parity === "odd" ? poolMap["odd_even"].oddsA : poolMap["odd_even"].oddsB
        totalPayout += Math.floor(bets.parityAmount * odds)
      }
    }

    // ── 풀 정산 처리 ─────────────────────────────────────────
    await adminSupabase
      .from("pari_pools")
      .update({ is_settled: true })
      .eq("branch_id", branchId)
      .eq("round_time", rt)

    // ── 프로필 조회 ──────────────────────────────────────────
    const { data: profileData } = await adminSupabase
      .from("profiles")
      .select("branch_id")
      .eq("id", user.id)
      .single()

    const userBranchId = profileData?.branch_id ?? null

    // ── bet_history 기록 ─────────────────────────────────────
    const betHistoryRows = []
    if (bets.direction && bets.directionAmount > 0) {
      const won = bets.direction === wonDirection
      const odds = bets.direction === "long" ? poolMap["long_short"].oddsA : poolMap["long_short"].oddsB
      betHistoryRows.push({
        user_id: user.id, branch_id: userBranchId, round_id: null,
        bet_direction: bets.direction, bet_digit: null, bet_parity: null,
        bet_amount: bets.directionAmount,
        payout: won ? Math.floor(bets.directionAmount * odds) : 0,
        result: won ? "win" : "lose",
      })
    }
    if (bets.digit && bets.digitAmount > 0) {
      const won = bets.digit === wonDigit
      const odds = bets.digit === "under" ? poolMap["under_over"].oddsA : poolMap["under_over"].oddsB
      betHistoryRows.push({
        user_id: user.id, branch_id: userBranchId, round_id: null,
        bet_direction: null, bet_digit: bets.digit, bet_parity: null,
        bet_amount: bets.digitAmount,
        payout: won ? Math.floor(bets.digitAmount * odds) : 0,
        result: won ? "win" : "lose",
      })
    }
    if (bets.parity && bets.parityAmount > 0) {
      const won = bets.parity === wonParity
      const odds = bets.parity === "odd" ? poolMap["odd_even"].oddsA : poolMap["odd_even"].oddsB
      betHistoryRows.push({
        user_id: user.id, branch_id: userBranchId, round_id: null,
        bet_direction: null, bet_digit: null, bet_parity: bets.parity,
        bet_amount: bets.parityAmount,
        payout: won ? Math.floor(bets.parityAmount * odds) : 0,
        result: won ? "win" : "lose",
      })
    }
    if (betHistoryRows.length > 0) {
      await adminSupabase.from("bet_history").insert(betHistoryRows)
    }

    // ── 당첨 지급 (atomic) ───────────────────────────────────
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
          note: `파리뮤추얼 당첨 수익`,
        })

        await Promise.all([
          redis.set(`balance:${user.id}`, newBalance, { ex: 3600 }),
          redis.incr(`balance_version:${user.id}`),
        ])
      }
    }

    return NextResponse.json({
      success: true,
      wonDirection, wonDigit, wonParity,
      totalPayout, newBalance,
      odds: poolMap,
    })
  } catch (err) {
    console.error("[pari/play] error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
