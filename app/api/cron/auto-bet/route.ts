import { NextResponse } from "next/server"

// Vercel Cron: 매분 실행 → 바카라(30초 라운드)와 레이스(3분 라운드) 배팅 구간 체크 후 자동배팅
// vercel.json: "schedule": "* * * * *"
export const runtime = "nodejs"
export const maxDuration = 55  // 배팅 분산 딜레이(최대 9초) + 여유

export async function GET(request: Request) {
  // Vercel Cron 인증 헤더 확인
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000"

  const nowSec = Math.floor(Date.now() / 1000)
  const baccaratSec = nowSec % 30   // 0~29
  const raceSec     = nowSec % 180  // 0~179

  // 바카라: 배팅 구간 5~14초 → 구간 진입 직후(5~7초)에만 트리거
  const doBaccarat = baccaratSec >= 5 && baccaratSec <= 7

  // 레이스: 배팅 구간 10~59초 → 구간 진입 직후(10~12초)에만 트리거
  const doRace = raceSec >= 10 && raceSec <= 12

  const results: Record<string, unknown> = {}

  // 내부 API 호출 (인증 없이 서버→서버 호출, 같은 Next.js 프로세스)
  const callAutoBet = async (action: string) => {
    try {
      const res = await fetch(`${baseUrl}/api/admin/auto-bet`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // 서버→서버 내부 호출용 시크릿
          "x-internal-secret": process.env.CRON_SECRET ?? "",
        },
        body: JSON.stringify({ action }),
      })
      return await res.json()
    } catch (e) {
      return { error: String(e) }
    }
  }

  if (doBaccarat) {
    results.baccarat = await callAutoBet("bet_baccarat")
  }
  if (doRace) {
    results.race = await callAutoBet("bet_race")
  }

  return NextResponse.json({
    ok: true,
    ts: new Date().toISOString(),
    baccaratSec,
    raceSec,
    triggered: { baccarat: doBaccarat, race: doRace },
    results,
  })
}
