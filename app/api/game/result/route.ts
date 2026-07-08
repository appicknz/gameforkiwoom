export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/game/result?type=baccarat&round=12345678
 *
 * Redis game:result:{type}:{round} 키를 읽어 반환한다.
 * settle/route.ts가 라운드 종료 시 저장한 결과(closePrice, baccaratResult 등)를
 * 클라이언트가 새로고침 후 즉시 정산할 때 사용한다.
 */
import { redis } from "@/lib/redis"
import { adminSupabase as admin } from "@/lib/supabase-admin"
import { NextResponse } from "next/server"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type  = searchParams.get("type") ?? "baccarat"
  const round = parseInt(searchParams.get("round") ?? "0")
  if (!round) return NextResponse.json({ error: "round required" }, { status: 400 })

  // 1순위: Redis game:result 키 (TTL 24h)
  const raw = await redis.get<string>(`game:result:${type}:${round}`).catch(() => null)
  if (raw) {
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw
      return NextResponse.json(parsed)
    } catch {}
  }

  // 2순위: btc_closing_prices DB fallback (바카라)
  if (type === "baccarat") {
    const closeTime = round * 30
    const { data } = await admin
      .from("btc_closing_prices")
      .select("price, time, baccarat_result, b_score, p_score")
      .eq("time", closeTime)
      .maybeSingle()
    if (data) {
      const p = typeof data.price === "string" ? parseFloat(data.price) : data.price
      return NextResponse.json({
        roundNumber:    round,
        closePrice:     p,
        basePrice:      p,
        baccaratResult: data.baccarat_result ?? "tie",
        pScore:         data.p_score ?? 0,
        bScore:         data.b_score ?? 0,
      })
    }
  }

  // 3순위: 레이스 — race_results DB fallback
  if (type === "race") {
    const raceTime = round * 180
    const { data } = await admin
      .from("race_results")
      .select("bit_score, coin_score, winner, close_price")
      .eq("time", raceTime)
      .maybeSingle()
    if (data) {
      return NextResponse.json({
        roundNumber: round,
        closePrice:  data.close_price ?? 0,
        raceWinner:  data.winner,
        bitScore:    data.bit_score ?? 0,
        coinScore:   data.coin_score ?? 0,
      })
    }
  }

  return NextResponse.json({ error: "result not found" }, { status: 404 })
}
