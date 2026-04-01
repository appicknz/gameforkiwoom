/**
 * /api/game/settle — 서버 주도 일괄 정산 엔진
 *
 * price-server (Railway)가 30초 closing 직후 호출:
 *   POST /api/game/settle  { closePrice, closeTime, source: "price-server" }
 *
 * 1. Redis에서 해당 라운드의 모든 배팅자(bet:user:{round}) 조회
 * 2. 각 유저 배팅 내역(bet:bets:{round}:{userId}) 읽기
 * 3. LP 배당 계산 후 add_balance_for_payout atomic RPC 호출
 * 4. upsert_house_stats로 하우스 손익 기록
 * 5. balance_version incr → SSE가 클라이언트에 잔고 push
 * 6. Redis에 결과(game:result:{round}) 저장 → 클라이언트 폴링 수신
 */

import { adminSupabase as admin } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"
import { calcBaccaratOdds } from "@/lib/lp-system"

export const runtime = "nodejs"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const INTERNAL_SECRET = process.env.INTERNAL_SECRET || "tasko-internal"
const FIXED_ODDS = 1.6  // 방향/숫자/홀짝 고정 배당 (수수료 20% 적용)

export async function POST(request: Request) {
  // price-server 전용 인증
  const secret = request.headers.get("x-internal-secret")
  if (secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  try {
    const { closePrice, closeTime } = await request.json()
    if (typeof closePrice !== "number" || typeof closeTime !== "number") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    // 라운드 번호 = closeTime / 30 (price-server가 보내는 버킷 시작 초)
    const roundNumber = Math.floor(closeTime / 30)

    // 이미 정산된 라운드인지 확인 (중복 방지)
    const alreadySettled = await redis.get(`settled:${roundNumber}`)
    if (alreadySettled) {
      return NextResponse.json({ skipped: true, reason: "already settled" })
    }

    // ── 승패 계산 ────────────────────────────────────────────
    // basePrice: 이전 라운드 closing (DB에서 조회)
    const { data: priceRows } = await admin
      .from("btc_closing_prices")
      .select("price, time")
      .in("time", [closeTime, closeTime - 30])
      .order("time", { ascending: false })

    const parsePrice = (v: unknown) => typeof v === "string" ? parseFloat(v as string) : (v as number)
    const closeRow = priceRows?.[0]
    const baseRow  = priceRows?.[1] ?? priceRows?.[0]
    const resolvedClose = closeRow ? parsePrice(closeRow.price) : closePrice
    const basePrice     = baseRow  ? parsePrice(baseRow.price)  : resolvedClose

    const wonDirection: "long" | "short" = resolvedClose >= basePrice ? "long" : "short"
    const lastDigit = Math.floor(Math.abs(resolvedClose * 10)) % 10
    const wonDigit: "under" | "over" = lastDigit <= 4 ? "under" : "over"
    const wonParity: "odd" | "even" = lastDigit % 2 === 0 ? "even" : "odd"
    const baccaratResult: "player" | "banker" | "tie" =
      lastDigit <= 4 ? "player" : lastDigit <= 8 ? "banker" : "tie"

    // ── Redis 배팅 풀 + 유저 목록 조회 ──────────────────────
    const poolKey   = `pool:baccarat:${roundNumber}`
    const userSetKey = `users:baccarat:${roundNumber}`
    const [poolData, userIds] = await Promise.all([
      redis.hgetall(poolKey).catch(() => null),
      redis.smembers(userSetKey).catch(() => [] as string[]),
    ])

    const userCount = (userIds as string[]).length
    const baccaratPool = {
      player: parseInt((poolData?.player as string) ?? "0") || 0,
      banker: parseInt((poolData?.banker as string) ?? "0") || 0,
      tie:    parseInt((poolData?.tie    as string) ?? "0") || 0,
    }

    // 결과를 Redis에 저장 → 클라이언트가 baka:closing 수신 후 poll
    const resultPayload = {
      roundNumber,
      closePrice: resolvedClose,
      basePrice,
      wonDirection,
      wonDigit,
      wonParity,
      baccaratResult,
      settledAt: Date.now(),
    }
    await redis.set(`game:result:baccarat:${roundNumber}`, JSON.stringify(resultPayload), { ex: 120 })
    // 정산 완료 플래그 (중복 방지, 5분 TTL)
    await redis.set(`settled:${roundNumber}`, 1, { ex: 300 })

    // ── 유저별 정산 ─────────────────────────────────────────
    // bet:bets:{round}:{userId} 키에 배팅 내역이 저장되어 있음
    const settlementResults: Array<{ userId: string; payout: number }> = []

    for (const userId of userIds as string[]) {
      const betsKey = `bet:bets:${roundNumber}:${userId}`
      const betsRaw = await redis.get<string>(betsKey)
      if (!betsRaw) continue

      const bets = typeof betsRaw === "string" ? JSON.parse(betsRaw) : betsRaw

      // 유저 지점 LP 설정 (캐시 or DB)
      const lpCacheKey = `lp:config:user:${userId}`
      let lpConfig = { enabled: true, lpAmountBaccarat: 50000, lpAmountRace: 50000 }
      const cachedLp = await redis.get<string>(lpCacheKey)
      if (cachedLp) {
        try { lpConfig = typeof cachedLp === "string" ? JSON.parse(cachedLp) : cachedLp } catch {}
      } else {
        const { data: profileData } = await admin
          .from("profiles").select("branch_id").eq("id", userId).single()
        if (profileData?.branch_id) {
          const { data: branch } = await admin
            .from("branches")
            .select("lp_enabled, lp_amount_baccarat, lp_amount_race")
            .eq("id", profileData.branch_id)
            .single()
          if (branch) {
            lpConfig = {
              enabled: branch.lp_enabled ?? true,
              lpAmountBaccarat: branch.lp_amount_baccarat ?? 50000,
              lpAmountRace: branch.lp_amount_race ?? 50000,
            }
          }
          // LP 설정 5분 캐시
          await redis.set(lpCacheKey, JSON.stringify(lpConfig), { ex: 300 })
        }
      }

      const baccaratOdds = calcBaccaratOdds(baccaratPool, lpConfig, userCount)

      let totalPayout = 0
      let totalUserBet = 0

      if (bets.direction && bets.directionAmount > 0) {
        totalUserBet += bets.directionAmount
        if (bets.direction === wonDirection) totalPayout += Math.floor(bets.directionAmount * FIXED_ODDS)
      }
      if (bets.digit && bets.digitAmount > 0) {
        totalUserBet += bets.digitAmount
        if (bets.digit === wonDigit) totalPayout += Math.floor(bets.digitAmount * FIXED_ODDS)
      }
      if (bets.parity && bets.parityAmount > 0) {
        totalUserBet += bets.parityAmount
        if (bets.parity === wonParity) totalPayout += Math.floor(bets.parityAmount * FIXED_ODDS)
      }
      if (bets.baccaratSide && bets.baccaratAmount > 0) {
        totalUserBet += bets.baccaratAmount
        const side = bets.baccaratSide as "player" | "banker" | "tie"
        if (side === baccaratResult) {
          const odds = side === "player" ? baccaratOdds.playerOdds
            : side === "banker" ? baccaratOdds.bankerOdds
            : baccaratOdds.tieOdds
          totalPayout += Math.floor(bets.baccaratAmount * odds)
        } else if (baccaratResult === "tie" && (side === "player" || side === "banker")) {
          totalPayout += bets.baccaratAmount  // 타이 시 원금 반환
        }
      }

      // 당첨금 지급 (atomic RPC)
      if (totalPayout > 0) {
        const { data: newBalance, error } = await admin
          .rpc("add_balance_for_payout", { p_user_id: userId, p_amount: totalPayout })
        if (!error && typeof newBalance === "number") {
          await Promise.all([
            redis.set(`balance:${userId}`, newBalance, { ex: 3600 }),
            redis.incr(`balance_version:${userId}`),
          ])
          settlementResults.push({ userId, payout: totalPayout })
        }
      } else {
        // 패배도 Redis 잔고 동기화 (bet API 차감 후 Redis가 오래될 수 있음)
        const { data: balData } = await admin
          .from("balances").select("amount").eq("user_id", userId).single()
        if (balData) {
          await Promise.all([
            redis.set(`balance:${userId}`, balData.amount, { ex: 3600 }),
            redis.incr(`balance_version:${userId}`),
          ])
        }
      }
    }

    // ── rounds 테이블 기록 (라운드당 1회) ───────────────────
    await admin.from("rounds").insert({
      base_price: basePrice,
      result_price: resolvedClose,
      result_digit: lastDigit,
      baccarat_result: baccaratResult,
      started_at: new Date((roundNumber - 1) * 30 * 1000).toISOString(),
      ended_at: new Date(roundNumber * 30 * 1000).toISOString(),
    }).then(() => {}).catch(() => {})  // 중복 삽입 무시

    console.log(`[settle] round=${roundNumber} baccarat=${baccaratResult} settled=${settlementResults.length} users`)

    return NextResponse.json({
      success: true,
      roundNumber,
      baccaratResult,
      wonDirection,
      settled: settlementResults.length,
    })
  } catch (err) {
    console.error("[game/settle] Error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
