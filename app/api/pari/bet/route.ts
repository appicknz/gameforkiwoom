import { adminSupabase } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds } from "@/lib/lp-system"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

// POST /api/pari/bet
// 배팅: 잔고 차감 + Redis pool 추가 + lp-system으로 배당 계산 반환
// pari 전용 엔드포인트이지만 배당 계산은 lp-system.ts로 통일
export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { data: { user }, error: authErr } = await adminSupabase.auth.getUser(token)
    if (authErr || !user) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

    const body = await req.json()
    const { roundTime, betAmount, poolType, side } = body
    // poolType: "baccarat" | "race"
    // side: "player"|"banker"|"tie" (baccarat) / "bit"|"coin"|"tie" (race)

    if (!roundTime || !betAmount || !poolType || !side) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    if (betAmount <= 0) {
      return NextResponse.json({ error: "Invalid betAmount" }, { status: 400 })
    }

    // 유저 지점 조회 + LP 설정
    const { data: profile } = await adminSupabase
      .from("profiles")
      .select("branch_id")
      .eq("id", user.id)
      .single()
    const branchId = profile?.branch_id ?? null

    let lpConfig = { enabled: true, lpAmountBaccarat: 50000, lpAmountRace: 50000 }
    if (branchId) {
      const { data: branch } = await adminSupabase
        .from("branches")
        .select("lp_enabled, lp_amount_baccarat, lp_amount_race")
        .eq("id", branchId)
        .single()
      if (branch) {
        lpConfig = {
          enabled: branch.lp_enabled ?? true,
          lpAmountBaccarat: branch.lp_amount_baccarat ?? 50000,
          lpAmountRace: branch.lp_amount_race ?? 50000,
        }
      }
    }

    // Atomic 잔고 차감
    const { data: newBalance, error: rpcErr } = await adminSupabase
      .rpc("atomic_deduct_balance", { p_user_id: user.id, p_amount: betAmount })
    if (rpcErr) return NextResponse.json({ error: "Balance update failed" }, { status: 500 })
    if ((newBalance as number) === -1) return NextResponse.json({ error: "Insufficient balance" }, { status: 400 })
    const balanceBefore = (newBalance as number) + betAmount

    // Redis pool에 배팅금 추가
    const roundNum = parseInt(roundTime)
    const poolKey = `pool:${poolType}:${roundNum}`
    const userSetKey = `users:${poolType}:${roundNum}`
    await Promise.all([
      redis.hincrby(poolKey, side, betAmount),
      redis.sadd(userSetKey, user.id),
      redis.expire(poolKey, 120),
      redis.expire(userSetKey, 120),
      redis.incr(`odds_version:${poolType}`),
    ])

    // 최신 풀 조회 후 lp-system으로 배당 계산
    const [poolRaw, userCount] = await Promise.all([
      redis.hgetall(poolKey),
      redis.scard(userSetKey),
    ])

    const toInt = (v: unknown) => parseInt((v as string) ?? "0") || 0

    let odds = 1.6
    if (poolType === "baccarat") {
      const pools = {
        player: toInt(poolRaw?.player),
        banker: toInt(poolRaw?.banker),
        tie:    toInt(poolRaw?.tie),
      }
      const result = calcBaccaratOdds(pools, lpConfig, userCount ?? 1)
      odds = side === "player" ? result.playerOdds
           : side === "banker" ? result.bankerOdds
           : result.tieOdds
    } else {
      const pools = {
        bit:  toInt(poolRaw?.bit),
        coin: toInt(poolRaw?.coin),
        tie:  toInt(poolRaw?.tie),
      }
      const result = calcRaceOdds(pools, lpConfig, userCount ?? 1)
      odds = side === "bit"  ? result.bitOdds
           : side === "coin" ? result.coinOdds
           : result.tieOdds
    }

    // 잔고 트랜잭션 기록
    await adminSupabase.from("balance_transactions").insert({
      user_id: user.id,
      branch_id: branchId,
      type: "bet",
      amount: -betAmount,
      balance_before: balanceBefore,
      balance_after: newBalance as number,
      note: `배팅 (${poolType}/${side}) 배율 ${odds.toFixed(2)}x`,
    })

    // Redis 잔고 갱신 + balance SSE 트리거
    await Promise.all([
      redis.set(`balance:${user.id}`, newBalance as number, { ex: 3600 }),
      redis.incr(`balance_version:${user.id}`),
    ])

    return NextResponse.json({
      success: true,
      newBalance,
      odds,
    })
  } catch (err) {
    console.error("[pari/bet] error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
