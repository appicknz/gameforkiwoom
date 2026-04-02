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
import { calcBaccaratOdds, calcRaceOdds, branchToLpConfig, DEFAULT_LP_CONFIG } from "@/lib/lp-system"

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

    // ── race 결과 계산 (5분 라운드 기준) ────────────────────
    // race는 5분(300초) 라운드: raceRoundNumber = Math.floor(closeTime / 300)
    const raceRoundNumber = Math.floor(closeTime / 300)
    const racePoolKey    = `pool:race:${raceRoundNumber}`
    const raceUserSetKey = `users:race:${raceRoundNumber}`

    // race 점수는 price-server가 Redis에 저장한 누적 값 사용
    // bit_score / coin_score 키: race-betting-game.tsx가 아닌 price-server에서 주도하려면
    // 현재는 클라이언트가 올린 `race:closing` 이벤트 대신 pool 비율로 판정
    // (추후 price-server가 score를 Redis에 저장하는 방식으로 개선 가능)
    const [racePoolData, raceUserIds] = await Promise.all([
      redis.hgetall(racePoolKey).catch(() => null),
      redis.smembers(raceUserSetKey).catch(() => [] as string[]),
    ])

    // ── baccarat 풀 + 유저 목록 조회 ────────────────────────
    const poolKey    = `pool:baccarat:${roundNumber}`
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

    const raceUserCount = (raceUserIds as string[]).length
    const racePool = {
      bit:  parseInt((racePoolData?.bit  as string) ?? "0") || 0,
      coin: parseInt((racePoolData?.coin as string) ?? "0") || 0,
      tie:  parseInt((racePoolData?.tie  as string) ?? "0") || 0,
    }

    // baccarat 결과를 Redis에 저장
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

    // race 결과 저장 (5분 라운드 마지막 30초 구간에서만 실제 정산)
    // raceRoundNumber가 이전 라운드와 같으면 아직 race 라운드 진행 중
    const isLastRaceTick = (closeTime % 300) >= 270  // 300초 라운드의 마지막 30초
    if (isLastRaceTick) {
      // race 풀 비율로 winner 결정 (점수가 없는 경우 fallback)
      const raceWinner: "bit" | "coin" | "tie" =
        racePool.bit > racePool.coin ? "bit"
        : racePool.coin > racePool.bit ? "coin"
        : "tie"
      await redis.set(`game:result:race:${raceRoundNumber}`, JSON.stringify({
        raceRoundNumber, raceWinner, closePrice: resolvedClose, settledAt: Date.now(),
      }), { ex: 600 })
    }

    // 정산 완료 플래그 (중복 방지, 5분 TTL)
    await redis.set(`settled:${roundNumber}`, 1, { ex: 300 })

    // ── 유저별 정산 ─────────────────────────────────────────
    // bet:bets:{round}:{userId} 키에 배팅 내역이 저장되어 있음
    const settlementResults: Array<{ userId: string; payout: number }> = []

    for (const userId of userIds as string[]) {
      const betsKey = `bet:bets:baccarat:${roundNumber}:${userId}`
      const betsRaw = await redis.get<string>(betsKey)
      if (!betsRaw) continue

      const bets = typeof betsRaw === "string" ? JSON.parse(betsRaw) : betsRaw

      // 유저 지점 LP 설정 (캐시 or DB)
      const lpCacheKey = `lp:config:user:${userId}`
      let lpConfig = { ...DEFAULT_LP_CONFIG }
      const cachedLp = await redis.get<string>(lpCacheKey)
      if (cachedLp) {
        try { lpConfig = typeof cachedLp === "string" ? JSON.parse(cachedLp) : cachedLp } catch {}
      } else {
        const { data: profileData } = await admin
          .from("profiles").select("branch_id").eq("id", userId).single()
        if (profileData?.branch_id) {
          const { data: branch } = await admin
            .from("branches")
            .select("lp_enabled, lp_amount_baccarat, lp_amount_race, lp_multiplier_baccarat, lp_multiplier_race")
            .eq("id", profileData.branch_id)
            .single()
          if (branch) lpConfig = branchToLpConfig(branch)
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

    // ── 바카라 house_stats 지점별 집계 ──────────────────────
    // 유저별 배팅액과 지급액을 집계해 지점별 수수료(=배팅액×20%) / 총배팅 / 총지급 기록
    {
      // branchId → { totalBet, totalPayout } 맵
      const branchAccum: Record<string, { totalBet: number; totalPayout: number }> = {}

      for (const userId of userIds as string[]) {
        const betsKey = `bet:bets:baccarat:${roundNumber}:${userId}`
        const betsRaw = await redis.get<string>(betsKey)
        if (!betsRaw) continue
        const bets = typeof betsRaw === "string" ? JSON.parse(betsRaw) : betsRaw

        // 유저의 지점 조회 (캐시 우선)
        const profileCacheKey = `profile:branch:${userId}`
        let branchId: string | null = await redis.get<string>(profileCacheKey)
        if (!branchId) {
          const { data: p } = await admin.from("profiles").select("branch_id").eq("id", userId).single()
          branchId = p?.branch_id ?? null
          if (branchId) await redis.set(profileCacheKey, branchId, { ex: 3600 })
        }
        if (!branchId) continue

        const lpCacheKey = `lp:config:user:${userId}`
        let lpConfig = { ...DEFAULT_LP_CONFIG }
        const cachedLp = await redis.get<string>(lpCacheKey)
        if (cachedLp) { try { lpConfig = typeof cachedLp === "string" ? JSON.parse(cachedLp) : cachedLp } catch {} }

        const baccaratOddsSnap = calcBaccaratOdds(baccaratPool, lpConfig, userCount)

        let userBet = 0
        let userPayout = 0

        if (bets.directionAmount > 0) {
          userBet += bets.directionAmount
          if (bets.direction === wonDirection) userPayout += Math.floor(bets.directionAmount * FIXED_ODDS)
        }
        if (bets.digitAmount > 0) {
          userBet += bets.digitAmount
          if (bets.digit === wonDigit) userPayout += Math.floor(bets.digitAmount * FIXED_ODDS)
        }
        if (bets.parityAmount > 0) {
          userBet += bets.parityAmount
          if (bets.parity === wonParity) userPayout += Math.floor(bets.parityAmount * FIXED_ODDS)
        }
        if (bets.baccaratAmount > 0) {
          userBet += bets.baccaratAmount
          const side = bets.baccaratSide as "player" | "banker" | "tie"
          if (side === baccaratResult) {
            const odds = side === "player" ? baccaratOddsSnap.playerOdds
              : side === "banker" ? baccaratOddsSnap.bankerOdds
              : baccaratOddsSnap.tieOdds
            userPayout += Math.floor(bets.baccaratAmount * odds)
          } else if (baccaratResult === "tie" && (side === "player" || side === "banker")) {
            userPayout += bets.baccaratAmount  // 타이 원금 반환
          }
        }

        if (!branchAccum[branchId]) branchAccum[branchId] = { totalBet: 0, totalPayout: 0 }
        branchAccum[branchId].totalBet     += userBet
        branchAccum[branchId].totalPayout  += userPayout

        // fee_logs: 유저별 상세 수수료 기록 (어느 지점 어느 유저에서 나온건지 추적)
        if (userBet > 0) {
          const userFee = Math.floor(userBet * 0.20)
          await admin.from("fee_logs").insert({
            round_number: roundNumber,
            game_type:    "baccarat",
            user_id:      userId,
            branch_id:    branchId,
            bet_amount:   userBet,
            fee_amount:   userFee,
          }).then(() => {}).catch(() => {})
        }
      }

      // 지점별 house_stats 증분 누적 (RPC — 덮어쓰지 않고 누적)
      for (const [bId, acc] of Object.entries(branchAccum)) {
        const fee    = Math.floor(acc.totalBet * 0.20)
        const lpUsed = Math.max(0, acc.totalPayout - acc.totalBet + fee)
        await admin.rpc("increment_house_stats", {
          p_branch_id: bId,
          p_game_type: "baccarat",
          p_bet:       acc.totalBet,
          p_payout:    acc.totalPayout,
          p_fee:       fee,
          p_lp_used:   lpUsed,
        }).then(() => {}).catch(() => {})
      }
    }

    // ── race 유저 정산 (5분 라운드 마지막 tick에서만) ───────
    if (isLastRaceTick && raceUserIds.length > 0) {
      const raceWinner: "bit" | "coin" | "tie" =
        racePool.bit > racePool.coin ? "bit"
        : racePool.coin > racePool.bit ? "coin"
        : "tie"

      for (const userId of raceUserIds as string[]) {
        const betsKey = `bet:bets:race:${raceRoundNumber}:${userId}`
        const betsRaw = await redis.get<string>(betsKey)
        if (!betsRaw) continue
        const bets = typeof betsRaw === "string" ? JSON.parse(betsRaw) : betsRaw

        // LP 설정 조회
        const lpCacheKey = `lp:config:user:${userId}`
        let lpConfig = { ...DEFAULT_LP_CONFIG }
        const cachedLp = await redis.get<string>(lpCacheKey)
        if (cachedLp) {
          try { lpConfig = typeof cachedLp === "string" ? JSON.parse(cachedLp) : cachedLp } catch {}
        } else {
          const { data: profileData } = await admin
            .from("profiles").select("branch_id").eq("id", userId).single()
          if (profileData?.branch_id) {
            const { data: branch } = await admin
              .from("branches")
              .select("lp_enabled, lp_amount_baccarat, lp_amount_race, lp_multiplier_baccarat, lp_multiplier_race")
              .eq("id", profileData.branch_id).single()
            if (branch) {
              lpConfig = branchToLpConfig(branch)
              await redis.set(lpCacheKey, JSON.stringify(lpConfig), { ex: 300 })
            }
          }
        }

        const raceOdds = calcRaceOdds(racePool, lpConfig, raceUserCount)
        let totalPayout = 0

        // direction/digit/parity — FIXED_ODDS
        if (bets.direction && bets.directionAmount > 0 && bets.direction === wonDirection)
          totalPayout += Math.floor(bets.directionAmount * FIXED_ODDS)
        if (bets.digit && bets.digitAmount > 0 && bets.digit === wonDigit)
          totalPayout += Math.floor(bets.digitAmount * FIXED_ODDS)
        if (bets.parity && bets.parityAmount > 0 && bets.parity === wonParity)
          totalPayout += Math.floor(bets.parityAmount * FIXED_ODDS)

        // race side — LP 기반 배당
        if (bets.raceSide && bets.raceAmount > 0) {
          const side = bets.raceSide as "bit" | "coin" | "tie"
          if (side === raceWinner) {
            const odds = side === "bit" ? raceOdds.bitOdds
              : side === "coin" ? raceOdds.coinOdds
              : raceOdds.tieOdds
            totalPayout += Math.floor(bets.raceAmount * odds)
          } else if (raceWinner === "tie" && (side === "bit" || side === "coin")) {
            totalPayout += bets.raceAmount  // 타이 시 원금 반환
          }
        }

        if (totalPayout > 0) {
          const { data: newBal, error } = await admin
            .rpc("add_balance_for_payout", { p_user_id: userId, p_amount: totalPayout })
          if (!error && typeof newBal === "number") {
            await Promise.all([
              redis.set(`balance:${userId}`, newBal, { ex: 3600 }),
              redis.incr(`balance_version:${userId}`),
            ])
          }
        } else {
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
      console.log(`[settle] race round=${raceRoundNumber} winner=${raceWinner} settled=${raceUserIds.length} users`)

      // race house_stats 지점별 집계
      const raceBranchAccum: Record<string, { totalBet: number; totalPayout: number }> = {}
      for (const userId of raceUserIds as string[]) {
        const betsKey = `bet:bets:race:${raceRoundNumber}:${userId}`
        const betsRaw = await redis.get<string>(betsKey)
        if (!betsRaw) continue
        const bets = typeof betsRaw === "string" ? JSON.parse(betsRaw) : betsRaw

        const profileCacheKey = `profile:branch:${userId}`
        let branchId: string | null = await redis.get<string>(profileCacheKey)
        if (!branchId) {
          const { data: p } = await admin.from("profiles").select("branch_id").eq("id", userId).single()
          branchId = p?.branch_id ?? null
          if (branchId) await redis.set(profileCacheKey, branchId, { ex: 3600 })
        }
        if (!branchId) continue

        const lpCacheKey = `lp:config:user:${userId}`
        let lpConfig = { ...DEFAULT_LP_CONFIG }
        const cachedLp = await redis.get<string>(lpCacheKey)
        if (cachedLp) { try { lpConfig = typeof cachedLp === "string" ? JSON.parse(cachedLp) : cachedLp } catch {} }

        const raceOddsSnap = calcRaceOdds(racePool, lpConfig, raceUserCount)

        let userBet = 0
        let userPayout = 0

        if (bets.directionAmount > 0) {
          userBet += bets.directionAmount
          if (bets.direction === wonDirection) userPayout += Math.floor(bets.directionAmount * FIXED_ODDS)
        }
        if (bets.digitAmount > 0) {
          userBet += bets.digitAmount
          if (bets.digit === wonDigit) userPayout += Math.floor(bets.digitAmount * FIXED_ODDS)
        }
        if (bets.parityAmount > 0) {
          userBet += bets.parityAmount
          if (bets.parity === wonParity) userPayout += Math.floor(bets.parityAmount * FIXED_ODDS)
        }
        if (bets.raceAmount > 0) {
          userBet += bets.raceAmount
          const side = bets.raceSide as "bit" | "coin" | "tie"
          if (side === raceWinner) {
            const odds = side === "bit" ? raceOddsSnap.bitOdds
              : side === "coin" ? raceOddsSnap.coinOdds
              : raceOddsSnap.tieOdds
            userPayout += Math.floor(bets.raceAmount * odds)
          } else if (raceWinner === "tie" && (side === "bit" || side === "coin")) {
            userPayout += bets.raceAmount
          }
        }

        if (!raceBranchAccum[branchId]) raceBranchAccum[branchId] = { totalBet: 0, totalPayout: 0 }
        raceBranchAccum[branchId].totalBet    += userBet
        raceBranchAccum[branchId].totalPayout += userPayout

        // fee_logs: 유저별 상세 수수료 기록
        if (userBet > 0) {
          const userFee = Math.floor(userBet * 0.20)
          await admin.from("fee_logs").insert({
            round_number: raceRoundNumber,
            game_type:    "race",
            user_id:      userId,
            branch_id:    branchId,
            bet_amount:   userBet,
            fee_amount:   userFee,
          }).then(() => {}).catch(() => {})
        }
      }

      for (const [bId, acc] of Object.entries(raceBranchAccum)) {
        const fee    = Math.floor(acc.totalBet * 0.20)
        const lpUsed = Math.max(0, acc.totalPayout - acc.totalBet + fee)
        await admin.rpc("increment_house_stats", {
          p_branch_id: bId,
          p_game_type: "race",
          p_bet:       acc.totalBet,
          p_payout:    acc.totalPayout,
          p_fee:       fee,
          p_lp_used:   lpUsed,
        }).then(() => {}).catch(() => {})
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
