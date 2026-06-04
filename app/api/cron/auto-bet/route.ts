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

  // ── 전략 ──────────────────────────────────────────────────────
  // 바카라(30초 라운드): cron 1분 내에 라운드 2개를 커버
  //   배팅 구간: secInRound 5~19 (남은 25→11초)
  //   wave 트리거 secInRound: 5(30%), 10(15%), 14(15%), 17(나머지)
  //   → runBetForGame 내부에서 wave 대기/실행을 직접 처리
  //   → cron은 배팅 구간 진입 직전(secInRound=3~4)에 한 번씩 호출
  // 레이스(180초 라운드): 배팅 구간 10~59초, 분당 1회 호출로 충분
  // maxDuration=55초 내 안전하게 처리

  const results: Record<string, unknown> = {}

  const sleepMs = (ms: number) => new Promise(r => setTimeout(r, ms))
  const nowMs = () => Date.now()

  // ── 레이스 정산 (1회) ─────────────────────────────────────────
  const t0 = Math.floor(nowMs() / 1000)
  const raceRound0 = Math.floor(t0 / 180)
  results.raceSettle = await callBotSettle("race", raceRound0 - 1)

  // ── 헬퍼: 현재 secInRound 반환 ───────────────────────────────
  const bacSecInRound = () => Math.floor(nowMs() / 1000) % 30

  // ── 바카라 1라운드 처리 ───────────────────────────────────────
  // 현재 secInRound가 5 미만이면 5초까지 대기, 배팅 시작 (wave는 내부에서 관리)
  // 이미 배팅 구간(5~19)이면 즉시 호출
  // 게임중(20~29)이면 다음 라운드 배팅 구간까지 대기
  const waitUntilBettingStart = async (maxWaitMs: number) => {
    const deadline = nowMs() + maxWaitMs
    while (nowMs() < deadline) {
      const s = bacSecInRound()
      if (s >= 5 && s < 20) return true   // 배팅 구간 진입
      if (s >= 20) {
        // 게임중 → 다음 라운드 시작(0초) + 5초 까지 대기
        const waitSec = (30 - s) + 5
        await sleepMs(waitSec * 1000 + 100)
      } else {
        // 정산중(0~4) → 5초까지 대기
        const waitSec = 5 - s
        await sleepMs(waitSec * 1000 + 100)
      }
    }
    return false
  }

  // 1라운드
  const r1Ready = await waitUntilBettingStart(20000) // 최대 20초 대기
  if (r1Ready) {
    const nowBac = Math.floor(nowMs() / 1000)
    results.settle_bac_1 = await callBotSettle("baccarat", Math.floor(nowBac / 30) - 1)
    results.baccarat_1 = await callAutoBet("bet_baccarat") // 내부 wave 로직 실행 (~12초 소요)
  }

  // ── 레이스 배팅 (배팅 구간 10~59초에 진입 시 실행) ─────────────
  const raceSecInRound = () => Math.floor(nowMs() / 1000) % 180
  const rs = raceSecInRound()
  if (rs >= 10 && rs < 60) {
    results.race = await callAutoBet("bet_race")
  }

  // ── 바카라 2라운드 (1라운드 종료 후 남은 시간으로 커버) ──────────
  // bet_baccarat 내부에서 최대 12초 소요 → 이후 다음 라운드 배팅 구간 대기
  const r2Ready = await waitUntilBettingStart(25000) // 최대 25초 대기
  if (r2Ready) {
    const nowBac2 = Math.floor(nowMs() / 1000)
    results.settle_bac_2 = await callBotSettle("baccarat", Math.floor(nowBac2 / 30) - 1)
    results.baccarat_2 = await callAutoBet("bet_baccarat")
  }

  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
    results,
  })
}
