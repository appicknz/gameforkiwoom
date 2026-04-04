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
    const racePoolKey     = `pool:race:${raceRoundNumber}`
    const raceUserSetKey  = `users:race:${raceRoundNumber}`
    // 서버측 race 스코어 누적 키 (30초 tick마다 합산)
    const raceScoreKey    = `race:score:${raceRoundNumber}`

    // 서버에서 직접 소수점 스코어 누적: d1(BIT) + d2(COIN)
    // closeTime % 300 < 300: 모든 30초 tick에서 현재 라운드 스코어에 누적
    const dec = resolvedClose.toFixed(2).split(".")[1] ?? "00"
    const d1  = parseInt(dec[0] ?? "0")  // 소수점 첫째 → BIT
    const d2  = parseInt(dec[1] ?? "0")  // 소수점 둘째 → COIN
    await redis.hincrby(raceScoreKey, "bit",  d1).catch(() => {})
    await redis.hincrby(raceScoreKey, "coin", d2).catch(() => {})
    await redis.expire(raceScoreKey, 700).catch(() => {})  // 5분+여유

    const [racePoolData, raceUserIds, raceScoreData] = await Promise.all([
      redis.hgetall(racePoolKey).catch(() => null),
      redis.smembers(raceUserSetKey).catch(() => [] as string[]),
      redis.hgetall(raceScoreKey).catch(() => null),
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

    // race 결과 저장 및 정산 트리거
    // 정산 시점: 라운드 경계(closeTime % 300 === 0~29) — 새 라운드 첫 tick에서 이전 라운드 정산
    // 이 시점엔 클라이언트가 이미 /api/race-results에 저장했을 확률이 높음
    const prevRaceRoundNumber = raceRoundNumber - 1  // 직전 5분 라운드
    const isFirstTickOfNewRace = (closeTime % 300) < 30  // 새 라운드 첫 30초 구간
    const prevRaceSettledKey = `settled:race:${prevRaceRoundNumber}`
    const raceAlreadySettled = await redis.get(prevRaceSettledKey)
    const isLastRaceTick = isFirstTickOfNewRace && !raceAlreadySettled

    if (isLastRaceTick) {
      // 직전 5분 라운드 스코어: Redis 누적값 사용 (서버가 직접 누적)
      const prevRaceScoreKey = `race:score:${prevRaceRoundNumber}`
      const prevRaceScore    = await redis.hgetall(prevRaceScoreKey).catch(() => null)
      const serverBitScore   = parseInt((prevRaceScore?.bit  as string) ?? "0") || 0
      const serverCoinScore  = parseInt((prevRaceScore?.coin as string) ?? "0") || 0

      // 직전 라운드 종료 가격: DB에서 조회 (closeTime이 새 라운드 첫 tick이므로 -30 이전 값)
      const prevRaceResultTime = prevRaceRoundNumber * 300  // :00초 경계
      const { data: prevClosingRow } = await admin
        .from("btc_closing_prices")
        .select("price")
        .lte("time", prevRaceResultTime)
        .order("time", { ascending: false })
        .limit(1)
        .single()
      const prevRaceClosePrice = prevClosingRow
        ? (typeof prevClosingRow.price === "string" ? parseFloat(prevClosingRow.price) : prevClosingRow.price)
        : resolvedClose

      const raceWinner: "bit" | "coin" | "tie" =
        serverBitScore > serverCoinScore ? "bit"
        : serverCoinScore > serverBitScore ? "coin"
        : "tie"

      // DB에 클라이언트가 이미 저장했으면 ignoreDuplicates로 스킵
      const { data: existingRow } = await admin
        .from("race_results")
        .select("time")
        .eq("time", prevRaceResultTime)
        .maybeSingle()

      if (!existingRow && (serverBitScore > 0 || serverCoinScore > 0)) {
        await admin.from("race_results").insert({
          time:       prevRaceResultTime,
          price:      prevRaceClosePrice,
          bit_score:  serverBitScore,
          coin_score: serverCoinScore,
          winner:     raceWinner,
        }).then(() => {}).catch(() => {})
      }

      await Promise.all([
        redis.set(`game:result:race:${prevRaceRoundNumber}`, JSON.stringify({
          raceRoundNumber: prevRaceRoundNumber,
          raceWinner,
          closePrice: prevRaceClosePrice,
          bitScore:   serverBitScore,
          coinScore:  serverCoinScore,
          settledAt:  Date.now(),
        }), { ex: 600 }),
        redis.set(prevRaceSettledKey, 1, { ex: 600 }),
      ])
    }

    // 정산 완료 플래그 (중복 방지, 5분 TTL)
    await redis.set(`settled:${roundNumber}`, 1, { ex: 300 })

    // ── 유저별 정산 ──────────────────────────────��──���───────
    // bet:bets:{round}:{userId} 키에 배팅 내역이 저장되어 있음
    const settlementResults: Array<{ userId: string; payout: number }> = []

    for (const userId of userIds as string[]) {
      const betsKey     = `bet:bets:baccarat:${roundNumber}:${userId}`
      const oddsSnapKey = `odds:snap:baccarat:${roundNumber}:${userId}`
      const [betsRaw, oddsSnapRaw] = await Promise.all([
        redis.get<string>(betsKey),
        redis.get<string>(oddsSnapKey),
      ])
      if (!betsRaw) continue

      const bets     = typeof betsRaw === "string" ? JSON.parse(betsRaw) : betsRaw
      // 배팅 시점에 저장된 odds 스냅샷 사용 → 없으면 현재 풀로 fallback 계산
      let oddsSnap: { player: number; banker: number; tie: number } | null = null
      if (oddsSnapRaw) {
        try { oddsSnap = typeof oddsSnapRaw === "string" ? JSON.parse(oddsSnapRaw) : oddsSnapRaw } catch {}
      }
      if (!oddsSnap) {
        // fallback: settle 시점 LP 설정으로 계산
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
            if (branch) lpConfig = branchToLpConfig(branch)
            await redis.set(lpCacheKey, JSON.stringify(lpConfig), { ex: 300 })
          }
        }
        const r = calcBaccaratOdds(baccaratPool, lpConfig, userCount)
        oddsSnap = { player: r.playerOdds, banker: r.bankerOdds, tie: r.tieOdds }
      }

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
          // 배팅 시점 스냅샷 odds 사용 → 화면에 표시된 배당과 일치
          const odds = oddsSnap[side]
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

      for (const userId of settleTargetIds) {
        const betsKey     = `bet:bets:race:${prevRaceRoundNumber}:${userId}`
        const oddsSnapKey = `odds:snap:race:${prevRaceRoundNumber}:${userId}`
        const [betsRaw, oddsSnapRaw] = await Promise.all([
          redis.get<string>(betsKey),
          redis.get<string>(oddsSnapKey),
        ])
        if (!betsRaw) continue
        const bets = typeof betsRaw === "string" ? JSON.parse(betsRaw) : betsRaw

        // 배팅 시점 odds 스냅샷 사용 → 없으면 settle 시점 풀로 fallback
        let raceOddsSnap: { bit: number; coin: number; tie: number } | null = null
        if (oddsSnapRaw) {
          try { raceOddsSnap = typeof oddsSnapRaw === "string" ? JSON.parse(oddsSnapRaw) : oddsSnapRaw } catch {}
        }
        if (!raceOddsSnap) {
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
          const r = calcRaceOdds(racePool, lpConfig, raceUserCount)
          raceOddsSnap = { bit: r.bitOdds, coin: r.coinOdds, tie: r.tieOdds }
        }

        let totalPayout = 0

        if (bets.direction && bets.directionAmount > 0 && bets.direction === wonDirection)
          totalPayout += Math.floor(bets.directionAmount * FIXED_ODDS)
        if (bets.digit && bets.digitAmount > 0 && bets.digit === wonDigit)
          totalPayout += Math.floor(bets.digitAmount * FIXED_ODDS)
        if (bets.parity && bets.parityAmount > 0 && bets.parity === wonParity)
          totalPayout += Math.floor(bets.parityAmount * FIXED_ODDS)

        if (bets.raceSide && bets.raceAmount > 0) {
          const side = bets.raceSide as "bit" | "coin" | "tie"
          if (side === raceWinner) {
            // 배팅 시점 스냅샷 odds 사용
            const odds = raceOddsSnap[side]
            totalPayout += Math.floor(bets.raceAmount * odds)
          } else if (raceWinner === "tie" && (side === "bit" || side === "coin")) {
            totalPayout += bets.raceAmount
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
      console.log(`[settle] race round=${prevRaceRoundNumber} winner=${raceWinner} settled=${settleTargetIds.length} users`)

      // race house_stats 지점별 집계
      const raceBranchAccum: Record<string, { totalBet: number; totalPayout: number }> = {}
      for (const userId of settleTargetIds) {
        const betsKey = `bet:bets:race:${prevRaceRoundNumber}:${userId}`
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
            round_number: prevRaceRoundNumber,
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
