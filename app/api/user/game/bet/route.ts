import { adminSupabase } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds, branchToLpConfig, DEFAULT_LP_CONFIG } from "@/lib/lp-system"
import { calcAutoLpSeed } from "@/lib/lp-auto-seed"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

export async function POST(request: Request) {
  const supabase = adminSupabase

  try {
    const { betAmount, gameType, side, bets: betsPayload } = await request.json()
    // gameType: "baccarat" | "race" (optional)
    // side: "player"|"banker"|"tie" for baccarat, "bit"|"coin"|"tie" for race (optional)
    // bets: 전체 배팅 내역 (settle API가 읽음 — direction/digit/parity/baccaratSide 포함)
    if (!betAmount || betAmount <= 0) {
      return NextResponse.json({ error: "Invalid bet amount" }, { status: 400 })
    }

    // Authorization 헤더에서 토큰 추출
    const token = request.headers.get("Authorization")?.replace("Bearer ", "")
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // 토큰에서 사용자 ID 추출
    const { data: userData, error: userError } = await supabase.auth.getUser(token)
    if (userError || !userData?.user?.id) {
      return NextResponse.json({ error: "Invalid token" }, { status: 401 })
    }

    const userId = userData.user.id

    // atomic RPC로 잔고 차감 — SELECT→UPDATE 레이스 컨디션 완전 제거
    const { data: newBalance, error: deductError } = await supabase
      .rpc("deduct_balance_for_bet", { p_user_id: userId, p_amount: betAmount })

    if (deductError) {
      // INSUFFICIENT_BALANCE 또는 유저 없음
      const isInsufficient = deductError.message?.includes("INSUFFICIENT_BALANCE")
      return NextResponse.json(
        { error: isInsufficient ? "Insufficient balance" : "Failed to update balance" },
        { status: isInsufficient ? 400 : 500 }
      )
    }

    // 유저의 branch_id 조회 (balance_transactions FK 필요)
    const { data: profileData } = await supabase
      .from("profiles")
      .select("branch_id")
      .eq("id", userId)
      .single()

    // balance_transactions 기록 (배팅 차감 이력)
    // balance_before = 차감 후 잔고 + 배팅금 (atomic RPC가 차감 후 잔고를 반환하므로 역산)
    const balBefore = (newBalance as number) + betAmount
    await supabase.from("balance_transactions").insert({
      user_id: userId,
      branch_id: profileData?.branch_id ?? null,
      type: "bet",
      amount: -betAmount,
      balance_before: balBefore,
      balance_after: newBalance,
      note: `배팅 차감`,
    })

    // Redis에 최신 잔고 저장 + version increment → balance SSE가 변경 감지
    // newBalance는 DB atomic RPC에서 반환한 실제 차감 후 잔고
    const redisOps: Promise<unknown>[] = [
      redis.set(`balance:${userId}`, newBalance as number, { ex: 3600 }),
      redis.incr(`balance_version:${userId}`),
    ]

    // 배팅 풀 집계 + 유저별 bets 저장 (settle API 사용)
    // baccarat: 30초 라운드, race: 5분(300초) 라운드
    if (gameType && side) {
      const nowSec = Math.floor(Date.now() / 1000)
      const roundNumber = gameType === "race"
        ? Math.floor(nowSec / 300)
        : Math.floor(nowSec / 30)
      const ttl = gameType === "race" ? 600 : 120

      const poolKey       = `pool:${gameType}:${roundNumber}`
      const userSetKey    = `users:${gameType}:${roundNumber}`
      const betsKey       = `bet:bets:${gameType}:${roundNumber}:${userId}`
      const oddsSnapKey   = `odds:snap:${gameType}:${roundNumber}:${userId}`

      // 기존 bets에 merge (여러 번 배팅 가능)
      const existing = await redis.get<string>(betsKey)
      const prev = existing ? (typeof existing === "string" ? JSON.parse(existing) : existing) : {}
      const merged = betsPayload ? { ...prev, ...betsPayload } : prev

      // ── 배팅 시점 odds 스냅샷 계산 후 저장 ──────────────────
      // 현재 풀 상태 + hincrby 반영 전 풀로 odds 계산 (배팅이 반영되기 전 시점)
      const poolData = await redis.hgetall(poolKey).catch(() => null)
      const branchId: string | null = profileData?.branch_id ?? null

      // LP 설정 조회
      let lpConfig = { ...DEFAULT_LP_CONFIG }
      const lpCacheKey = `lp:config:user:${userId}`
      const cachedLp = await redis.get<string>(lpCacheKey)
      if (cachedLp) {
        try { lpConfig = typeof cachedLp === "string" ? JSON.parse(cachedLp) : cachedLp } catch {}
      } else if (branchId) {
        const { data: branch } = await adminSupabase
          .from("branches")
          .select("lp_enabled, lp_amount_baccarat, lp_amount_race, lp_multiplier_baccarat, lp_multiplier_race")
          .eq("id", branchId).single()
        if (branch) {
          lpConfig = branchToLpConfig(branch)
          await redis.set(lpCacheKey, JSON.stringify(lpConfig), { ex: 30 })
        }
      }

      // 자동 시드 계산 (odds/stream 과 동일한 로직)
      const fallbackSeed = gameType === "baccarat" ? lpConfig.lpAmountBaccarat : lpConfig.lpAmountRace
      const autoSeed = await calcAutoLpSeed(gameType, branchId, fallbackSeed)
      if (gameType === "baccarat") lpConfig.lpAmountBaccarat = autoSeed
      else                         lpConfig.lpAmountRace     = autoSeed

      // 현재 풀 데이터로 odds 계산
      let oddsSnap: Record<string, number> = {}
      if (gameType === "baccarat") {
        const pool = {
          player: parseInt((poolData?.player as string) ?? "0") || 0,
          banker: parseInt((poolData?.banker as string) ?? "0") || 0,
          tie:    parseInt((poolData?.tie    as string) ?? "0") || 0,
        }
        const userCount = await redis.scard(`users:baccarat:${roundNumber}`).catch(() => 0)
        const r = calcBaccaratOdds(pool, lpConfig, userCount as number)
        oddsSnap = { player: r.playerOdds, banker: r.bankerOdds, tie: r.tieOdds }
      } else {
        const pool = {
          bit:  parseInt((poolData?.bit  as string) ?? "0") || 0,
          coin: parseInt((poolData?.coin as string) ?? "0") || 0,
          tie:  parseInt((poolData?.tie  as string) ?? "0") || 0,
        }
        const userCount = await redis.scard(`users:race:${roundNumber}`).catch(() => 0)
        const r = calcRaceOdds(pool, lpConfig, userCount as number)
        oddsSnap = { bit: r.bitOdds, coin: r.coinOdds, tie: r.tieOdds }
      }

      // 기존 스냅샷이 있으면 배팅 사이드별로 merge (사이드별 첫 배팅 시점 odds 보존)
      const existingSnap = await redis.get<string>(oddsSnapKey)
      const prevSnap = existingSnap
        ? (typeof existingSnap === "string" ? JSON.parse(existingSnap) : existingSnap)
        : {}
      // 이미 저장된 사이드는 유지 (처음 배팅 시점 odds 고정), 새 사이드만 추가
      const mergedSnap = { ...oddsSnap, ...prevSnap }

      redisOps.push(
        redis.hincrby(poolKey, side, betAmount),
        redis.sadd(userSetKey, userId),
        redis.set(betsKey, JSON.stringify(merged), { ex: ttl }),
        redis.set(oddsSnapKey, JSON.stringify(mergedSnap), { ex: ttl }),
        redis.expire(poolKey, ttl),
        redis.expire(userSetKey, ttl),
      )
    }

    // pool 저장 완료 후 SSE 트리거 (버전 카운터 increment)
    await Promise.all(redisOps)

    const triggerOps: Promise<unknown>[] = []
    if (gameType && side) {
      triggerOps.push(redis.incr(`odds_version:${gameType}`))
    }
    if (triggerOps.length > 0) await Promise.all(triggerOps)

    return NextResponse.json({ success: true, newBalance })
  } catch (error) {
    console.error("[v0] Bet API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
