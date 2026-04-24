/**
 * /api/game/settle-me  — 클라이언트가 직접 호출하는 개인 정산 API
 *
 * Railway price-server 없이도 배팅 결과를 정산하고 잔고를 반환한다.
 * POST { closePrice, basePrice, roundNumber, gameType }
 * Authorization: Bearer <token>
 */
import { adminSupabase as admin } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"
import { calcBaccaratOdds, calcRaceOdds, DEFAULT_LP_CONFIG, branchToLpConfig } from "@/lib/lp-system"

export const runtime = "nodejs"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const FIXED_ODDS = 1.6  // 방향/숫자/홀짝 고정 배당 (수수료 20% 적용)

export async function POST(request: Request) {
  const token = request.headers.get("Authorization")?.replace("Bearer ", "")
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: { user } } = await admin.auth.getUser(token)
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.id

  try {
    const { closePrice, basePrice, roundNumber, gameType = "baccarat", bitScore: clientBitScore, coinScore: clientCoinScore } = await request.json()
    if (typeof closePrice !== "number" || typeof roundNumber !== "number") {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 })
    }

    // ── 승패 결과 계산 ───────────────────────────────────────
    const effectiveBase: number = typeof basePrice === "number" ? basePrice : closePrice
    const decStr   = closePrice.toFixed(2).split(".")[1] ?? "00"
    const d2       = parseInt(decStr[1] ?? "0")
    const wonDirection: "long" | "short"  = closePrice >= effectiveBase ? "long" : "short"
    const wonDigit:     "under" | "over"  = d2 <= 4 ? "under" : "over"
    const wonParity:    "odd"   | "even"  = d2 % 2 === 0 ? "even" : "odd"
    const baccaratResult: "player" | "banker" | "tie" =
      d2 <= 4 ? "player" : d2 <= 8 ? "banker" : "tie"

    // ── 유저 배팅 내역 조회 ──────────────────────────────────
    // 저장된 roundNumber를 우선 사용 (프론트에서 넘긴 값이 라운드 경계에서 틀릴 수 있음)
    const userRoundKey  = `bet:round:${gameType}:${userId}`
    const storedRound   = await redis.get<number>(userRoundKey)
    // storedRound가 있으면 그것을 사용, 없으면 프론트 roundNumber ± 1 까지 시도
    const candidates    = storedRound
      ? [storedRound]
      : [roundNumber, roundNumber - 1, roundNumber + 1]

    let betsRaw:       string | null = null
    let resolvedRound: number        = roundNumber
    let resolvedBetsKey: string      = `bet:bets:${gameType}:${roundNumber}:${userId}`

    for (const rn of candidates) {
      const bk = `bet:bets:${gameType}:${rn}:${userId}`
      const b  = await redis.get<string>(bk)
      if (b) { betsRaw = b; resolvedRound = rn; resolvedBetsKey = bk; break }
    }
    if (!betsRaw) {
      // 배팅 없음 — 현재 잔고만 반환
      const { data: balData } = await admin.from("balances").select("amount").eq("user_id", userId).single()
      return NextResponse.json({ success: true, payout: 0, balance: balData?.amount ?? 0 })
    }

    // 정산 완료 후 userRoundKey 삭제 (다음 라운드에 오래된 데이터 조회 방지)
    await redis.del(userRoundKey).catch(() => {})

    const bets = typeof betsRaw === "string" ? JSON.parse(betsRaw) : betsRaw

    // ── odds 확정 배당 (단일 소스: odds:final — SSE가 배팅 마감 시 저장) ─────
    // 관리자 모니터·클라이언트·정산 모두 동일한 키를 사용해 배당 일치 보장
    let oddsSnap: { player?: number; banker?: number; tie?: number; bit?: number; coin?: number } = {}
    const finalOddsRaw = await redis.get<string>(`odds:final:${gameType}:${resolvedRound}`)
    if (finalOddsRaw) {
      try { oddsSnap = typeof finalOddsRaw === "string" ? JSON.parse(finalOddsRaw) : finalOddsRaw } catch {}
    }

    // odds:final 없으면 — 풀 + 유저의 실제 LP 설정으로 재계산 (TTL 3600s 내에서는 발생하면 안 됨)
    if (Object.keys(oddsSnap).length === 0) {
      // 유저 브랜치 LP 설정 조회
      const { data: profileRow } = await admin
        .from("profiles").select("branch_id").eq("id", userId).single()
      let lpConfig = { ...DEFAULT_LP_CONFIG, enabled: false }
      if (profileRow?.branch_id) {
        const { data: branchRow } = await admin
          .from("branches")
          .select("lp_enabled, lp_amount_baccarat, lp_amount_race, lp_multiplier_baccarat, lp_multiplier_race")
          .eq("id", profileRow.branch_id).single()
        if (branchRow) lpConfig = branchToLpConfig(branchRow)
      }

      const poolKey = `pool:${gameType}:${resolvedRound}`
      const [poolData, userCount] = await Promise.all([
        redis.hgetall(poolKey).catch(() => null),
        redis.scard(`users:${gameType}:${resolvedRound}`).catch(() => 0),
      ])
      const safeCount = (userCount as number) ?? 0

      if (gameType === "baccarat") {
        const pool = {
          player: parseInt((poolData?.player as string) ?? "0") || 0,
          banker: parseInt((poolData?.banker as string) ?? "0") || 0,
          tie:    parseInt((poolData?.tie    as string) ?? "0") || 0,
        }
        if (pool.player + pool.banker + pool.tie === 0) {
          // 풀도 만료 — 배당 데이터 없음, 정산 불가
          return NextResponse.json({ error: "배당 데이터가 만료되었습니다. 관리자에게 문의하세요." }, { status: 422 })
        }
        const r = calcBaccaratOdds(pool, lpConfig, safeCount)
        oddsSnap = { player: r.playerOdds, banker: r.bankerOdds, tie: r.tieOdds }
      } else {
        const pool = {
          bit:  parseInt((poolData?.bit  as string) ?? "0") || 0,
          coin: parseInt((poolData?.coin as string) ?? "0") || 0,
          tie:  parseInt((poolData?.tie  as string) ?? "0") || 0,
        }
        if (pool.bit + pool.coin + pool.tie === 0) {
          return NextResponse.json({ error: "배당 데이터가 만료되었습니다. 관리자에게 문의하세요." }, { status: 422 })
        }
        const r = calcRaceOdds(pool, lpConfig, safeCount)
        oddsSnap = { bit: r.bitOdds, coin: r.coinOdds, tie: r.tieOdds }
      }
    }

    // ── 당첨금 계산 (천원 단위 내림) ─────────────────────────
    const roundTo1000 = (v: number) => Math.floor(v / 1000) * 1000
    let totalPayout = 0
    const snap = oddsSnap as Record<string, number>

    if (gameType === "baccarat") {
      if (bets.direction && bets.directionAmount > 0) {
        if (bets.direction === wonDirection) totalPayout += roundTo1000(bets.directionAmount * FIXED_ODDS)
      }
      if (bets.digit && bets.digitAmount > 0) {
        if (bets.digit === wonDigit) totalPayout += roundTo1000(bets.digitAmount * FIXED_ODDS)
      }
      if (bets.parity && bets.parityAmount > 0) {
        if (bets.parity === wonParity) totalPayout += roundTo1000(bets.parityAmount * FIXED_ODDS)
      }
      if (bets.baccaratSide && bets.baccaratAmount > 0) {
        const side = bets.baccaratSide as "player" | "banker" | "tie"
        // 정확히 맞춰야만 지급 — 타이 결과 시 player/banker는 LOSS (반환 없음)
        if (side === baccaratResult) {
          const odds = snap[side] as number
          totalPayout += roundTo1000(bets.baccaratAmount * odds)
        }
      }
    } else {
      // race 정산
      // 1순위: 클라이언트가 보낸 bitScore/coinScore (종료 시점 정확한 값)
      // 2순위: Redis race:score:{roundNumber} (같은 라운드 번호로 조회)
      // 3순위: race_results DB
      let bitScore  = (typeof clientBitScore  === "number") ? clientBitScore  : 0
      let coinScore = (typeof clientCoinScore === "number") ? clientCoinScore : 0

      if (bitScore === 0 && coinScore === 0) {
        const raceScoreKey = `race:score:${roundNumber}`
        const scoreData = await redis.hgetall(raceScoreKey).catch(() => null)
        bitScore  = parseInt((scoreData?.bit  as string) ?? "0") || 0
        coinScore = parseInt((scoreData?.coin as string) ?? "0") || 0
      }

      if (bitScore === 0 && coinScore === 0) {
        // DB fallback: 해당 라운드 종료 시각으로 조회 (180초 기준)
        const raceTime = resolvedRound * 180
        const { data: raceRow } = await admin.from("race_results").select("bit_score,coin_score,winner").eq("time", raceTime).maybeSingle()
        if (raceRow) { bitScore = raceRow.bit_score ?? 0; coinScore = raceRow.coin_score ?? 0 }
      }

      const raceWinner: "bit" | "coin" | "tie" = bitScore > coinScore ? "bit" : coinScore > bitScore ? "coin" : "tie"

      if (bets.raceSide && bets.raceAmount > 0) {
        const side = bets.raceSide as "bit" | "coin" | "tie"
        // 정확히 맞춰야만 지급 — 타이 결과 시 bit/coin은 LOSS (반환 없음)
        if (side === raceWinner) {
          const odds = snap[side] as number
          totalPayout += roundTo1000(bets.raceAmount * odds)
        }
      }
    }

    // ── game_round_history + game_round_participants 기록 ────────
    if (gameType === "baccarat" && bets.baccaratSide && bets.baccaratAmount > 0) {
      const side = bets.baccaratSide as "player" | "banker" | "tie"
      const won = side === baccaratResult
      const odds = oddsSnap[side] as number
      const betPayout = won ? roundTo1000(bets.baccaratAmount * odds) : 0
      const profit = betPayout - bets.baccaratAmount

      // game_round_history upsert (존재하면 participant_count만 증가)
      await admin.from("game_round_history").upsert({
        game_type: "baccarat",
        round_number: resolvedRound,
        result: baccaratResult,
        odds_player: oddsSnap.player ?? null,
        odds_banker: oddsSnap.banker ?? null,
        odds_tie:    oddsSnap.tie    ?? null,
        total_bet:    bets.baccaratAmount,
        total_payout: betPayout,
        participant_count: 1,
      }, {
        onConflict: "game_type,round_number",
        ignoreDuplicates: false,
      }).then(() => {}).catch(() => {})

      // game_round_participants INSERT
      const { data: prof } = await admin.from("profiles").select("username").eq("id", userId).maybeSingle()
      await admin.from("game_round_participants").insert({
        game_type:    "baccarat",
        round_number: resolvedRound,
        user_id:      userId,
        username:     prof?.username ?? null,
        bet_side:     side,
        bet_amount:   bets.baccaratAmount,
        applied_odds: odds,
        payout:       betPayout,
        profit,
        result:       won ? "win" : "lose",
      }).then(() => {}).catch(() => {})
    }

    // ── bet_history INSERT ────────────────────────────────────
    {
      const { data: profile } = await admin.from("profiles").select("branch_id").eq("id", userId).single()
      const branchId = profile?.branch_id ?? null
      const historyRows: Record<string, unknown>[] = []

      if (gameType === "baccarat") {
        if (bets.directionAmount > 0) historyRows.push({
          user_id: userId, branch_id: branchId, round_id: null,
          bet_direction: bets.direction, bet_digit: null, bet_parity: null,
          bet_amount: bets.directionAmount,
          payout: bets.direction === wonDirection ? roundTo1000(bets.directionAmount * FIXED_ODDS) : 0,
          result: bets.direction === wonDirection ? "win" : "lose",
        })
        if (bets.digitAmount > 0) historyRows.push({
          user_id: userId, branch_id: branchId, round_id: null,
          bet_direction: null, bet_digit: bets.digit, bet_parity: null,
          bet_amount: bets.digitAmount,
          payout: bets.digit === wonDigit ? roundTo1000(bets.digitAmount * FIXED_ODDS) : 0,
          result: bets.digit === wonDigit ? "win" : "lose",
        })
        if (bets.parityAmount > 0) historyRows.push({
          user_id: userId, branch_id: branchId, round_id: null,
          bet_direction: null, bet_digit: null, bet_parity: bets.parity,
          bet_amount: bets.parityAmount,
          payout: bets.parity === wonParity ? roundTo1000(bets.parityAmount * FIXED_ODDS) : 0,
          result: bets.parity === wonParity ? "win" : "lose",
        })
        if (bets.baccaratSide && bets.baccaratAmount > 0) {
          const side = bets.baccaratSide as "player" | "banker" | "tie"
          const won = side === baccaratResult
          const odds = snap[side] as number
          historyRows.push({
            user_id: userId, branch_id: branchId, round_id: null,
            bet_direction: `baccarat_${side}`, bet_digit: null, bet_parity: null,
            bet_amount: bets.baccaratAmount,
            payout: won ? roundTo1000(bets.baccaratAmount * odds) : 0,
            result: won ? "win" : "lose",
          })
        }
      }

      if (gameType === "race" && bets.raceSide && bets.raceAmount > 0) {
        const side = bets.raceSide as "bit" | "coin" | "tie"
        const raceWinner2: "bit" | "coin" | "tie" =
          (typeof clientBitScore === "number" && typeof clientCoinScore === "number")
            ? (clientBitScore > clientCoinScore ? "bit" : clientCoinScore > clientBitScore ? "coin" : "tie")
            : "tie"
        const won = side === raceWinner2
        const odds = snap[side] as number
        historyRows.push({
          user_id: userId, branch_id: branchId, round_id: null,
          bet_direction: `race_${side}`, bet_digit: null, bet_parity: null,
          bet_amount: bets.raceAmount,
          payout: won ? roundTo1000(bets.raceAmount * odds) : 0,
          result: won ? "win" : "lose",
        })
      }

      if (historyRows.length > 0) {
        await admin.from("bet_history").insert(historyRows).then(() => {}).catch(() => {})
      }
    }

    // ── 잔고 반영 ────────────────────────────────────────────
    let newBalance: number
    if (totalPayout > 0) {
      const { data, error } = await admin.rpc("add_balance_for_payout", {
        p_user_id: userId,
        p_amount:  totalPayout,
      })
      if (error) {
        console.error("[v0] add_balance_for_payout error:", error)
        throw error
      }
      newBalance = data as number
    } else {
      // 패배 — DB 잔고 동기화만
      const { data: balData } = await admin.from("balances").select("amount").eq("user_id", userId).single()
      newBalance = balData?.amount ?? 0
    }

    // Redis 캐시 + version incr → SSE balance 업데이트 트리거
    await Promise.all([
      redis.set(`balance:${userId}`, newBalance, { ex: 3600 }),
      redis.incr(`balance_version:${userId}`),
    ])

    // 배팅 키 삭제 (중복 정산 방지)
    await redis.del(resolvedBetsKey).catch(() => {})

    return NextResponse.json({
      success: true,
      payout: totalPayout,
      balance: newBalance,
      // 정산에 사용된 실제 odds 반환 → 프론트 결과 모달에서 확정 배율 ���시
      appliedOdds: oddsSnap,
    })
  } catch (err) {
    console.error("[v0] settle-me error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
