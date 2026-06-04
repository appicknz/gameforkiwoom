export const dynamic = "force-dynamic"
import { NextResponse } from "next/server"

// Vercel Cron: 매분 실행 → 바카라(30초 라운드)와 레이스(3분 라운드) 배팅 구간 체크 후 자동배팅
// vercel.json: "schedule": "* * * * *"
// 바카라 30초 라운드: 분당 2개 → cron 1회로 첫 번째 라운드 배팅 후 30초 뒤 두 번째도 처리
export const runtime = "nodejs"
export const maxDuration = 55

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000"

  const callAutoBet = async (action: string) => {
    try {
      const res = await fetch(`${baseUrl}/api/admin/auto-bet`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-secret": process.env.CRON_SECRET ?? "" },
        body: JSON.stringify({ action }),
      })
      return await res.json()
    } catch (e) { return { error: String(e) } }
  }

  // 봇 정산 호출 — 마감가를 btc_closing_prices에서 조회해 정산
  const callBotSettle = async (gameType: "baccarat" | "race", roundNumber: number) => {
    try {
      // 해당 라운드 마감가 조회
      const { createClient } = await import("@supabase/supabase-js")
      const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      const roundEndTime = gameType === "baccarat" ? (roundNumber + 1) * 30 : (roundNumber + 1) * 180
      const { data: closeRow } = await supabase
        .from("btc_closing_prices")
        .select("price")
        .lte("time", roundEndTime)
        .order("time", { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!closeRow) return { skipped: true, reason: "no close price" }

      const closePrice = typeof closeRow.price === "string" ? parseFloat(closeRow.price) : closeRow.price
      const basePrice  = roundNumber * (gameType === "baccarat" ? 30 : 180)  // 라운드 시작가는 없으므로 closePrice로 대체

      const res = await fetch(`${baseUrl}/api/cron/bot-settle`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-internal-secret": process.env.CRON_SECRET ?? "" },
        body: JSON.stringify({ roundNumber, gameType, closePrice, basePrice: closePrice }),
      })
      return await res.json()
    } catch (e) { return { error: String(e) } }
  }

  const results: Record<string, unknown> = {}

  // 전략: cron에서 phase 판단 없이 매 실행마다 배팅 호출
  // isBettingPhase 체크는 /api/admin/auto-bet 서버 내부에서 수행
  // 바카라 30초 라운드를 분당 2회 커버하기 위해 5초 간격으로 6회 폴링

  const nowSec0    = Math.floor(Date.now() / 1000)
  const raceRound0 = Math.floor(nowSec0 / 180)

  // 레이스 정산 (분당 1회로 충분)
  results.raceSettle = await callBotSettle("race", raceRound0 - 1)

  // 바카라 + 레이스를 5초 간격으로 6회 시도 (총 25초, maxDuration=55초 내 안전)
  // 각 호출은 내부 isBettingPhase가 허용할 때만 실제 배팅
  const betResults: unknown[] = []
  const raceResults: unknown[] = []

  for (let i = 0; i < 6; i++) {
    const nowSec = Math.floor(Date.now() / 1000)
    const bacRound = Math.floor(nowSec / 30)

    // 바카라 정산 (각 라운드 전환 시점에 1회)
    if (i === 0 || i === 3) {
      results[`settle_bac_${i}`] = await callBotSettle("baccarat", bacRound - 1)
    }

    // 배팅 시도 (내부에서 phase 체크)
    const [bacRes, raceRes] = await Promise.all([
      callAutoBet("bet_baccarat"),
      callAutoBet("bet_race"),
    ])
    betResults.push(bacRes)
    raceResults.push(raceRes)

    if (i < 5) await new Promise(r => setTimeout(r, 5000))
  }

  results.baccarat = betResults
  results.race     = raceResults

  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
    results,
  })
}
