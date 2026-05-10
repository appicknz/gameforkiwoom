import { redis } from "@/lib/redis"
import { adminSupabase } from "@/lib/supabase-admin"
import { getUserIdFromToken } from "@/lib/auth"
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds, branchToLpConfig, DEFAULT_LP_CONFIG } from "@/lib/lp-system"

// Railway HTTP notify server — 배팅 후 즉시 odds push (2초 폴링 대기 없이)
// NOTIFY_URL 환경변수 우선, 없으면 PRICE_SERVER_URL 기반으로 구성
async function notifyOdds(gameType: string) {
  // 명시적 notify URL 우선 (Railway에서 HTTP_PORT를 별도 공개 URL로 매핑한 경우)
  const notifyUrl = process.env.NOTIFY_URL
    ?? (() => {
      const base = process.env.NEXT_PUBLIC_PRICE_SERVER_URL
      if (!base) return null
      // 포트가 명시된 경우 +1, 없으면 동일 도메인 /notify 사용
      return base.replace(/:(\d+)$/, (_, p) => `:${parseInt(p) + 1}`) + "/notify"
    })()
  if (!notifyUrl) return
  try {
    await fetch(notifyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_SECRET ?? "tasko-internal",
      },
      body: JSON.stringify({ channel: "odds", gameType }),
      signal: AbortSignal.timeout(2000),
    })
  } catch {
    // fire-and-forget: 실패해도 무시 (2초 폴링이 백업으로 작동)
  }
}


// POST /api/pari/bet
// 배팅: 잔고 차감 + Redis pool 추가 + lp-system으로 배당 계산 반환
// pari 전용 엔드포인트이지만 배당 계산은 lp-system.ts로 통일
export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "")
    if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const userId = await getUserIdFromToken(token)
    if (!userId) return NextResponse.json({ error: "Invalid token" }, { status: 401 })

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
      .eq("id", userId)
      .single()
    const branchId = profile?.branch_id ?? null

    let lpConfig = { ...DEFAULT_LP_CONFIG }
    if (branchId) {
      const { data: branch } = await adminSupabase
        .from("branches")
        .select("lp_enabled, lp_amount_baccarat, lp_amount_race, lp_multiplier_baccarat, lp_multiplier_race")
        .eq("id", branchId)
        .single()
      if (branch) lpConfig = branchToLpConfig(branch)
    }

    // Atomic 잔고 차감
    const { data: newBalance, error: rpcErr } = await adminSupabase
      .rpc("atomic_deduct_balance", { p_user_id: userId, p_amount: betAmount })
    if (rpcErr) return NextResponse.json({ error: "Balance update failed" }, { status: 500 })
    if ((newBalance as number) === -1) return NextResponse.json({ error: "Insufficient balance" }, { status: 400 })
    const balanceBefore = (newBalance as number) + betAmount

    // Redis pool에 배팅금 추가
    const roundNum = parseInt(roundTime)
    const poolKey = `pool:${poolType}:${roundNum}`
    const userSetKey = `users:${poolType}:${roundNum}`
    // pool 업데이트 (odds_version incr은 캐시 갱신 후 아래에서 수행)
    await Promise.all([
      redis.hincrby(poolKey, side, betAmount),
      redis.sadd(userSetKey, userId),
      redis.expire(poolKey, 120),
      redis.expire(userSetKey, 120),
    ])

    // 최신 풀 조회 후 lp-system으로 배당 계산
    const [poolRaw, userCount] = await Promise.all([
      redis.hgetall(poolKey),
      redis.scard(userSetKey),
    ])

    const toInt = (v: unknown) => parseInt((v as string) ?? "0") || 0

    let odds = 1.6
    const currentKey = `odds:current:${poolType}:${roundNum}`
    const roundSec   = poolType === "race" ? 180 : 30

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

      // 배팅마다 공유 odds 캐시 갱신 → Railway WS가 버전 변화 감지 후 최신 배당 push
      const payload = {
        gameType: poolType, roundNumber: roundNum, userCount: userCount ?? 1, pools,
        odds: { player: result.playerOdds, banker: result.bankerOdds, tie: result.tieOdds,
          lpWeight: result.lpWeight, mode: result.mode, available: result.available },
      }
      // 캐시 갱신 후 version incr → Railway 폴링이 최신 캐시를 읽음
      await redis.set(currentKey, JSON.stringify(payload), { ex: roundSec + 30 })
      await redis.incr(`odds_version:${poolType}`)
      // Railway에 즉시 push 트리거 (2초 폴링 대기 없이 실시간 반영)
      notifyOdds(poolType)
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

      const payload = {
        gameType: poolType, roundNumber: roundNum, userCount: userCount ?? 1, pools,
        odds: { bit: result.bitOdds, coin: result.coinOdds, tie: result.tieOdds,
          lpWeight: result.lpWeight, mode: result.mode, available: result.available },
      }
      await redis.set(currentKey, JSON.stringify(payload), { ex: roundSec + 30 })
      await redis.incr(`odds_version:${poolType}`)
      notifyOdds(poolType)
    }

    // 잔고 트랜잭션 기록
    await adminSupabase.from("balance_transactions").insert({
      user_id: userId,
      branch_id: branchId,
      type: "bet",
      amount: -betAmount,
      balance_before: balanceBefore,
      balance_after: newBalance as number,
      note: `배팅 (${poolType}/${side}) 배율 ${odds.toFixed(2)}x`,
    })

    // Redis 잔고 갱신 + balance SSE 트리거
    await Promise.all([
      redis.set(`balance:${userId}`, newBalance as number, { ex: 3600 }),
      redis.incr(`balance_version:${userId}`),
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
