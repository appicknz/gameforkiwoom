export const dynamic = "force-dynamic"
import { redis } from "@/lib/redis"
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
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds, DEFAULT_LP_CONFIG } from "@/lib/lp-system"

export const runtime = "nodejs"


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

    // ── 카드 합산 시뮬레이션 — 클라이언트 startDeal()과 동일한 seed/순서 ──
    // 클라이언트 호출순서: rand()→p1숫자, randSuit(), rand()→b1숫자, randSuit(),
    //                     rand()→p2숫자, randSuit(), rand()→b2숫자, randSuit()
    const makeSeededRand = (seed: number) => {
      let s = seed >>> 0
      return () => {
        s = Math.imul(s ^ (s >>> 15), s | 1)
        s ^= s + Math.imul(s ^ (s >>> 7), s | 61)
        return ((s ^ (s >>> 14)) >>> 0) / 0x100000000
      }
    }
    const seeded   = makeSeededRand(roundNumber)
    const rand     = () => Math.floor(seeded() * 10)  // 0~9 카드 숫자
    const randSuit = () => Math.floor(seeded() * 4)   // 무늬 소비용
    // 클라이언트와 정확히 동일한 순서
    const p1v = rand(); randSuit()
    const b1v = rand(); randSuit()
    const p2v = rand(); randSuit()
    const b2v = rand(); randSuit()

    const decStrSave = closePrice.toFixed(2).split(".")[1] ?? "00"
    const d1Save = parseInt(decStrSave[0] ?? "0")   // 소수점 첫째 → 뱅커 3번째 카드
    const d2Save = parseInt(decStrSave[1] ?? "0")   // 소수점 둘째 → 플레이어 3번째 카드

    // 카드 합산: (초기 2장 + 3번째 카드) % 10
    const pTotal = (p1v + p2v + d2Save) % 10
    const bTotal = (b1v + b2v + d1Save) % 10
    // 9에 가까운 쪽 승리 (클라이언트 handScore와 동일)
    const baccaratResultSave: "player" | "banker" | "tie" =
      pTotal > bTotal ? "player" : bTotal > pTotal ? "banker" : "tie"
    await admin
      .from("btc_closing_prices")
      .upsert(
        { time: closeTime, price: closePrice, baccarat_result: baccaratResultSave, b_score: d1Save, p_score: d2Save },
        { onConflict: "time", ignoreDuplicates: true }
      )
      .catch((e: Error) => console.error("[settle] btc_closing_prices upsert error:", e.message))

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
    // 소수점 둘째 자리(d2) 기준 — applyFinalDigit, ClosingPrices와 동일한 기준
    const decStr = resolvedClose.toFixed(2).split(".")[1] ?? "00"
    const d1 = parseInt(decStr[0] ?? "0")          // 소수점 첫째 → b_score (뱅커 3번째 카드)
    const d2 = parseInt(decStr[1] ?? "0")          // 소수점 둘째 → p_score (플레이어 3번째 카드)
    const lastDigit = d2
    const wonDigit: "under" | "over" = lastDigit <= 4 ? "under" : "over"
    const wonParity: "odd" | "even" = lastDigit % 2 === 0 ? "even" : "odd"
    // 카드 합산 시뮬레이션 결과 재사용 (위에서 이미 계산)
    // d1Save/d2Save = d1/d2 (같은 closePrice 기준)
    const baccaratResult: "player" | "banker" | "tie" = baccaratResultSave

    // ── race 결과 계산 (3분 라운드 기준) ────────────────────
    // race는 3분(180초) 라운드: raceRoundNumber = Math.floor(closeTime / 180)
    const raceRoundNumber = Math.floor(closeTime / 180)
    const racePoolKey     = `pool:race:${raceRoundNumber}`
    const raceUserSetKey  = `users:race:${raceRoundNumber}`

    // 직전 라운드가 방금 끝났는지 확인:
    // 이 tick의 closeTime이 현재 라운드의 첫 번째 30초 버킷이면 직전 라운드 정산
    const isFirstTickOfRound = (closeTime % 180) < 30

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

    // ── btc_closing_prices에 바카라 결과/점수 upsert (클라이언트 없어도 서버가 저장) ──
    // lastDigit = 소수점 둘째(d2) → pScore, bankerDigit = 소수점 ���째(d1) → bScore
    const bankerDigitForScore = parseInt(decStr[0] ?? "0")   // d1 → 뱅커 끝자리
    const playerDigitForScore = parseInt(decStr[1] ?? "0")   // d2 → 플레이어 끝자리
    await admin.from("btc_closing_prices").upsert({
      time: closeTime,
      price: resolvedClose,
      baccarat_result: baccaratResult,
      b_score: bankerDigitForScore,
      p_score: playerDigitForScore,
      b_raw_sum: bankerDigitForScore,  // 서버�����서는 한 장 기준(끝자리)
      p_raw_sum: playerDigitForScore,
    }, { onConflict: "time" }).catch(() => {})

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
    await redis.set(`game:result:baccarat:${roundNumber}`, JSON.stringify(resultPayload), { ex: 600 })

    // ── race 결과 저장 ────���────────────────────────────────────
    // 현재 라운드의 첫 번째 tick = 직전 라운드가 방금 종료됨 → 직전 라운드 집계 후 저장
    if (isFirstTickOfRound) {
      const prevRaceRound   = raceRoundNumber - 1
      const prevRaceSettled = await redis.get(`settled:race:${prevRaceRound}`).catch(() => null)

      if (!prevRaceSettled) {
        // 직전 라운드 전체 구간 = [prevRaceRound*180, (prevRaceRound+1)*180 - 1]
        // btc_closing_prices에서 해당 구간 모든 가격 집계 (서버 저장 데이터 기준)
        const rangeStart = prevRaceRound * 180
        const rangeEnd   = (prevRaceRound + 1) * 180 - 1
        const { data: rows } = await admin
          .from("btc_closing_prices")
          .select("price, time")
          .gte("time", rangeStart)
          .lte("time", rangeEnd)
          .order("time", { ascending: true })

        let bitScore  = 0
        let coinScore = 0
        if (rows && rows.length > 0) {
          for (const row of rows) {
            const p = typeof row.price === "string" ? parseFloat(row.price) : (row.price as number)
            const d = p.toFixed(2).split(".")[1] ?? "00"
            bitScore  += parseInt(d[0] ?? "0")   // d1 → BIT
            coinScore += parseInt(d[1] ?? "0")   // d2 → COIN
          }
        }

        // 직전 라운드 마지막 기준가
        const prevRaceEndTime = (prevRaceRound + 1) * 180
        const lastRow = rows?.[rows.length - 1]
        const prevClosePrice = lastRow
          ? (typeof lastRow.price === "string" ? parseFloat(lastRow.price) : (lastRow.price as number))
          : resolvedClose

        const raceWinner: "bit" | "coin" | "tie" =
          bitScore > coinScore ? "bit" : coinScore > bitScore ? "coin" : "tie"

        // DB upsert
        await admin.from("race_results").upsert({
          time:       prevRaceEndTime,
          price:      prevClosePrice,
          bit_score:  bitScore,
          coin_score: coinScore,
          winner:     raceWinner,
        }, { onConflict: "time" }).catch(() => {})

        // 중복 방지 플래그 (10분 TTL)
        await redis.set(`settled:race:${prevRaceRound}`, 1, { ex: 600 }).catch(() => {})

        // Redis 결과 캐시
        await redis.set(`game:result:race:${prevRaceRound}`, JSON.stringify({
          raceRoundNumber: prevRaceRound,
          raceWinner,
          closePrice: prevClosePrice,
          bitScore,
          coinScore,
          settledAt: Date.now(),
        }), { ex: 600 }).catch(() => {})
      }
    }

    // 정산 완료 플래그 (중복 방지, 5분 TTL)
    await redis.set(`settled:${roundNumber}`, 1, { ex: 300 })

    // ── 유저별 정산 (병렬) ────────────────────────────────────
    // 1) 라운드 확정 배당 / rounds DB id / 수수료 설정 / 역할별 수혜자 — 1회 조회
    // 2) 모든 유저 bets Redis 병렬 조회
    // 3) payout 계산 → bet_history bulk insert 1회
    // 4) 잔고 지급(add_balance RPC) 병렬 실행
    // 5) 잔고 동기화 병렬 실행
    // 6) house_stats / fee_logs / commission_logs 집계 후 병렬 insert
    const settlementResults: Array<{ userId: string; payout: number }> = []

    // ── 사전 공통 조회 (모두 병렬) ──────────────────────────
    const [
      finalOddsRaw,
      roundDbRow,
      commRatesData,
      masterProfileData,
      saProfileData,
    ] = await Promise.all([
      redis.get<string>(`odds:final:baccarat:${roundNumber}`),
      admin.from("rounds").select("id").eq("round_number", roundNumber).single().then(r => r.data).catch(() => null),
      admin.from("commission_rates").select("role, rate").then(r => r.data).catch(() => null),
      admin.from("profiles").select("id").eq("role", "master").limit(1).single().then(r => r.data).catch(() => null),
      admin.from("profiles").select("id").eq("role", "super_admin").limit(1).single().then(r => r.data).catch(() => null),
    ])

    // 확정 배당
    let roundFinalOdds: { player: number; banker: number; tie: number } | null = null
    if (finalOddsRaw) {
      try { roundFinalOdds = typeof finalOddsRaw === "string" ? JSON.parse(finalOddsRaw) : finalOddsRaw } catch {}
    }
    if (!roundFinalOdds) {
      const firstUserId = (userIds as string[])[0]
      let lpCfg = DEFAULT_LP_CONFIG
      if (firstUserId) {
        const { data: p } = await admin.from("profiles").select("branch_id").eq("id", firstUserId).single()
        if (p?.branch_id) {
          const { data: br } = await admin
            .from("branches")
            .select("lp_enabled, lp_amount_baccarat, lp_amount_race, lp_multiplier_baccarat, lp_multiplier_race")
            .eq("id", p.branch_id).single()
          if (br) {
            const { branchToLpConfig } = await import("@/lib/lp-system")
            lpCfg = branchToLpConfig(br)
          }
        }
      }
      const r = calcBaccaratOdds(baccaratPool, lpCfg, userCount)
      roundFinalOdds = {
        player: typeof r.playerOdds === "number" ? r.playerOdds : 1.95,
        banker: typeof r.bankerOdds === "number" ? r.bankerOdds : 1.95,
        tie:    typeof r.tieOdds    === "number" ? r.tieOdds    : 1.95,
      }
    }

    const roundDbId: string | null = (roundDbRow as any)?.id ?? null
    const rateMap: Record<string, number> = {}
    for (const r of (commRatesData ?? [])) rateMap[r.role] = Number(r.rate)
    const masterUserId: string | null = (masterProfileData as any)?.id ?? null
    const saUserId: string | null     = (saProfileData     as any)?.id ?? null
    const oddsSnap = roundFinalOdds

    // ── 모든 유저 bets + branch 캐시 병렬 조회 ──────────────
    const baccaratFallback = calcBaccaratOdds(baccaratPool, DEFAULT_LP_CONFIG, userCount)

    type UserBetData = {
      userId: string; bets: Record<string, unknown>
      branchId: string | null
      totalPayout: number; totalBet: number
    }

    const userBetDataList: UserBetData[] = (
      await Promise.all(
        (userIds as string[]).map(async (userId) => {
          const [betsRaw, cachedBranch] = await Promise.all([
            redis.get<string>(`bet:bets:baccarat:${roundNumber}:${userId}`),
            redis.get<string>(`profile:branch:${userId}`),
          ])
          if (!betsRaw) return null

          const bets = typeof betsRaw === "string" ? JSON.parse(betsRaw) : betsRaw

          // branch_id (캐시 miss면 DB 조회)
          let branchId: string | null = cachedBranch
          if (!branchId) {
            const { data: p } = await admin.from("profiles").select("branch_id").eq("id", userId).single()
            branchId = p?.branch_id ?? null
            if (branchId) redis.set(`profile:branch:${userId}`, branchId, { ex: 3600 }).catch(() => {})
          }

          let totalPayout = 0
          let totalBet    = 0

          if (bets.directionAmount as number > 0) {
            totalBet += bets.directionAmount as number
            if (bets.direction === wonDirection) totalPayout += Math.floor((bets.directionAmount as number) * FIXED_ODDS)
          }
          if (bets.digitAmount as number > 0) {
            totalBet += bets.digitAmount as number
            if (bets.digit === wonDigit) totalPayout += Math.floor((bets.digitAmount as number) * FIXED_ODDS)
          }
          if (bets.parityAmount as number > 0) {
            totalBet += bets.parityAmount as number
            if (bets.parity === wonParity) totalPayout += Math.floor((bets.parityAmount as number) * FIXED_ODDS)
          }
          if (bets.baccaratSide && (bets.baccaratAmount as number) > 0) {
            totalBet += bets.baccaratAmount as number
            const side = bets.baccaratSide as "player" | "banker" | "tie"
            if (side === baccaratResult) {
              totalPayout += Math.floor((bets.baccaratAmount as number) * (oddsSnap[side] as number))
            }
          }

          return { userId, bets, branchId, totalPayout, totalBet } as UserBetData
        })
      )
    ).filter(Boolean) as UserBetData[]

    // ── bet_history 전체 bulk insert (1번 DB 왕복) ──────────
    const allHistoryRows: Record<string, unknown>[] = []
    for (const { userId, bets, branchId, totalPayout } of userBetDataList) {
      if ((bets.directionAmount as number) > 0) {
        const won = bets.direction === wonDirection
        allHistoryRows.push({
          user_id: userId, branch_id: branchId, round_id: roundDbId,
          bet_direction: bets.direction, bet_digit: null, bet_parity: null,
          bet_amount: bets.directionAmount,
          payout: won ? Math.floor((bets.directionAmount as number) * FIXED_ODDS) : 0,
          result: won ? "win" : "lose",
        })
      }
      if ((bets.digitAmount as number) > 0) {
        const won = bets.digit === wonDigit
        allHistoryRows.push({
          user_id: userId, branch_id: branchId, round_id: roundDbId,
          bet_direction: null, bet_digit: bets.digit, bet_parity: null,
          bet_amount: bets.digitAmount,
          payout: won ? Math.floor((bets.digitAmount as number) * FIXED_ODDS) : 0,
          result: won ? "win" : "lose",
        })
      }
      if ((bets.parityAmount as number) > 0) {
        const won = bets.parity === wonParity
        allHistoryRows.push({
          user_id: userId, branch_id: branchId, round_id: roundDbId,
          bet_direction: null, bet_digit: null, bet_parity: bets.parity,
          bet_amount: bets.parityAmount,
          payout: won ? Math.floor((bets.parityAmount as number) * FIXED_ODDS) : 0,
          result: won ? "win" : "lose",
        })
      }
      if (bets.baccaratSide && (bets.baccaratAmount as number) > 0) {
        const side = bets.baccaratSide as "player" | "banker" | "tie"
        const won  = side === baccaratResult
        allHistoryRows.push({
          user_id: userId, branch_id: branchId, round_id: roundDbId,
          bet_direction: `baccarat_${side}`, bet_digit: null, bet_parity: null,
          bet_amount: bets.baccaratAmount,
          payout: won ? Math.floor((bets.baccaratAmount as number) * (oddsSnap[side] as number)) : 0,
          result: won ? "win" : "lose",
        })
      }
    }
    if (allHistoryRows.length > 0) {
      await admin.from("bet_history").insert(allHistoryRows).catch(() => {})
    }

    // ── 당첨금 지급 + 잔고 동기화 병렬 ─────────────────────
    await Promise.all(
      userBetDataList.map(async ({ userId, totalPayout }) => {
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
          const { data: balData } = await admin
            .from("balances").select("amount").eq("user_id", userId).single()
          if (balData) {
            await Promise.all([
              redis.set(`balance:${userId}`, balData.amount, { ex: 3600 }),
              redis.incr(`balance_version:${userId}`),
            ])
          }
        }
      })
    )

    // ── 디버그 로그 병렬 업데이트 ────────────────────────────
    await Promise.all(
      userBetDataList.map(async ({ userId, bets, totalPayout }) => {
        const debugLogKey = `bet:debug:baccarat:${roundNumber}:${userId}`
        const existingLog = await redis.get<string>(debugLogKey).catch(() => null)
        if (!existingLog) return
        try {
          const log = typeof existingLog === "string" ? JSON.parse(existingLog) : existingLog
          const side = bets.baccaratSide as string
          log.finalOdds   = roundFinalOdds
          log.settledOdds = roundFinalOdds ? (roundFinalOdds as Record<string, number>)[side] ?? null : null
          log.payout      = totalPayout
          log.result      = bets.baccaratSide === baccaratResult ? "win" : "lose"
          log.settledAt   = new Date().toISOString()
          log.baccaratResult = baccaratResult
          log.settleSource   = "settle/route.ts"
          await redis.set(debugLogKey, JSON.stringify(log), { ex: 3600 }).catch(() => {})
        } catch {}
      })
    )

    // ── house_stats / fee_logs / commission_logs 집계 ────────
    // 이미 계산된 userBetDataList 재사용 — Redis 재조회 없음
    {
      const upsertCommission = async (uid: string | null, fee: number) => {
        if (!uid || fee <= 0) return
        await admin.rpc("increment_commission_balance", { p_user_id: uid, p_amount: fee })
          .catch(() => {})
      }

      const branchAccum: Record<string, { totalBet: number; totalPayout: number }> = {}
      const feeLogRows: Record<string, unknown>[]        = []
      const commissionLogRows: Record<string, unknown>[] = []
      const commissionPayouts: Array<() => Promise<void>> = []

      for (const { userId, bets, branchId, totalBet } of userBetDataList) {
        if (!branchId) continue

        // house_stats용 payout (확정 배당 기준)
        let hsPayout = 0
        if ((bets.directionAmount as number) > 0 && bets.direction === wonDirection)
          hsPayout += Math.floor((bets.directionAmount as number) * FIXED_ODDS)
        if ((bets.digitAmount as number) > 0 && bets.digit === wonDigit)
          hsPayout += Math.floor((bets.digitAmount as number) * FIXED_ODDS)
        if ((bets.parityAmount as number) > 0 && bets.parity === wonParity)
          hsPayout += Math.floor((bets.parityAmount as number) * FIXED_ODDS)
        if (bets.baccaratSide && (bets.baccaratAmount as number) > 0) {
          const side = bets.baccaratSide as "player" | "banker" | "tie"
          if (side === baccaratResult) {
            hsPayout += Math.floor((bets.baccaratAmount as number) * (oddsSnap[side] as number))
          } else if (baccaratResult === "tie" && (side === "player" || side === "banker")) {
            hsPayout += bets.baccaratAmount as number
          }
        }

        if (!branchAccum[branchId]) branchAccum[branchId] = { totalBet: 0, totalPayout: 0 }
        branchAccum[branchId].totalBet    += totalBet
        branchAccum[branchId].totalPayout += hsPayout

        if (totalBet > 0) {
          const totalRate      = Object.values(rateMap).reduce((s, v) => s + v, 0)
          const totalFee       = Math.floor(totalBet * totalRate)
          const masterFee      = Math.floor(totalBet * (rateMap["master"]       ?? 0))
          const superAdminFee  = Math.floor(totalBet * (rateMap["super_admin"]  ?? 0))
          const adminFee       = Math.floor(totalBet * (rateMap["admin"]        ?? 0))
          const branchAdminFee = Math.floor(totalBet * (rateMap["branch_admin"] ?? 0))

          feeLogRows.push({
            round_number: roundNumber, game_type: "baccarat",
            user_id: userId, branch_id: branchId,
            bet_amount: totalBet, fee_amount: totalFee,
          })
          commissionLogRows.push({
            round_number: roundNumber, game_type: "baccarat",
            user_id: userId, branch_id: branchId, bet_amount: totalBet,
            master_fee: masterFee, super_admin_fee: superAdminFee,
            branch_admin_fee: branchAdminFee, admin_fee: adminFee, total_fee: totalFee,
            master_id: masterUserId, super_admin_id: saUserId, admin_id: branchId,
          })

          // commission_balances RPC (병렬 예약)
          commissionPayouts.push(() => Promise.all([
            upsertCommission(masterUserId, masterFee),
            upsertCommission(saUserId, superAdminFee),
            upsertCommission(branchId, adminFee),
          ]).then(async () => {
            if (branchAdminFee > 0) {
              const { data: bp } = await admin.from("profiles")
                .select("super_admin_id").eq("id", branchId!).single().catch(() => ({ data: null }))
              await upsertCommission((bp as any)?.super_admin_id ?? null, branchAdminFee)
            }
          }))
        }
      }

      // bulk insert + 병렬 RPC
      await Promise.all([
        feeLogRows.length        > 0 ? admin.from("fee_logs").insert(feeLogRows).catch(() => {})               : Promise.resolve(),
        commissionLogRows.length > 0 ? admin.from("commission_logs").insert(commissionLogRows).catch(() => {}) : Promise.resolve(),
        ...commissionPayouts.map(fn => fn()),
        ...Object.entries(branchAccum).map(([bId, acc]) => {
          const fee    = Math.floor(acc.totalBet * 0.20)
          const lpUsed = Math.max(0, acc.totalPayout - acc.totalBet + fee)
          return admin.rpc("increment_house_stats", {
            p_branch_id: bId, p_game_type: "baccarat",
            p_bet: acc.totalBet, p_payout: acc.totalPayout, p_fee: fee, p_lp_used: lpUsed,
          }).catch(() => {})
        }),
      ])
    }
    if (!roundFinalOdds) {
      // fallback: 지점 LP 설정으로 settle 시점 풀 재계산
      // 첫 번째 유저의 branch_id로 LP 설정 조회
      const firstUserId = (userIds as string[])[0]
      let lpCfg = DEFAULT_LP_CONFIG
      if (firstUserId) {
        const { data: p } = await admin.from("profiles").select("branch_id").eq("id", firstUserId).single()
        if (p?.branch_id) {
          const { data: br } = await admin
            .from("branches")
            .select("lp_enabled, lp_amount_baccarat, lp_amount_race, lp_multiplier_baccarat, lp_multiplier_race")
            .eq("id", p.branch_id).single()
          if (br) {
            const { branchToLpConfig } = await import("@/lib/lp-system")
            lpCfg = branchToLpConfig(br)
          }
        }
      }
      const r = calcBaccaratOdds(baccaratPool, lpCfg, userCount)
      roundFinalOdds = {
        player: typeof r.playerOdds === "number" ? r.playerOdds : 1.95,
        banker: typeof r.bankerOdds === "number" ? r.bankerOdds : 1.95,
        tie:    typeof r.tieOdds    === "number" ? r.tieOdds    : 1.95,
      }
    }

    for (const userId of userIds as string[]) {
      const betsKey = `bet:bets:baccarat:${roundNumber}:${userId}`
      const betsRaw = await redis.get<string>(betsKey)
      if (!betsRaw) continue

      const bets = typeof betsRaw === "string" ? JSON.parse(betsRaw) : betsRaw

      // 모든 유저에게 동일한 라운드 확정 배당 적용
      const oddsSnap = roundFinalOdds

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
        // 정확히 맞춰야만 지급 — 타이 결과 시 player/banker는 LOSS (반환 없음)
        if (side === baccaratResult) {
          const odds = oddsSnap[side] as number
          totalPayout += Math.floor(bets.baccaratAmount * odds)
        }
      }

      // ── bet_history INSERT (바카라 게임) ─────────────────────
      {
        const profileCacheKey = `profile:branch:${userId}`
        let userBranchId: string | null = await redis.get<string>(profileCacheKey)
        if (!userBranchId) {
          const { data: p } = await admin.from("profiles").select("branch_id").eq("id", userId).single()
          userBranchId = p?.branch_id ?? null
          if (userBranchId) await redis.set(profileCacheKey, userBranchId, { ex: 3600 })
        }

        // round DB id 조회 (round_number → uuid)
        const { data: roundRow } = await admin
          .from("rounds")
          .select("id")
          .eq("round_number", roundNumber)
          .single()
        const roundDbId: string | null = roundRow?.id ?? null

        const historyRows: Record<string, unknown>[] = []

        if (bets.directionAmount > 0) {
          const won = bets.direction === wonDirection
          historyRows.push({
            user_id: userId, branch_id: userBranchId, round_id: roundDbId,
            bet_direction: bets.direction, bet_digit: null, bet_parity: null,
            bet_amount: bets.directionAmount,
            payout: won ? Math.floor(bets.directionAmount * FIXED_ODDS) : 0,
            result: won ? "win" : "lose",
          })
        }
        if (bets.digitAmount > 0) {
          const won = bets.digit === wonDigit
          historyRows.push({
            user_id: userId, branch_id: userBranchId, round_id: roundDbId,
            bet_direction: null, bet_digit: bets.digit, bet_parity: null,
            bet_amount: bets.digitAmount,
            payout: won ? Math.floor(bets.digitAmount * FIXED_ODDS) : 0,
            result: won ? "win" : "lose",
          })
        }
        if (bets.parityAmount > 0) {
          const won = bets.parity === wonParity
          historyRows.push({
            user_id: userId, branch_id: userBranchId, round_id: roundDbId,
            bet_direction: null, bet_digit: null, bet_parity: bets.parity,
            bet_amount: bets.parityAmount,
            payout: won ? Math.floor(bets.parityAmount * FIXED_ODDS) : 0,
            result: won ? "win" : "lose",
          })
        }
        if (bets.baccaratSide && bets.baccaratAmount > 0) {
          const side = bets.baccaratSide as "player" | "banker" | "tie"
          const won = side === baccaratResult
          const appliedOdds = oddsSnap[side] as number
          historyRows.push({
            user_id: userId, branch_id: userBranchId, round_id: roundDbId,
            bet_direction: `baccarat_${side}`, bet_digit: null, bet_parity: null,
            bet_amount: bets.baccaratAmount,
            payout: won ? Math.floor(bets.baccaratAmount * appliedOdds) : 0,
            result: won ? "win" : "lose",
          })
        }

        if (historyRows.length > 0) {
          await admin.from("bet_history").insert(historyRows).then(() => {}).catch(() => {})
        }
      }

      // ── 디버그 로그 업데이트: 정산 완료 정보 기록 ──────────────
      const debugLogKey = `bet:debug:baccarat:${roundNumber}:${userId}`
      const existingLog = await redis.get<string>(debugLogKey).catch(() => null)
      if (existingLog) {
        try {
          const log = typeof existingLog === "string" ? JSON.parse(existingLog) : existingLog
          const side = bets.baccaratSide as string
          log.finalOdds = roundFinalOdds
          log.settledOdds = roundFinalOdds ? roundFinalOdds[side] ?? null : null
          log.payout = totalPayout
          log.result = bets.baccaratSide === baccaratResult ? "win" : "lose"
          log.settledAt = new Date().toISOString()
          log.baccaratResult = baccaratResult
          log.settleSource = "settle/route.ts"
          await redis.set(debugLogKey, JSON.stringify(log), { ex: 3600 }).catch(() => {})
        } catch {}
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

    // ── 수수료 요율 로드 (DB에서 한 번만 조회) ──────────────
    const { data: commRates } = await admin.from("commission_rates").select("role, rate")
    const rateMap: Record<string, number> = {}
    for (const r of (commRates ?? [])) rateMap[r.role] = Number(r.rate)

    // 역할별 수혜자 캐시 (라운드당 1회 조회)
    // master, super_admin은 시스템에 1명씩만 존재한다고 가정
    const { data: masterProfile } = await admin.from("profiles").select("id").eq("role", "master").limit(1).single().catch(() => ({ data: null }))
    const masterUserId: string | null = (masterProfile as any)?.id ?? null
    const { data: saProfile } = await admin.from("profiles").select("id").eq("role", "super_admin").limit(1).single().catch(() => ({ data: null }))
    const saUserId: string | null = (saProfile as any)?.id ?? null

    // ── 바카라 house_stats 지점별 집계 ──────────────────────
    // 유저별 배팅액과 지급액을 집계해 지점별 수수료 / 총배팅 / 총지급 기록
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

        // house_stats용 settle 시점 배당 계산 (snap 없으면 fallback)
        const baccaratFallback = calcBaccaratOdds(baccaratPool, DEFAULT_LP_CONFIG, userCount)

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
            const rawOdds = side === "player" ? baccaratFallback.playerOdds
              : side === "banker" ? baccaratFallback.bankerOdds
              : baccaratFallback.tieOdds
            const odds = (typeof rawOdds === "number" && rawOdds > 0) ? rawOdds : 1.95
            userPayout += Math.floor(bets.baccaratAmount * odds)
          } else if (baccaratResult === "tie" && (side === "player" || side === "banker")) {
            userPayout += bets.baccaratAmount
          }
        }
        if (!branchAccum[branchId]) branchAccum[branchId] = { totalBet: 0, totalPayout: 0 }
        branchAccum[branchId].totalBet     += userBet
        branchAccum[branchId].totalPayout  += userPayout

        // 수수료 분배 (commission_rates 기준)
        if (userBet > 0) {
          const totalRate = Object.values(rateMap).reduce((s, v) => s + v, 0)
          const totalFee  = Math.floor(userBet * totalRate)
          const masterFee      = Math.floor(userBet * (rateMap["master"]       ?? 0))
          const superAdminFee  = Math.floor(userBet * (rateMap["super_admin"]  ?? 0))
          const adminFee       = Math.floor(userBet * (rateMap["admin"]        ?? 0))
          const branchAdminFee = Math.floor(userBet * (rateMap["branch_admin"] ?? 0))

          // fee_logs 기록
          await admin.from("fee_logs").insert({
            round_number: roundNumber,
            game_type:    "baccarat",
            user_id:      userId,
            branch_id:    branchId,
            bet_amount:   userBet,
            fee_amount:   totalFee,
          }).then(() => {}).catch(() => {})

          // commission_logs 기록 + 잔고 분배
          // 지점(admin) 담당자 조��
          const { data: branchRow } = await admin.from("profiles")
            .select("id, branch_admin_id:id")
            .eq("id", branchId).single().catch(() => ({ data: null }))
          const { data: branchAdminRow } = await admin.from("profiles")
            .select("id").eq("id", branchId).single().catch(() => ({ data: null }))

          // commission_logs 삽입
          await admin.from("commission_logs").insert({
            round_number: roundNumber,
            game_type:    "baccarat",
            user_id:      userId,
            branch_id:    branchId,
            bet_amount:   userBet,
            master_fee:       masterFee,
            super_admin_fee:  superAdminFee,
            branch_admin_fee: branchAdminFee,
            admin_fee:        adminFee,
            total_fee:        totalFee,
            master_id:        masterUserId,
            super_admin_id:   saUserId,
            admin_id:         branchId, // 지점 admin = branchId
          }).then(() => {}).catch(() => {})

          // commission_balances upsert (각 역할 수혜자에게 누적)
          const upsertCommission = async (uid: string | null, fee: number) => {
            if (!uid || fee <= 0) return
            await admin.rpc("increment_commission_balance", { p_user_id: uid, p_amount: fee })
              .then(() => {}).catch(() => {})
          }
          await Promise.all([
            upsertCommission(masterUserId, masterFee),
            upsertCommission(saUserId, superAdminFee),
            upsertCommission(branchId, adminFee), // 지점 admin ID = branch_id
          ])

          // branch_admin: 지점의 총판 조회 후 분배
          if (branchAdminFee > 0) {
            const { data: branchProfile } = await admin.from("profiles")
              .select("super_admin_id").eq("id", branchId).single().catch(() => ({ data: null }))
            const baId = (branchProfile as any)?.super_admin_id ?? null
            await upsertCommission(baId, branchAdminFee)
          }
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

    // ── race 유저 정산 (새 라운드 첫 tick에서 직전 라운드 정산) ──
    if (isLastRaceTick && raceUserIds.length > 0) {
      // raceWinner는 위 블록에서 race_results 테이블 기반으로 이미 결정됨
      // Redis에서 직전 라운드 결과를 읽어 사용
      const prevResultRaw = await redis.get<string>(`game:result:race:${prevRaceRoundNumber}`)
      const prevResult = prevResultRaw
        ? (typeof prevResultRaw === "string" ? JSON.parse(prevResultRaw) : prevResultRaw)
        : null
      const raceWinner: "bit" | "coin" | "tie" = prevResult?.raceWinner
        ?? (racePool.bit > racePool.coin ? "bit"
           : racePool.coin > racePool.bit ? "coin" : "tie")

      // 직전 라운드의 유저 목록 조회
      const prevRaceUserSetKey = `users:race:${prevRaceRoundNumber}`
      const prevRaceUserIds: string[] = await redis.smembers(prevRaceUserSetKey).catch(() => [])
      const settleTargetIds = prevRaceUserIds.length > 0 ? prevRaceUserIds : (raceUserIds as string[])

      // race 라운드 확정 배당 조회 — SSE가 배팅 마감 시 저장한 단일 키
      const raceFinalRaw = await redis.get<string>(`odds:final:race:${prevRaceRoundNumber}`)
      let raceFinalOdds: { bit: number; coin: number; tie: number } | null = null
      if (raceFinalRaw) {
        try { raceFinalOdds = typeof raceFinalRaw === "string" ? JSON.parse(raceFinalRaw) : raceFinalRaw } catch {}
      }
      if (!raceFinalOdds) {
        // fallback: settle 시점 풀 재계산
        const rFirstId = settleTargetIds[0]
        let lpCfgR = DEFAULT_LP_CONFIG
        if (rFirstId) {
          const { data: pR } = await admin.from("profiles").select("branch_id").eq("id", rFirstId).single()
          if (pR?.branch_id) {
            const { data: brR } = await admin
              .from("branches")
              .select("lp_enabled, lp_amount_baccarat, lp_amount_race, lp_multiplier_baccarat, lp_multiplier_race")
              .eq("id", pR.branch_id).single()
            if (brR) {
              const { branchToLpConfig } = await import("@/lib/lp-system")
              lpCfgR = branchToLpConfig(brR)
            }
          }
        }
        const r = calcRaceOdds(racePool, lpCfgR, raceUserCount)
        raceFinalOdds = {
          bit:  typeof r.bitOdds  === "number" ? r.bitOdds  : 1.95,
          coin: typeof r.coinOdds === "number" ? r.coinOdds : 1.95,
          tie:  typeof r.tieOdds  === "number" ? r.tieOdds  : 1.95,
        }
      }

      // ── race 유저 bets + branch 병렬 조회 ──────────────────
      type RaceUserBetData = {
        userId: string; bets: Record<string, unknown>
        branchId: string | null
        totalPayout: number; totalBet: number
      }
      const raceUserBetDataList: RaceUserBetData[] = (
        await Promise.all(
          settleTargetIds.map(async (userId) => {
            const [betsRaw, cachedBranch] = await Promise.all([
              redis.get<string>(`bet:bets:race:${prevRaceRoundNumber}:${userId}`),
              redis.get<string>(`profile:branch:${userId}`),
            ])
            if (!betsRaw) return null
            const bets = typeof betsRaw === "string" ? JSON.parse(betsRaw) : betsRaw

            let branchId: string | null = cachedBranch
            if (!branchId) {
              const { data: p } = await admin.from("profiles").select("branch_id").eq("id", userId).single()
              branchId = p?.branch_id ?? null
              if (branchId) redis.set(`profile:branch:${userId}`, branchId, { ex: 3600 }).catch(() => {})
            }

            let totalPayout = 0
            let totalBet    = 0

            if ((bets.directionAmount as number) > 0) {
              totalBet += bets.directionAmount as number
              if (bets.direction === wonDirection) totalPayout += Math.floor((bets.directionAmount as number) * FIXED_ODDS)
            }
            if ((bets.digitAmount as number) > 0) {
              totalBet += bets.digitAmount as number
              if (bets.digit === wonDigit) totalPayout += Math.floor((bets.digitAmount as number) * FIXED_ODDS)
            }
            if ((bets.parityAmount as number) > 0) {
              totalBet += bets.parityAmount as number
              if (bets.parity === wonParity) totalPayout += Math.floor((bets.parityAmount as number) * FIXED_ODDS)
            }
            if (bets.raceSide && (bets.raceAmount as number) > 0) {
              totalBet += bets.raceAmount as number
              const side = bets.raceSide as "bit" | "coin" | "tie"
              if (side === raceWinner) {
                const odds = (typeof raceFinalOdds![side] === "number" && raceFinalOdds![side] > 0) ? raceFinalOdds![side] : 1.95
                totalPayout += Math.floor((bets.raceAmount as number) * odds)
              } else if (raceWinner === "tie" && (side === "bit" || side === "coin")) {
                totalPayout += bets.raceAmount as number
              }
            }
            return { userId, bets, branchId, totalPayout, totalBet } as RaceUserBetData
          })
        )
      ).filter(Boolean) as RaceUserBetData[]

      // ── race bet_history bulk insert ─────────────────────
      const raceHistoryRows: Record<string, unknown>[] = []
      for (const { userId, bets, branchId } of raceUserBetDataList) {
        if ((bets.directionAmount as number) > 0) {
          const won = bets.direction === wonDirection
          raceHistoryRows.push({ user_id: userId, branch_id: branchId, round_id: null,
            bet_direction: bets.direction, bet_digit: null, bet_parity: null,
            bet_amount: bets.directionAmount,
            payout: won ? Math.floor((bets.directionAmount as number) * FIXED_ODDS) : 0, result: won ? "win" : "lose" })
        }
        if ((bets.digitAmount as number) > 0) {
          const won = bets.digit === wonDigit
          raceHistoryRows.push({ user_id: userId, branch_id: branchId, round_id: null,
            bet_direction: null, bet_digit: bets.digit, bet_parity: null,
            bet_amount: bets.digitAmount,
            payout: won ? Math.floor((bets.digitAmount as number) * FIXED_ODDS) : 0, result: won ? "win" : "lose" })
        }
        if ((bets.parityAmount as number) > 0) {
          const won = bets.parity === wonParity
          raceHistoryRows.push({ user_id: userId, branch_id: branchId, round_id: null,
            bet_direction: null, bet_digit: null, bet_parity: bets.parity,
            bet_amount: bets.parityAmount,
            payout: won ? Math.floor((bets.parityAmount as number) * FIXED_ODDS) : 0, result: won ? "win" : "lose" })
        }
        if (bets.raceSide && (bets.raceAmount as number) > 0) {
          const side = bets.raceSide as "bit" | "coin" | "tie"
          const won  = side === raceWinner
          raceHistoryRows.push({ user_id: userId, branch_id: branchId, round_id: null,
            bet_direction: `race_${side}`, bet_digit: null, bet_parity: null,
            bet_amount: bets.raceAmount,
            payout: won ? Math.floor((bets.raceAmount as number) * (raceFinalOdds![side] as number)) : 0,
            result: won ? "win" : "lose" })
        }
      }
      if (raceHistoryRows.length > 0) {
        await admin.from("bet_history").insert(raceHistoryRows).catch(() => {})
      }

      // ── race 당첨금 지급 + 잔고 동기화 병렬 ────────────────
      await Promise.all(
        raceUserBetDataList.map(async ({ userId, totalPayout }) => {
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
            const { data: balData } = await admin.from("balances").select("amount").eq("user_id", userId).single()
            if (balData) {
              await Promise.all([
                redis.set(`balance:${userId}`, balData.amount, { ex: 3600 }),
                redis.incr(`balance_version:${userId}`),
              ])
            }
          }
        })
      )

      console.log(`[settle] race round=${prevRaceRoundNumber} winner=${raceWinner} settled=${raceUserBetDataList.length} users`)

      // ── round_bet_logs race 스냅샷 (fire-and-forget) ────────
      ;(async () => {
        try {
          const raceProfileMap = new Map<string, string>()
          if ((raceUserIds as string[]).length > 0) {
            const { data: rp } = await admin.from("profiles").select("id, username").in("id", raceUserIds as string[])
            for (const p of rp ?? []) raceProfileMap.set(p.id, p.username)
          }
          const raceAllBets = raceUserBetDataList
            .filter(d => d.bets.raceSide && (d.bets.raceAmount as number) > 0)
            .map(d => ({ userId: d.userId, username: raceProfileMap.get(d.userId) ?? d.userId,
              side: d.bets.raceSide as string, amount: d.bets.raceAmount as number }))
          const raceTotalAmount = raceAllBets.reduce((s, b) => s + b.amount, 0)
          await admin.from("round_bet_logs").upsert({
            game_type: "race", round_number: prevRaceRoundNumber,
            round_started_at: new Date(prevRaceRoundNumber * 180 * 1000).toISOString(),
            round_ended_at:   new Date((prevRaceRoundNumber + 1) * 180 * 1000).toISOString(),
            total_users: raceAllBets.length, total_amount: raceTotalAmount,
            total_fee: Math.floor(raceTotalAmount * 0.20), winner: raceWinner, bets: raceAllBets,
          }, { onConflict: "game_type,round_number" })
        } catch (_) {}
      })()

      // ── race house_stats / fee_logs / commission_logs 병렬 ──
      {
        const upsertCommission = async (uid: string | null, fee: number) => {
          if (!uid || fee <= 0) return
          await admin.rpc("increment_commission_balance", { p_user_id: uid, p_amount: fee }).catch(() => {})
        }
        const raceBranchAccum: Record<string, { totalBet: number; totalPayout: number }> = {}
        const raceFeeRows: Record<string, unknown>[]        = []
        const raceCommRows: Record<string, unknown>[]       = []
        const raceCommPayouts: Array<() => Promise<void>>   = []

        for (const { userId, bets, branchId, totalBet, totalPayout } of raceUserBetDataList) {
          if (!branchId) continue
          if (!raceBranchAccum[branchId]) raceBranchAccum[branchId] = { totalBet: 0, totalPayout: 0 }
          raceBranchAccum[branchId].totalBet    += totalBet
          raceBranchAccum[branchId].totalPayout += totalPayout

          if (totalBet > 0) {
            const totalRate      = Object.values(rateMap).reduce((s, v) => s + v, 0)
            const totalFee       = Math.floor(totalBet * totalRate)
            const masterFee      = Math.floor(totalBet * (rateMap["master"]       ?? 0))
            const superAdminFee  = Math.floor(totalBet * (rateMap["super_admin"]  ?? 0))
            const adminFee       = Math.floor(totalBet * (rateMap["admin"]        ?? 0))
            const branchAdminFee = Math.floor(totalBet * (rateMap["branch_admin"] ?? 0))
            raceFeeRows.push({ round_number: prevRaceRoundNumber, game_type: "race",
              user_id: userId, branch_id: branchId, bet_amount: totalBet, fee_amount: totalFee })
            raceCommRows.push({ round_number: prevRaceRoundNumber, game_type: "race",
              user_id: userId, branch_id: branchId, bet_amount: totalBet,
              master_fee: masterFee, super_admin_fee: superAdminFee,
              branch_admin_fee: branchAdminFee, admin_fee: adminFee, total_fee: totalFee,
              master_id: masterUserId, super_admin_id: saUserId, admin_id: branchId })
            raceCommPayouts.push(() => Promise.all([
              upsertCommission(masterUserId, masterFee),
              upsertCommission(saUserId, superAdminFee),
              upsertCommission(branchId, adminFee),
            ]).then(async () => {
              if (branchAdminFee > 0) {
                const { data: bp } = await admin.from("profiles")
                  .select("super_admin_id").eq("id", branchId!).single().catch(() => ({ data: null }))
                await upsertCommission((bp as any)?.super_admin_id ?? null, branchAdminFee)
              }
            }))
          }
        }
        await Promise.all([
          raceFeeRows.length  > 0 ? admin.from("fee_logs").insert(raceFeeRows).catch(() => {})               : Promise.resolve(),
          raceCommRows.length > 0 ? admin.from("commission_logs").insert(raceCommRows).catch(() => {})       : Promise.resolve(),
          ...raceCommPayouts.map(fn => fn()),
          ...Object.entries(raceBranchAccum).map(([bId, acc]) => {
            const fee    = Math.floor(acc.totalBet * 0.20)
            const lpUsed = Math.max(0, acc.totalPayout - acc.totalBet + fee)
            return admin.rpc("increment_house_stats", {
              p_branch_id: bId, p_game_type: "race",
              p_bet: acc.totalBet, p_payout: acc.totalPayout, p_fee: fee, p_lp_used: lpUsed,
            }).catch(() => {})
          }),
        ])
      }
    }

    // ── rounds 테이블 기록 (라운드당 1회, ended_at 기준 upsert로 중복 방지) ───
    await admin.from("rounds").upsert({
      base_price: basePrice,
      result_price: resolvedClose,
      result_digit: lastDigit,
      baccarat_result: baccaratResult,
      started_at: new Date((roundNumber - 1) * 30 * 1000).toISOString(),
      ended_at: new Date(roundNumber * 30 * 1000).toISOString(),
    }, { onConflict: "ended_at", ignoreDuplicates: true }).then(() => {}).catch(() => {})

    // ── round_bet_logs: 라운드 전체 배팅 현황 스냅샷 저장 ──────────
    // 테이블 없으면 에러 무시 (setup-db 실행 후 활성화)
    ;(async () => {
      try {
        // 이번 라운드 전체 유저 bets 수집
        const allBetEntries: Array<{
          userId: string; username?: string; side: string; amount: number
        }> = []

        // 유저 username 일괄 조회
        const profileMap = new Map<string, string>()
        if ((userIds as string[]).length > 0) {
          const { data: profiles } = await admin
            .from("profiles")
            .select("id, username")
            .in("id", userIds as string[])
          for (const p of profiles ?? []) profileMap.set(p.id, p.username)
        }

        for (const uid of userIds as string[]) {
          const betsKey = `bet:bets:baccarat:${roundNumber}:${uid}`
          const betsRaw = await redis.get<string>(betsKey)
          if (!betsRaw) continue
          const bets = typeof betsRaw === "string" ? JSON.parse(betsRaw) : betsRaw
          const username = profileMap.get(uid) ?? uid
          if (bets.baccaratSide && bets.baccaratAmount > 0) {
            allBetEntries.push({ userId: uid, username, side: bets.baccaratSide, amount: bets.baccaratAmount })
          }
        }

        const totalAmount = allBetEntries.reduce((s, b) => s + b.amount, 0)
        const totalFee    = Math.floor(totalAmount * 0.20)

        await admin.from("round_bet_logs").upsert({
          game_type:        "baccarat",
          round_number:     roundNumber,
          round_started_at: new Date((roundNumber - 1) * 30 * 1000).toISOString(),
          round_ended_at:   new Date(roundNumber * 30 * 1000).toISOString(),
          total_users:      allBetEntries.length,
          total_amount:     totalAmount,
          total_fee:        totalFee,
          winner:           baccaratResult,
          bets:             allBetEntries,
        }, { onConflict: "game_type,round_number" })
      } catch (_) { /* round_bet_logs 테이블 미생성 시 무시 */ }
    })()

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
