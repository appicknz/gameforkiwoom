export const dynamic = "force-dynamic"
/**
 * GET /api/cron/auto-trading3-close
 * KST 장마감(15:30) 이후 자동 호출 — 자동매매3(국내주식) 당일 보유 종목의
 * 종가를 KIS에서 조회해 auto_trading3_daily_closes / auto_trading3_records에 저장.
 * 이렇게 하면 패널에서 "종가 저장" 버튼을 누르지 않아도 과거 날짜 조회 시
 * "대기 중" 대신 저장된 종가를 바로 보여줄 수 있다.
 *
 * Vercel Cron: "40 6 * * 1-5" (UTC 06:40 = KST 15:40, 평일만)
 */

import { NextResponse } from "next/server"
import { closeAutoTrading3Day } from "@/lib/auto-trading3"

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "tasko-internal"
const CRON_SECRET = process.env.CRON_SECRET ?? ""

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? ""
  const bearer = authHeader.replace("Bearer ", "")
  const xInternal = req.headers.get("x-internal-secret") ?? ""

  const validCron = CRON_SECRET && bearer === CRON_SECRET
  const validInternal = bearer === INTERNAL_SECRET || xInternal === INTERNAL_SECRET
  const validNoCron = !CRON_SECRET && (bearer === INTERNAL_SECRET || xInternal === INTERNAL_SECRET)

  if (!validCron && !validInternal && !validNoCron) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const url = new URL(req.url)
  const dateParam = url.searchParams.get("date")
  const date =
    dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
      ? dateParam
      : new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

  try {
    const results = await closeAutoTrading3Day(date)
    return NextResponse.json({ ok: true, date, closed_count: results.length, results })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "종가 저장 실패" },
      { status: 500 },
    )
  }
}
