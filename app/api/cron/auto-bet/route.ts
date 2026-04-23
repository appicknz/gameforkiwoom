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
        headers: {
          "Content-Type": "application/json",
          "x-internal-secret": process.env.CRON_SECRET ?? "",
        },
        body: JSON.stringify({ action }),
      })
      return await res.json()
    } catch (e) {
      return { error: String(e) }
    }
  }

  const results: Record<string, unknown> = {}

  // ── 첫 번째 시도 ─────────────────────────────────────────────
  const nowSec1 = Math.floor(Date.now() / 1000)
  const baccaratSec1 = nowSec1 % 30   // 0~29
  const raceSec1     = nowSec1 % 180  // 0~179

  // 바카라: 배팅 구간 5~19초 (15초) — 구간 진입 직후(5~9초)에 트리거
  const doBaccarat1 = baccaratSec1 >= 5 && baccaratSec1 <= 9
  // 레이스: 배팅 구간 10~59초 — 구간 진입 직후(10~12초)에 트리거
  const doRace1 = raceSec1 >= 10 && raceSec1 <= 12

  if (doBaccarat1) results.baccarat1 = await callAutoBet("bet_baccarat")
  if (doRace1)     results.race      = await callAutoBet("bet_race")

  // ── 30초 대기 후 두 번째 바카라 라운드 처리 ──────────────────
  // cron이 분당 1회라 한 번의 cron 실행에서 2개의 30초 라운드를 모두 커버
  await new Promise(res => setTimeout(res, 30000))

  const nowSec2 = Math.floor(Date.now() / 1000)
  const baccaratSec2 = nowSec2 % 30
  const doBaccarat2 = baccaratSec2 >= 5 && baccaratSec2 <= 9

  if (doBaccarat2) results.baccarat2 = await callAutoBet("bet_baccarat")

  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
    triggered: {
      baccarat1: doBaccarat1,
      baccarat2: doBaccarat2,
      race: doRace1,
    },
    results,
  })
}
