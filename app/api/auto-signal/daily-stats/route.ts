export const dynamic = "force-dynamic"
import "server-only"
import { adminSupabase as _admin } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { getDayCloseMap } from "@/lib/binance-klines"
import { NextResponse } from "next/server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = _admin as any

type Row = {
  date_label:   string
  close_reason: string
  symbol:       string
  closed_roi:   number | null
  final_roi:    number | null
  close_price:  string | null
  closed_price: string | null
  entry_price:  string | null
  direction:    string | null
  leverage:     number | null
}

/**
 * GET /api/auto-signal/daily-stats
 * date_label 기준 날짜별 수익 / 손실 / 청산 집계
 *
 * 분류 기준:
 *   청산(liq)    = close_reason === 'stop_loss'
 *   수익(profit) = 나머지, ROI > 0
 *   손실(loss)   = 나머지, ROI <= 0
 *
 * ROI 결정 우선순위:
 *   1) closed_roi (저장된 값)
 *   2) final_roi
 *   3) close_price / closed_price + entry_price 로 직접 계산
 *   4) roi & price 모두 null → Binance 일봉 종가(KST 23:59 기준)로 사후 계산
 *      confirmed_by_master 처리 시 Binance 현재가 조회가 실패하면 null로 저장되는 버그 보완
 */
export async function GET(req: Request) {
  const session = await verifySession(req)
  if (!session.ok || !["master", "admin"].includes(session.role ?? "")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // 전체 청산 포지션 — 페이지네이션으로 모두 수집
  const all: Row[] = []
  let offset = 0
  while (true) {
    const { data, error } = await admin
      .from("auto_signal_positions")
      .select("date_label, close_reason, symbol, closed_roi, final_roi, close_price, closed_price, entry_price, direction, leverage")
      .eq("is_closed", true)
      .gte("date_label", "2026-06-07")
      .order("date_label", { ascending: true })
      .range(offset, offset + 999)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data || data.length === 0) break
    all.push(...data)
    if (data.length < 1000) break
    offset += 1000
  }

  // ── Binance 일봉 종가 사전 조회 ──────────────────────────────────────
  // roi 와 close_price 가 모두 null 인 비-청산 레코드
  // → 날짜별 필요한 심볼을 모아 getDayCloseMap 병렬 호출
  const needKlines = all.filter(
    r => r.close_reason !== "stop_loss"
      && r.closed_roi  == null
      && r.final_roi   == null
      && r.close_price == null
      && r.closed_price == null
  )

  const dateSymbolMap: Record<string, Set<string>> = {}
  for (const r of needKlines) {
    if (!r.date_label || !r.symbol) continue
    if (!dateSymbolMap[r.date_label]) dateSymbolMap[r.date_label] = new Set()
    dateSymbolMap[r.date_label].add(r.symbol.replace(/\.P$/, "").toUpperCase())
  }

  // 날짜별 종가 캐시: { "2026-06-07" → Map<"BTCUSDT", 65000> }
  const klineCache: Record<string, Map<string, number>> = {}
  await Promise.all(
    Object.entries(dateSymbolMap).map(async ([date, symbols]) => {
      klineCache[date] = await getDayCloseMap([...symbols], date)
    })
  )
  // ─────────────────────────────────────────────────────────────────────

  // 날짜별 집계
  const byDate: Record<string, { profit: number; loss: number; liq: number }> = {}

  for (const r of all) {
    const d = r.date_label
    if (!d) continue
    if (!byDate[d]) byDate[d] = { profit: 0, loss: 0, liq: 0 }
    const rec = byDate[d]

    // 청산
    if (r.close_reason === "stop_loss") {
      rec.liq++
      continue
    }

    // ROI 계산 우선순위
    let roi: number | null = r.closed_roi ?? r.final_roi ?? null

    if (roi == null) {
      const savedClose = r.close_price ?? r.closed_price
      if (savedClose && r.entry_price) {
        // 저장된 종가로 직접 계산
        const entry  = Number(r.entry_price)
        const close  = Number(savedClose)
        const lev    = Number(r.leverage ?? 10)
        const isLong = r.direction === "long"
        roi = isLong
          ? (close - entry) / entry * lev * 100
          : (entry - close) / entry * lev * 100
      } else if (r.entry_price && klineCache[d]) {
        // Binance 일봉 종가 fallback
        const sym      = (r.symbol ?? "").replace(/\.P$/, "").toUpperCase()
        const kClose   = klineCache[d].get(sym) ?? null
        if (kClose) {
          const entry  = Number(r.entry_price)
          const lev    = Number(r.leverage ?? 10)
          const isLong = r.direction === "long"
          roi = isLong
            ? (kClose - entry) / entry * lev * 100
            : (entry - kClose) / entry * lev * 100
        }
      }
    }

    if (roi != null) {
      if (roi > 0) rec.profit++
      else rec.loss++
    } else {
      // ROI를 끝내 알 수 없는 경우 — 손실로 보수적 처리
      rec.loss++
    }
  }

  const stats = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => {
      const total   = d.profit + d.loss + d.liq
      const liqRate = total > 0 ? Math.round((d.liq / total) * 1000) / 10 : 0
      return { date, profit: d.profit, loss: d.loss, liq: d.liq, total, liqRate }
    })

  return NextResponse.json({ stats })
}
