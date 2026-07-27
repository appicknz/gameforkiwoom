export const dynamic = "force-dynamic"
import "server-only"
import { adminSupabase as _admin } from "@/lib/supabase-admin"
import { verifySession } from "@/lib/auth"
import { NextResponse } from "next/server"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const admin = _admin as any

/**
 * GET /api/auto-signal/daily-stats
 * date_label 기준 날짜별 수익 / 손실 / 청산 집계
 * - 청산(liq)    = close_reason === 'stop_loss'
 * - 수익(profit) = 나머지, closed_roi or final_roi > 0
 * - 손실(loss)   = 나머지, closed_roi or final_roi <= 0
 * - 청산율       = liq / (profit+loss+liq) * 100
 */
export async function GET(req: Request) {
  const session = await verifySession(req)
  if (!session.ok || !["master", "admin"].includes(session.role ?? "")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  }

  // 전체 청산 포지션 — 페이지네이션으로 모두 수집
  const all: Array<{
    date_label: string
    close_reason: string
    closed_roi: number | null
    final_roi: number | null
    close_price: string | null
    entry_price: string | null
    direction: string | null
    leverage: number | null
  }> = []

  let offset = 0
  while (true) {
    const { data, error } = await admin
      .from("auto_signal_positions")
      .select("date_label, close_reason, closed_roi, final_roi, close_price, entry_price, direction, leverage")
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

  // 날짜별 집계
  const byDate: Record<string, { profit: number; loss: number; liq: number }> = {}

  for (const r of all) {
    const d = r.date_label
    if (!d) continue
    if (!byDate[d]) byDate[d] = { profit: 0, loss: 0, liq: 0 }
    const rec = byDate[d]

    if (r.close_reason === "stop_loss") {
      rec.liq++
    } else {
      const roi = r.closed_roi ?? r.final_roi
      if (roi != null) {
        if (Number(roi) > 0) rec.profit++
        else rec.loss++
      } else if (r.close_price && r.entry_price) {
        const entry  = Number(r.entry_price)
        const close  = Number(r.close_price)
        const lev    = Number(r.leverage ?? 10)
        const isLong = r.direction === "long"
        const pct    = isLong
          ? (close - entry) / entry * lev * 100
          : (entry - close) / entry * lev * 100
        if (pct > 0) rec.profit++
        else rec.loss++
      } else {
        rec.loss++
      }
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
