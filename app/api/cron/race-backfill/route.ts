/**
 * /api/cron/race-backfill
 *
 * /race 페이지 접속 시 호출 — 누락된 최근 N개 라운드를 btc_closing_prices에서 직접 계산해 upsert.
 * 클라이언트가 없던 구간도 DB에 채워줌.
 */
import { adminSupabase as admin } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

export const runtime = "nodejs"

export async function GET() {
  const now = Math.floor(Date.now() / 1000)
  const currentRound = Math.floor(now / 180)

  // 최근 20라운드(1시간)에서 누락된 것만 채움
  const roundsToCheck = Array.from({ length: 20 }, (_, i) => currentRound - 1 - i)

  // DB에 이미 있는 time 목록 조회
  const timesToCheck = roundsToCheck.map(r => r * 180)
  const { data: existing } = await admin
    .from("race_results")
    .select("time")
    .in("time", timesToCheck)

  const existingTimes = new Set((existing ?? []).map(r => r.time))
  const missing = roundsToCheck.filter(r => !existingTimes.has(r * 180))

  if (missing.length === 0) {
    return NextResponse.json({ ok: true, backfilled: 0 })
  }

  const saved: number[] = []

  for (const round of missing) {
    const roundEnd   = round * 180                 // 라운드 종료 경계
    const roundStart = (round - 1) * 180 + 1      // 직전 라운드 종료 +1초 ~ 이 라운드 종료

    const { data: rows } = await admin
      .from("btc_closing_prices")
      .select("price, time")
      .gte("time", roundStart)
      .lte("time", roundEnd)
      .order("time", { ascending: true })

    if (!rows || rows.length === 0) continue

    let bit = 0, coin = 0
    for (const row of rows) {
      const price = typeof row.price === "string" ? parseFloat(row.price) : row.price
      const dec   = price.toFixed(2).split(".")[1] ?? "00"
      bit  += parseInt(dec[0] ?? "0")
      coin += parseInt(dec[1] ?? "0")
    }

    if (bit === 0 && coin === 0) continue

    const lastRow   = rows[rows.length - 1]
    const closePrice = typeof lastRow.price === "string" ? parseFloat(lastRow.price) : lastRow.price
    const winner: "bit" | "coin" | "tie" = bit > coin ? "bit" : coin > bit ? "coin" : "tie"

    const { error } = await admin.from("race_results").upsert({
      time:       roundEnd,
      price:      closePrice,
      bit_score:  bit,
      coin_score: coin,
      winner,
    }, { onConflict: "time" })

    if (!error) saved.push(roundEnd)
  }

  return NextResponse.json({ ok: true, backfilled: saved.length, times: saved })
}
