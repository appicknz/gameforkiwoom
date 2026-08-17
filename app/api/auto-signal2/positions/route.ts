export const dynamic = "force-dynamic"
/**
 * GET  /api/auto-signal2/positions?date=YYYY-MM-DD
 * 자동매매2(역삼1 전용, UP3 제외 신호) 포지션 조회
 * auto_signal_positions(기존 매매기록)와 완전히 분리된 테이블만 조회
 *   - 오늘 날짜: is_historical=false, final_pnl/final_roi null → 클라이언트가 실시간 계산
 *   - 과거 날짜: is_historical=true, Binance Klines로 KST 일봉 종가 조회 → final_pnl/final_roi 계산해서 반환
 *
 * DELETE /api/auto-signal2/positions  — 강제 청산 (master 전용)
 *   body: { id, closed_price, closed_roi, reason }
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { getDayCloseMap } from "@/lib/binance-klines"

const JWT_SECRET   = process.env.SUPABASE_JWT_SECRET ?? ""
const MASTER_ROLES = ["master"]

function getCallerRole(req: Request): string | null {
  try {
    const auth  = req.headers.get("authorization") ?? ""
    const token = auth.replace("Bearer ", "").trim()
    if (!token) return null
    const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>
    return (decoded.role as string) ?? null
  } catch {
    return null
  }
}

/** KST 기준 오늘 날짜 YYYY-MM-DD */
function todayKST(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get("date")

  let query = adminSupabase
    .from("auto_signal2_positions")
    .select("*")
    .order("signal_time", { ascending: true })

  if (date) {
    query = query.eq("date_label", date)
  }

  const { data, error } = await query.limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const positions: Record<string, unknown>[] = data ?? []
  const today = todayKST()
  const isHistorical = !!date && date < today

  if (!isHistorical || positions.length === 0) {
    return NextResponse.json({ positions, is_historical: false })
  }

  // ── 과거 날짜: Binance Klines로 KST 일봉 종가 조회 ──
  const symbols = [...new Set(positions.map(p => String(p.symbol)))]
  const closePriceMap = await getDayCloseMap(symbols, date)

  const enriched = positions.map(pos => {
    const entryPrice = Number(pos.entry_price)
    const sizeUsd    = Number(pos.size_usd ?? 10)
    const leverage   = Number(pos.leverage ?? 1)

    // 저장된 closed_roi가 있으면 (stop_loss, day_close 모두) 재계산 없이 그대로 사용
    if (pos.closed_roi != null) {
      const roi = Number(pos.closed_roi)
      return {
        ...pos,
        close_price: pos.closed_price ?? null,
        final_pnl:   sizeUsd * (roi / 100),
        final_roi:   roi,
      }
    }

    const sym        = String(pos.symbol).replace(/\.P$/, "").toUpperCase()
    const closePrice = closePriceMap.get(sym) ?? null

    let finalPnl: number | null = null
    let finalRoi: number | null = null

    if (closePrice && entryPrice > 0) {
      const delta = pos.direction === "long"
        ? (closePrice - entryPrice) / entryPrice
        : (entryPrice - closePrice) / entryPrice
      finalPnl = sizeUsd * delta * leverage
      finalRoi = delta * leverage * 100
    }

    return {
      ...pos,
      close_price: closePrice,
      final_pnl:   finalPnl,
      final_roi:   finalRoi,
    }
  })

  return NextResponse.json(
    { positions: enriched, is_historical: true },
    { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } }
  )
}

export async function DELETE(req: Request) {
  const role = getCallerRole(req)
  if (!MASTER_ROLES.includes(role ?? "")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  if (!body.id) {
    return NextResponse.json({ error: "id required" }, { status: 400 })
  }

  const now = new Date().toISOString()
  const updatePayload: Record<string, unknown> = {
    is_closed:    true,
    closed_at:    now,
    close_reason: body.reason ?? "manual",
  }
  if (body.closed_roi   !== undefined) updatePayload.closed_roi   = body.closed_roi
  if (body.closed_price !== undefined) updatePayload.closed_price = body.closed_price

  const { error } = await adminSupabase
    .from("auto_signal2_positions")
    .update(updatePayload)
    .eq("id", body.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, deleted: body.id })
}

/** PATCH /api/auto-signal2/positions — 진입가 수정 (master 전용, 미청산 포지션만) */
export async function PATCH(req: Request) {
  const role = getCallerRole(req)
  if (!MASTER_ROLES.includes(role ?? "")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { id, entry_price } = body
  if (!id || entry_price === undefined) {
    return NextResponse.json({ error: "id, entry_price required" }, { status: 400 })
  }
  const price = Number(entry_price)
  if (!Number.isFinite(price) || price <= 0) {
    return NextResponse.json({ error: "invalid entry_price" }, { status: 400 })
  }

  const { data, error } = await adminSupabase
    .from("auto_signal2_positions")
    .update({ entry_price: price })
    .eq("id", id)
    .eq("is_closed", false)
    .select("id")
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: "position not found or already closed" }, { status: 404 })
  return NextResponse.json({ ok: true, id, entry_price: price })
}
