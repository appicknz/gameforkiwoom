import { redis } from "@/lib/redis"
/**
 * /api/cron/race-settle
 *
 * Vercel Cron이 5분마다 호출 (vercel.json 설정).
 * Railway price-server가 다운됐을 때도 race_results를 빠짐없이 저장.
 *
 * 동작:
 * 1. 직전 완료된 5분 라운드 번호 계산
 * 2. DB에 이미 저장됐으면 스킵 (중복 방지)
 * 3. Redis race:score:{raceRoundNumber} 에 누적된 스코어 사용
 * 4. Redis가 없으면 btc_closing_prices 에서 직접 소수점 합산
 * 5. DB에 upsert
 */

import { adminSupabase as admin } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

export const runtime = "nodejs"


export async function GET(request: Request) {
  // Vercel Cron 인증 (CRON_SECRET 또는 Authorization 헤더)
  const authHeader = request.headers.get("authorization")
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = Math.floor(Date.now() / 1000)
  // 직전 완료된 5분 라운드 번호 (현재 진행 중인 라운드 -1)
  const currentRaceRound = Math.floor(now / 300)
  const prevRaceRound    = currentRaceRound - 1
  const prevRaceTime     = prevRaceRound * 300  // 라운드 종료 시각 (:00초 경계)

  try {
    // 1. 이미 저장됐는지 확인
    const { data: existing } = await admin
      .from("race_results")
      .select("time")
      .eq("time", prevRaceTime)
      .maybeSingle()

    if (existing) {
      return NextResponse.json({ skipped: true, reason: "already exists", time: prevRaceTime })
    }

    // 2. Redis 누적 스코어 확인
    const raceScoreKey = `race:score:${prevRaceRound}`
    const raceScore    = await redis.hgetall(raceScoreKey).catch(() => null)
    let bitScore  = parseInt((raceScore?.bit  as string) ?? "0") || 0
    let coinScore = parseInt((raceScore?.coin as string) ?? "0") || 0

    // 3. Redis가 비어있으면 btc_closing_prices에서 직접 계산
    if (bitScore === 0 && coinScore === 0) {
      // 5분 라운드 구간: prevRaceRound * 300 이 이 라운드 종료 시각
      // 해당 라운드 시작 = (prevRaceRound - 1) * 300 + 1
      const rangeStart = (prevRaceRound - 1) * 300 + 1
      const rangeEnd   = prevRaceTime

      const { data: closingRows } = await admin
        .from("btc_closing_prices")
        .select("price")
        .gte("time", rangeStart)
        .lte("time", rangeEnd)
        .order("time", { ascending: true })

      if (!closingRows || closingRows.length === 0) {
        return NextResponse.json({ skipped: true, reason: "no closing prices in range", time: prevRaceTime })
      }

      for (const row of closingRows) {
        const price = typeof row.price === "string" ? parseFloat(row.price) : row.price
        const dec   = price.toFixed(2).split(".")[1] ?? "00"
        bitScore  += parseInt(dec[0] ?? "0")
        coinScore += parseInt(dec[1] ?? "0")
      }
    }

    // 4. 종료가격: 해당 라운드 마지막 closing price
    const { data: closeRow } = await admin
      .from("btc_closing_prices")
      .select("price")
      .lte("time", prevRaceTime)
      .order("time", { ascending: false })
      .limit(1)
      .single()

    if (!closeRow) {
      return NextResponse.json({ skipped: true, reason: "no close price found", time: prevRaceTime })
    }

    const closePrice = typeof closeRow.price === "string"
      ? parseFloat(closeRow.price)
      : closeRow.price

    const winner: "bit" | "coin" | "tie" =
      bitScore > coinScore ? "bit"
      : coinScore > bitScore ? "coin"
      : "tie"

    // 5. DB upsert
    const { error } = await admin.from("race_results").upsert({
      time:       prevRaceTime,
      price:      closePrice,
      bit_score:  bitScore,
      coin_score: coinScore,
      winner,
    }, { onConflict: "time" })

    if (error) {
      console.error("[race-cron] upsert error:", error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log(`[race-cron] saved round ${prevRaceRound} time=${prevRaceTime} bit=${bitScore} coin=${coinScore} winner=${winner}`)
    return NextResponse.json({ saved: true, time: prevRaceTime, bitScore, coinScore, winner })

  } catch (err) {
    console.error("[race-cron] unexpected error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
