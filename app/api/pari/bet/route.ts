import { adminSupabase } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

// POST /api/pari/bet
// 파리뮤추얼 배팅: 잔고 차감 + pari_pools 풀에 금액 추가
// 기존 /api/user/game/bet 와 완전 독립, 기존 로직 무변경
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
    const { branchId, roundTime, betAmount, poolType, side } = body
    // poolType: "long_short" | "under_over" | "odd_even"
    // side: "a" | "b"  (a=long/under/odd, b=short/over/even)

    if (!branchId || !roundTime || !betAmount || !poolType || !side) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    if (!["long_short", "under_over", "odd_even"].includes(poolType)) {
      return NextResponse.json({ error: "Invalid poolType" }, { status: 400 })
    }
    if (!["a", "b"].includes(side)) {
      return NextResponse.json({ error: "Invalid side" }, { status: 400 })
    }
    if (betAmount <= 0) {
      return NextResponse.json({ error: "Invalid betAmount" }, { status: 400 })
    }

    // 지점 파리뮤추얼 모드 확인
    const { data: branch } = await adminSupabase
      .from("branches")
      .select("betting_mode")
      .eq("id", branchId)
      .single()

    if (!branch || branch.betting_mode !== "pari") {
      return NextResponse.json({ error: "Branch is not in pari mode" }, { status: 400 })
    }

    // Atomic 잔고 차감 (기존 RPC 재사용)
    const { data: newBalance, error: rpcErr } = await adminSupabase
      .rpc("atomic_deduct_balance", { p_user_id: user.id, p_amount: betAmount })

    if (rpcErr) return NextResponse.json({ error: "Balance update failed" }, { status: 500 })
    if ((newBalance as number) === -1) return NextResponse.json({ error: "Insufficient balance" }, { status: 400 })

    const balanceBefore = (newBalance as number) + betAmount

    // pari_pools에 베팅금 추가 (upsert 후 increment)
    const col = side === "a" ? "side_a_amount" : "side_b_amount"
    const rt = parseInt(roundTime)

    // 풀이 없으면 먼저 생성 (LP 없이)
    await adminSupabase
      .from("pari_pools")
      .upsert({
        branch_id: branchId,
        round_time: rt,
        pool_type: poolType,
        side_a_amount: 0,
        side_b_amount: 0,
        lp_a: 0,
        lp_b: 0,
      }, { onConflict: "branch_id,round_time,pool_type", ignoreDuplicates: true })

    // atomic increment
    await adminSupabase.rpc("increment_pari_pool", {
      p_branch_id: branchId,
      p_round_time: rt,
      p_pool_type: poolType,
      p_col: col,
      p_amount: betAmount,
    })

    // 잔고 트랜잭션 기록
    const { data: profileData } = await adminSupabase
      .from("profiles")
      .select("branch_id")
      .eq("id", user.id)
      .single()

    await adminSupabase.from("balance_transactions").insert({
      user_id: user.id,
      branch_id: profileData?.branch_id ?? null,
      type: "bet",
      amount: -betAmount,
      balance_before: balanceBefore,
      balance_after: newBalance as number,
      note: `파리뮤추얼 배팅 (${poolType}/${side})`,
    })

    // Redis 잔고 갱신
    await Promise.all([
      redis.set(`balance:${user.id}`, newBalance as number, { ex: 3600 }),
      redis.incr(`balance_version:${user.id}`),
    ])

    return NextResponse.json({ success: true, newBalance })
  } catch (err) {
    console.error("[pari/bet] error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
