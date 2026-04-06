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
import { calcBaccaratOdds, calcRaceOdds, branchToLpConfig, DEFAULT_LP_CONFIG } from "@/lib/lp-system"
import { calcAutoLpSeed } from "@/lib/lp-auto-seed"

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
    const betsKey     = `bet:bets:${gameType}:${roundNumber}:${userId}`
    const oddsSnapKey = `odds:snap:${gameType}:${roundNumber}:${userId}`
    const [betsRaw, oddsSnapRaw] = await Promise.all([
      redis.get<string>(betsKey),
      redis.get<string>(oddsSnapKey),
    ])

    if (!betsRaw) {
      // 배팅 없음 — 현재 잔고만 반환
      const { data: balData } = await admin.from("balances").select("amount").eq("user_id", userId).single()
      return NextResponse.json({ success: true, payout: 0, balance: balData?.amount ?? 0 })
    }

    const bets = typeof betsRaw === "string" ? JSON.parse(betsRaw) : betsRaw

    // ── odds 스냅샷 (배팅 시점 저장 값 우선) ────────────────
    let oddsSnap: { player?: number; banker?: number; tie?: number; bit?: number; coin?: number } = {}
    if (oddsSnapRaw) {
      try { oddsSnap = typeof oddsSnapRaw === "string" ? JSON.parse(oddsSnapRaw) : oddsSnapRaw } catch {}
    }

    // 스냅샷 없으면 settle 시점 LP 설정으로 계산
    if (Object.keys(oddsSnap).length === 0) {
      const { data: profile } = await admin.from("profiles").select("branch_id").eq("id", userId).single()
      const branchId = profile?.branch_id ?? null
      let lpConfig = { ...DEFAULT_LP_CONFIG }
      if (branchId) {
        const { data: branch } = await admin
          .from("branches")
          .select("lp_enabled, lp_amount_baccarat, lp_amount_race, lp_multiplier_baccarat, lp_multiplier_race")
          .eq("id", branchId).single()
        if (branch) lpConfig = branchToLpConfig(branch)
      }
      const fallback = gameType === "baccarat" ? lpConfig.lpAmountBaccarat : lpConfig.lpAmountRace
      const autoSeed = await calcAutoLpSeed(gameType, branchId, fallback)
      if (gameType === "baccarat") lpConfig.lpAmountBaccarat = autoSeed
      else                         lpConfig.lpAmountRace     = autoSeed

      const poolKey = `pool:${gameType}:${roundNumber}`
      const poolData = await redis.hgetall(poolKey).catch(() => null)
      const userCount = await redis.scard(`users:${gameType}:${roundNumber}`).catch(() => 0) as number

      if (gameType === "baccarat") {
        const pool = {
          player: parseInt((poolData?.player as string) ?? "0") || 0,
          banker: parseInt((poolData?.banker as string) ?? "0") || 0,
          tie:    parseInt((poolData?.tie    as string) ?? "0") || 0,
        }
        const r = calcBaccaratOdds(pool, lpConfig, userCount)
        oddsSnap = { player: r.playerOdds, banker: r.bankerOdds, tie: r.tieOdds }
      } else {
        const pool = {
          bit:  parseInt((poolData?.bit  as string) ?? "0") || 0,
          coin: parseInt((poolData?.coin as string) ?? "0") || 0,
          tie:  parseInt((poolData?.tie  as string) ?? "0") || 0,
        }
        const r = calcRaceOdds(pool, lpConfig, userCount)
        oddsSnap = { bit: r.bitOdds, coin: r.coinOdds, tie: r.tieOdds }
      }
    }

    // ── 당첨금 계산 ─────────────────────────────────────────
    let totalPayout = 0

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
          const odds = (oddsSnap as Record<string, number>)[side] ?? FIXED_ODDS
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
          const odds = (oddsSnap as Record<string, number>)[side] ?? FIXED_ODDS
          totalPayout += Math.floor(bets.raceAmount * odds)
        } else if (raceWinner === "tie" && (side === "bit" || side === "coin")) {
          totalPayout += bets.raceAmount
        }
      }
    }

    // ── 잔고 반영 ────────────────────────────────────────────
    let newBalance: number
    if (totalPayout > 0) {
      const { data, error } = await admin.rpc("add_balance_for_payout", {
        p_user_id: userId,
        p_amount:  totalPayout,
      })
      if (error) throw error
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
    await redis.del(betsKey).catch(() => {})

    return NextResponse.json({ success: true, payout: totalPayout, balance: newBalance })
  } catch (err) {
    console.error("[v0] settle-me error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
