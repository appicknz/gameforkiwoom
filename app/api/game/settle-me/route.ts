/**
 * /api/game/settle-me  — 클라이언트가 직접 호출하는 개인 정산 API
 * POST { closePrice, basePrice, roundNumber, gameType }
 * Authorization: Bearer <token>
 */
import { adminSupabase as admin } from "@/lib/supabase-admin"
import { Redis } from "@upstash/redis"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

const FIXED_ODDS = 3.0  // 고정 배당

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
    const decStr        = closePrice.toFixed(2).split(".")[1] ?? "00"
    const d2            = parseInt(decStr[1] ?? "0")
    const wonDirection: "long" | "short" = closePrice >= effectiveBase ? "long" : "short"
    const wonDigit:     "under" | "over" = d2 <= 4 ? "under" : "over"
    const wonParity:    "odd"   | "even" = d2 % 2 === 0 ? "even" : "odd"
    const baccaratResult: "player" | "banker" | "tie" =
      d2 <= 4 ? "player" : d2 <= 8 ? "banker" : "tie"

    // ── 유저 배팅 내역 조회 ──────────────────────────────────
    const betsKey = `bet:bets:${gameType}:${roundNumber}:${userId}`
    const betsRaw = await redis.get<string>(betsKey)

    if (!betsRaw) {
      const { data: balData } = await admin.from("balances").select("amount").eq("user_id", userId).single()
      return NextResponse.json({ success: true, payout: 0, balance: balData?.amount ?? 0 })
    }

    const bets = typeof betsRaw === "string" ? JSON.parse(betsRaw) : betsRaw

    // ── 당첨금 계산 (고정 3.0x) ─────────────────────────────
    let totalPayout = 0

    if (gameType === "baccarat") {
      if (bets.direction && bets.directionAmount > 0 && bets.direction === wonDirection)
        totalPayout += Math.floor(bets.directionAmount * FIXED_ODDS)
      if (bets.digit && bets.digitAmount > 0 && bets.digit === wonDigit)
        totalPayout += Math.floor(bets.digitAmount * FIXED_ODDS)
      if (bets.parity && bets.parityAmount > 0 && bets.parity === wonParity)
        totalPayout += Math.floor(bets.parityAmount * FIXED_ODDS)
      if (bets.baccaratSide && bets.baccaratAmount > 0) {
        const side = bets.baccaratSide as "player" | "banker" | "tie"
        if (side === baccaratResult)
          totalPayout += Math.floor(bets.baccaratAmount * FIXED_ODDS)
        else if (baccaratResult === "tie" && (side === "player" || side === "banker"))
          totalPayout += bets.baccaratAmount  // 타이 시 원금 반환
      }
    } else {
      // race 정산
      const raceScoreKey = `race:score:${roundNumber}`
      const scoreData = await redis.hgetall(raceScoreKey).catch(() => null)
      const bitScore  = parseInt((scoreData?.bit  as string) ?? "0") || 0
      const coinScore = parseInt((scoreData?.coin as string) ?? "0") || 0
      const raceWinner = bitScore > coinScore ? "bit" : coinScore > bitScore ? "coin" : "tie"

      if (bets.direction && bets.directionAmount > 0 && bets.direction === wonDirection)
        totalPayout += Math.floor(bets.directionAmount * FIXED_ODDS)
      if (bets.digit && bets.digitAmount > 0 && bets.digit === wonDigit)
        totalPayout += Math.floor(bets.digitAmount * FIXED_ODDS)
      if (bets.parity && bets.parityAmount > 0 && bets.parity === wonParity)
        totalPayout += Math.floor(bets.parityAmount * FIXED_ODDS)
      if (bets.raceSide && bets.raceAmount > 0) {
        const side = bets.raceSide as "bit" | "coin" | "tie"
        if (side === raceWinner)
          totalPayout += Math.floor(bets.raceAmount * FIXED_ODDS)
        else if (raceWinner === "tie" && (side === "bit" || side === "coin"))
          totalPayout += bets.raceAmount
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
