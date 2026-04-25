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

  // ── 첫 번째 시도 ─────────────────────────────────────────────
  const nowSec1 = Math.floor(Date.now() / 1000)
  const baccaratSec1 = nowSec1 % 30
  const raceSec1     = nowSec1 % 180

  // 바카라: 배팅 구간 5~19초 — 진입 직후 배팅
  const doBaccarat1 = baccaratSec1 >= 5 && baccaratSec1 <= 9
  // 레이스: 배팅 구간 10~59초 — 진입 직후 배팅
  const doRace1 = raceSec1 >= 10 && raceSec1 <= 12
  // 바카라: 정산 구간 0~4초 — 직전 라운드 봇 정산
  const doSettle1 = baccaratSec1 >= 0 && baccaratSec1 <= 4
  // 레이스: 정산 구간 0~9초 — 직전 라운드 봇 정산
  const doRaceSettle1 = raceSec1 >= 0 && raceSec1 <= 9

  const baccaratRound1 = Math.floor(nowSec1 / 30)
  const raceRound1     = Math.floor(nowSec1 / 180)

  if (doBaccarat1) results.baccarat1 = await callAutoBet("bet_baccarat")
  if (doRace1)     results.race      = await callAutoBet("bet_race")
  // 정산: 직전 라운드 정산 (현재 라운드 -1)
  if (doSettle1)     results.settle1      = await callBotSettle("baccarat", baccaratRound1 - 1)
  if (doRaceSettle1) results.raceSettle1  = await callBotSettle("race", raceRound1 - 1)

  // ── 30초 대기 후 두 번째 바카라 라운드 처리 ──────────────────
  await new Promise(res => setTimeout(res, 30000))

  const nowSec2 = Math.floor(Date.now() / 1000)
  const baccaratSec2 = nowSec2 % 30
  const doBaccarat2  = baccaratSec2 >= 5 && baccaratSec2 <= 9
  const doSettle2    = baccaratSec2 >= 0 && baccaratSec2 <= 4
  const baccaratRound2 = Math.floor(nowSec2 / 30)

  if (doBaccarat2) results.baccarat2 = await callAutoBet("bet_baccarat")
  if (doSettle2)   results.settle2   = await callBotSettle("baccarat", baccaratRound2 - 1)

  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
    triggered: { baccarat1: doBaccarat1, baccarat2: doBaccarat2, race: doRace1, settle1: doSettle1, settle2: doSettle2, raceSettle: doRaceSettle1 },
    results,
  })
}
