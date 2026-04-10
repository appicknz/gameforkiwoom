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
import { calcBaccaratOdds, calcRaceOdds, DEFAULT_LP_CONFIG } from "@/lib/lp-system"

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
    const { closePrice, basePrice, roundNumber, gameType = "baccarat" } = await request.json()
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

    let betsRaw:      string | null = null
    let oddsSnapRaw:  string | null = null
    let resolvedRound: number       = roundNumber
    let resolvedBetsKey: string     = `bet:bets:${gameType}:${roundNumber}:${userId}`

    for (const rn of candidates) {
      const bk = `bet:bets:${gameType}:${rn}:${userId}`
      const ok = `odds:snap:${gameType}:${rn}:${userId}`
      const [b, o] = await Promise.all([redis.get<string>(bk), redis.get<string>(ok)])
      if (b) { betsRaw = b; oddsSnapRaw = o; resolvedRound = rn; resolvedBetsKey = bk; break }
    }
    if (!betsRaw) {
      // 배팅 없음 — 현재 잔고만 반환
      const { data: balData } = await admin.from("balances").select("amount").eq("user_id", userId).single()
      return NextResponse.json({ success: true, payout: 0, balance: balData?.amount ?? 0 })
    }

    // 정산 완료 후 userRoundKey 삭제 (다음 라운드에 오래된 데이터 조회 방지)
    await redis.del(userRoundKey).catch(() => {})

    const bets = typeof betsRaw === "string" ? JSON.parse(betsRaw) : betsRaw

    // ── odds 스냅샷 (배팅 시점 저장 값 우선) ────────────────
    let oddsSnap: { player?: number; banker?: number; tie?: number; bit?: number; coin?: number } = {}
    if (oddsSnapRaw) {
      try { oddsSnap = typeof oddsSnapRaw === "string" ? JSON.parse(oddsSnapRaw) : oddsSnapRaw } catch {}
    }

    // 스냅샷 없으면 현재 풀 + DEFAULT_LP_CONFIG로 재계산 (calcAutoLpSeed 불필요)
    if (Object.keys(oddsSnap).length === 0) {
      const poolKey  = `pool:${gameType}:${roundNumber}`
      const [poolData, userCount] = await Promise.all([
        redis.hgetall(poolKey).catch(() => null),
        redis.scard(`users:${gameType}:${roundNumber}`).catch(() => 0),
      ])
      const safeCount = (userCount as number) ?? 0

      if (gameType === "baccarat") {
        const pool = {
          player: parseInt((poolData?.player as string) ?? "0") || 0,
          banker: parseInt((poolData?.banker as string) ?? "0") || 0,
          tie:    parseInt((poolData?.tie    as string) ?? "0") || 0,
        }
        const r = calcBaccaratOdds(pool, DEFAULT_LP_CONFIG, safeCount)
        oddsSnap = {
          player: typeof r.playerOdds === "number" ? r.playerOdds : 1.95,
          banker: typeof r.bankerOdds === "number" ? r.bankerOdds : 1.95,
          tie:    typeof r.tieOdds    === "number" ? r.tieOdds    : 1.95,
        }
      } else {
        const pool = {
          bit:  parseInt((poolData?.bit  as string) ?? "0") || 0,
          coin: parseInt((poolData?.coin as string) ?? "0") || 0,
          tie:  parseInt((poolData?.tie  as string) ?? "0") || 0,
        }
        const r = calcRaceOdds(pool, DEFAULT_LP_CONFIG, safeCount)
        oddsSnap = {
          bit:  typeof r.bitOdds  === "number" ? r.bitOdds  : 1.95,
          coin: typeof r.coinOdds === "number" ? r.coinOdds : 1.95,
          tie:  typeof r.tieOdds  === "number" ? r.tieOdds  : 1.95,
        }
      }
    }

    // ── 당첨금 계산 ─────────────────────────────────────────
    let totalPayout = 0
    const snap = oddsSnap as Record<string, number>

    if (gameType === "baccarat") {
      if (bets.direction && bets.directionAmount > 0) {
        if (bets.direction === wonDirection) totalPayout += Math.floor(bets.directionAmount * FIXED_ODDS)
      }
      if (bets.digit && bets.digitAmount > 0) {
        if (bets.digit === wonDigit) totalPayout += Math.floor(bets.digitAmount * FIXED_ODDS)
      }
      if (bets.parity && bets.parityAmount > 0) {
        if (bets.parity === wonParity) totalPayout += Math.floor(bets.parityAmount * FIXED_ODDS)
      }
      if (bets.baccaratSide && bets.baccaratAmount > 0) {
        const side = bets.baccaratSide as "player" | "banker" | "tie"
        if (side === baccaratResult) {
          const odds = (typeof snap[side] === "number" && snap[side] > 0) ? snap[side] : 1.95
          totalPayout += Math.floor(bets.baccaratAmount * odds)
        } else if (baccaratResult === "tie" && (side === "player" || side === "banker")) {
          totalPayout += bets.baccaratAmount  // 타이 시 원금 반환
        }
      }
    } else {
      // race 정산
      const d1 = parseInt(closePrice.toFixed(2).split(".")[1]?.[0] ?? "0")
      const raceRoundNumber = Math.floor(Date.now() / 1000 / 300)
      const raceScoreKey = `race:score:${raceRoundNumber}`
      const scoreData = await redis.hgetall(raceScoreKey).catch(() => null)
      const bitScore  = parseInt((scoreData?.bit  as string) ?? "0") || 0
      const coinScore = parseInt((scoreData?.coin as string) ?? "0") || 0
      const raceWinner = bitScore > coinScore ? "bit" : coinScore > bitScore ? "coin" : "tie"

      if (bets.raceSide && bets.raceAmount > 0) {
        const side = bets.raceSide as "bit" | "coin" | "tie"
        if (side === raceWinner) {
          const odds = (typeof snap[side] === "number" && snap[side] > 0) ? snap[side] : 1.95
          totalPayout += Math.floor(bets.raceAmount * odds)
        } else if (raceWinner === "tie" && (side === "bit" || side === "coin")) {
          totalPayout += bets.raceAmount
        }
      }
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
          payout: bets.direction === wonDirection ? Math.floor(bets.directionAmount * FIXED_ODDS) : 0,
          result: bets.direction === wonDirection ? "win" : "lose",
        })
        if (bets.digitAmount > 0) historyRows.push({
          user_id: userId, branch_id: branchId, round_id: null,
          bet_direction: null, bet_digit: bets.digit, bet_parity: null,
          bet_amount: bets.digitAmount,
          payout: bets.digit === wonDigit ? Math.floor(bets.digitAmount * FIXED_ODDS) : 0,
          result: bets.digit === wonDigit ? "win" : "lose",
        })
        if (bets.parityAmount > 0) historyRows.push({
          user_id: userId, branch_id: branchId, round_id: null,
          bet_direction: null, bet_digit: null, bet_parity: bets.parity,
          bet_amount: bets.parityAmount,
          payout: bets.parity === wonParity ? Math.floor(bets.parityAmount * FIXED_ODDS) : 0,
          result: bets.parity === wonParity ? "win" : "lose",
        })
        if (bets.baccaratSide && bets.baccaratAmount > 0) {
          const side = bets.baccaratSide as "player" | "banker" | "tie"
          const won = side === baccaratResult
          const refund = baccaratResult === "tie" && (side === "player" || side === "banker")
          const odds = (typeof snap[side] === "number" && snap[side] > 0) ? snap[side] : 1.95
          historyRows.push({
            user_id: userId, branch_id: branchId, round_id: null,
            bet_direction: `baccarat_${side}`, bet_digit: null, bet_parity: null,
            bet_amount: bets.baccaratAmount,
            payout: won ? Math.floor(bets.baccaratAmount * odds) : refund ? bets.baccaratAmount : 0,
            result: won ? "win" : refund ? "tie" : "lose",
          })
        }
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
      // 정산에 사용된 실제 odds 반환 → 프론트 결과 모달에서 확정 배율 표시
      appliedOdds: oddsSnap,
    })
  } catch (err) {
    console.error("[v0] settle-me error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
