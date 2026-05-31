export const dynamic = "force-dynamic"
/**
 * GET /api/auto-signal/day-close
 * KST 자정(00:00)에 호출 — 활성 포지션의 현재가를 Binance에서 가져와
 * closed_roi, closed_price를 저장한 뒤 is_closed=true 마킹.
 * 이렇게 하면 과거 날짜 조회 시 종가 재계산 없이 저장된 값을 그대로 표시.
 *
 * Vercel Cron: "0 15 * * *" (UTC 15:00 = KST 00:00)
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "tasko-internal"
const BINANCE_BASE    = "https://fapi.binance.com"

/** Binance Futures 현재가 일괄 조회 */
async function getBinancePrices(symbols: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  try {
    // fapi/v1/ticker/price — 전체 심볼 한 번에 (배열 응답)
    const res  = await fetch(`${BINANCE_BASE}/fapi/v1/ticker/price`, { cache: "no-store" })
    if (!res.ok) return map
    const data: { symbol: string; price: string }[] = await res.json()
    const needed = new Set(symbols.map(s => s.replace(/\.P$/, "").toUpperCase()))
    for (const row of data) {
      if (needed.has(row.symbol)) {
        map.set(row.symbol, parseFloat(row.price))
      }
    }
  } catch {
    // 가격 조회 실패 시 빈 맵 반환 — 해당 포지션은 closed_roi null로 저장
  }
  return map
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? ""
  const secret     = req.headers.get("x-internal-secret") ?? authHeader.replace("Bearer ", "")
  const cronSecret = process.env.CRON_SECRET ?? INTERNAL_SECRET
  if (secret !== cronSecret && secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  // KST 어제 날짜 (자정 호출 기준 — 방금 끝난 날)
  const kstNow    = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const kstYest   = new Date(kstNow)
  kstYest.setDate(kstYest.getDate() - 1)
  const dateLabel = kstYest.toISOString().slice(0, 10)

  // 해당 날짜의 활성 포지션 조회
  const { data: positions, error: fetchErr } = await adminSupabase
    .from("auto_signal_positions")
    .select("id, symbol, direction, entry_price, size_usd, leverage")
    .eq("date_label", dateLabel)
    .eq("is_closed", false)

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!positions || positions.length === 0) {
    return NextResponse.json({ ok: true, date_label: dateLabel, closed_count: 0 })
  }

  // Binance 현재가 조회
  const symbols   = positions.map((p: { symbol: string }) => p.symbol)
  const priceMap  = await getBinancePrices(symbols)
  const now       = new Date().toISOString()

  // 각 포지션별 closed_roi, closed_price 계산 후 업데이트
  const updates = positions.map(async (pos: {
    id: string
    symbol: string
    direction: string
    entry_price: number
    size_usd: number
    leverage: number
  }) => {
    const sym      = pos.symbol.replace(/\.P$/, "").toUpperCase()
    const curPrice = priceMap.get(sym) ?? null
    const entry    = Number(pos.entry_price)
    const leverage = Number(pos.leverage ?? 1)

    let closedRoi: number | null = null
    if (curPrice && entry > 0) {
      const delta = pos.direction === "long"
        ? (curPrice - entry) / entry
        : (entry - curPrice) / entry
      closedRoi = delta * leverage * 100
    }

    return adminSupabase
      .from("auto_signal_positions")
      .update({
        is_closed:    true,
        closed_at:    now,
        close_reason: "day_close",
        closed_price: curPrice,
        closed_roi:   closedRoi,
      })
      .eq("id", pos.id)
  })

  await Promise.all(updates)

  return NextResponse.json({
    ok:           true,
    date_label:   dateLabel,
    closed_count: positions.length,
  })
}
