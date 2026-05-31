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

  // ── 리밸런싱 스냅샷 저장 ───────────────────────────────────────
  // 설정에서 seed_capital, stop_loss_pct, size_usd, leverage 조회
  const { data: cfg } = await adminSupabase
    .from("auto_signal_settings")
    .select("seed_capital, stop_loss_pct, size_usd, leverage")
    .eq("id", 1)
    .single()

  const seedCapital = Number(cfg?.seed_capital ?? 640)
  const stopLossPct = Number(cfg?.stop_loss_pct ?? 5)
  const sizeUsd     = Number(cfg?.size_usd ?? 10)
  const leverage    = Number(cfg?.leverage ?? 10)

  // 당일 SL 청산 PNL (설정값 기준 고정)
  const { data: slPositions } = await adminSupabase
    .from("auto_signal_positions")
    .select("leverage, size_usd")
    .eq("date_label", dateLabel)
    .eq("close_reason", "stop_loss")
    .eq("is_closed", true)

  const slPnl = (slPositions ?? []).reduce((s: number, p: { leverage: number; size_usd: number }) => {
    const lev  = Number(p.leverage ?? leverage)
    const size = Number(p.size_usd ?? sizeUsd)
    return s - (size * stopLossPct * lev / 100)
  }, 0)

  // day_close 포지션들의 PNL (저장된 closed_roi 기반)
  const { data: dayClosePos } = await adminSupabase
    .from("auto_signal_positions")
    .select("size_usd, closed_roi")
    .eq("date_label", dateLabel)
    .eq("close_reason", "day_close")
    .eq("is_closed", true)

  const dayClosePnl = (dayClosePos ?? []).reduce((s: number, p: { size_usd: number; closed_roi: number | null }) => {
    if (p.closed_roi == null) return s
    return s + Number(p.size_usd ?? sizeUsd) * (Number(p.closed_roi) / 100)
  }, 0)

  const dailyPnl = slPnl + dayClosePnl
  const estValue = seedCapital + dailyPnl

  // 리밸런싱 기록 저장 (당일 중복 방지 — upsert 대신 기존 기록 확인)
  const { data: existing } = await adminSupabase
    .from("auto_signal_rebalance")
    .select("id")
    .eq("date_label", dateLabel)
    .limit(1)
    .single()

  if (!existing) {
    await adminSupabase
      .from("auto_signal_rebalance")
      .insert({
        date_label:    dateLabel,
        seed_capital:  seedCapital,
        est_value:     estValue,
        daily_pnl:     dailyPnl,
        note:          "day_close (auto)",
        rebalanced_at: now,
      })

    // 다음 날 시드를 EST. VALUE로 업데이트
    await adminSupabase
      .from("auto_signal_settings")
      .update({ seed_capital: estValue })
      .eq("id", 1)
  }

  return NextResponse.json({
    ok:           true,
    date_label:   dateLabel,
    closed_count: positions.length,
    daily_pnl:    dailyPnl,
    est_value:    estValue,
  })
}
