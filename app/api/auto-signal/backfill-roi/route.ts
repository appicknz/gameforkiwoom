export const dynamic = "force-dynamic"
/**
 * POST /api/auto-signal/backfill-roi
 * closed_roi=null 인 과거 포지션들을 Binance KST 23:59 종가로 소급 계산해서 채움.
 * body: { date_label?: "YYYY-MM-DD" } — 생략 시 전체 날짜 처리
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"

const BINANCE_BASE    = "https://fapi.binance.com"
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "tasko-internal"

/** KST 날짜의 23:59:00 1분봉 종가를 Binance Futures에서 조회 */
async function getKst2359Price(symbol: string, dateLabel: string): Promise<number | null> {
  const todayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  if (dateLabel >= todayKST) return null  // 오늘 또는 미래는 스킵

  const sym       = symbol.replace(/\.P$/, "").toUpperCase()
  const kstEnd    = new Date(`${dateLabel}T23:59:00+09:00`)
  const startTime = kstEnd.getTime()
  const endTime   = startTime + 60_000

  try {
    const url = `${BINANCE_BASE}/fapi/v1/klines?symbol=${sym}&interval=1m&startTime=${startTime}&endTime=${endTime}&limit=1`
    const res = await fetch(url)
    if (!res.ok) return null
    const data: [number, string, string, string, string][] = await res.json()
    if (!Array.isArray(data) || data.length === 0) return null
    return parseFloat(data[0][4])  // close price
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization") ?? ""
  const secret     = req.headers.get("x-internal-secret") ?? authHeader.replace("Bearer ", "")
  const cronSecret = process.env.CRON_SECRET ?? INTERNAL_SECRET
  if (secret !== cronSecret && secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  let dateFilter: string | undefined
  try {
    const body = await req.json()
    dateFilter = body?.date_label
  } catch { /* body 없으면 전체 처리 */ }

  // closed_roi=null + is_closed=true 포지션 조회
  let query = adminSupabase
    .from("auto_signal_positions")
    .select("id, symbol, direction, entry_price, leverage, size_usd, date_label, close_reason")
    .eq("is_closed", true)
    .is("closed_roi", null)
    .not("close_reason", "eq", "stop_loss")  // SL은 별도 고정값 처리

  if (dateFilter) {
    query = query.eq("date_label", dateFilter)
  }

  const { data: positions, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!positions || positions.length === 0) {
    return NextResponse.json({ ok: true, updated: 0, message: "업데이트할 포지션 없음" })
  }

  let updated = 0
  let failed  = 0
  const results: { symbol: string; date: string; roi: number | null; price: number | null }[] = []

  // 날짜별로 그룹핑해서 처리 (동일 날짜 포지션은 한 번에)
  const byDate = new Map<string, typeof positions>()
  for (const p of positions) {
    const key = p.date_label as string
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(p)
  }

  for (const [dateLabel, datePositions] of byDate.entries()) {
    // 해당 날짜의 포지션들을 병렬로 Binance에서 조회
    await Promise.all(
      datePositions.map(async (pos: {
        id: string
        symbol: string
        direction: string
        entry_price: number
        leverage: number
        date_label: string
      }) => {
        const closePrice = await getKst2359Price(pos.symbol, dateLabel)
        const entry      = Number(pos.entry_price)
        const leverage   = Number(pos.leverage ?? 10)

        let closedRoi: number | null = null
        if (closePrice && entry > 0) {
          const delta = pos.direction === "long"
            ? (closePrice - entry) / entry
            : (entry - closePrice) / entry
          closedRoi = delta * leverage * 100
        }

        const { error: updateErr } = await adminSupabase
          .from("auto_signal_positions")
          .update({
            closed_price: closePrice,
            closed_roi:   closedRoi,
            close_reason: "day_close",  // manual → day_close로 정정
          })
          .eq("id", pos.id)

        if (updateErr) {
          failed++
        } else {
          updated++
          results.push({ symbol: pos.symbol, date: dateLabel, roi: closedRoi, price: closePrice })
        }
      })
    )
  }

  return NextResponse.json({ ok: true, updated, failed, total: positions.length, results })
}
