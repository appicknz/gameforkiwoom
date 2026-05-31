export const dynamic = "force-dynamic"
/**
 * GET  /api/auto-signal/positions?date=YYYY-MM-DD  — 날짜별 포지션 목록
 *   - 오늘 날짜: is_historical=false, final_pnl/final_roi null → 클라이언트가 실시간 계산
 *   - 과거 날짜: is_historical=true, Binance Klines로 KST 일봉 종가 조회 → final_pnl/final_roi 계산해서 반환
 *     과거 응답은 Cache-Control: max-age=3600 → 동일 날짜 반복 조회 시 Binance 호출 0번
 *
 * DELETE /api/auto-signal/positions  — 삭제 (master 전용)
 *   body: { id } 단건 삭제 | { all: true } 전체 초기화
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
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const date = searchParams.get("date") // YYYY-MM-DD (KST 기준)

  let query = adminSupabase
    .from("auto_signal_positions")
    .select("*")
    .order("signal_time", { ascending: false })

  if (date) {
    // 날짜 지정: 해당 날짜의 모든 포지션 (is_closed 무관 — 히스토리 포함)
    query = query.eq("date_label", date)
  } else {
    // 날짜 미지정: 오늘 포지션 중 활성 + 스탑로스 청산 모두 포함
    const today = todayKST()
    query = query.eq("date_label", today).or("is_closed.eq.false,close_reason.eq.stop_loss")
  }

  const { data, error } = await query.limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const positions: Record<string, unknown>[] = data ?? []
  const today = todayKST()
  const isHistorical = !!date && date < today

  if (!isHistorical || positions.length === 0) {
    // 오늘 또는 날짜 미지정 → 클라이언트에서 실시간 가격으로 계산
    return NextResponse.json({ positions, is_historical: false })
  }

  // ── 과거 날짜: Binance Klines로 KST 일봉 종가 조회 ──
  const symbols = [...new Set(positions.map(p => String(p.symbol)))]
  const closePriceMap = await getDayCloseMap(symbols, date)

  // 각 포지션에 종가 기준 PnL/ROI 계산
  const enriched = positions.map(pos => {
    const entryPrice  = Number(pos.entry_price)
    const sizeUsd     = Number(pos.size_usd ?? 10)
    const leverage    = Number(pos.leverage ?? 1)
    const closeReason = String(pos.close_reason ?? "")

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

  // 과거 데이터는 1시간 캐시 (Binance 호출 최소화)
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

  const now = new Date().toISOString()

  if (body.all === true) {
    const { error } = await adminSupabase
      .from("auto_signal_positions")
      .update({ is_closed: true, closed_at: now, close_reason: body.reason ?? "manual" })
      .eq("is_closed", false)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, closed: "all" })
  }

  if (body.id) {
    const updatePayload: Record<string, unknown> = {
      is_closed:    true,
      closed_at:    now,
      close_reason: body.reason ?? "manual",
    }
    if (body.closed_roi   !== undefined) updatePayload.closed_roi   = body.closed_roi
    if (body.closed_price !== undefined) updatePayload.closed_price = body.closed_price

    const { error } = await adminSupabase
      .from("auto_signal_positions")
      .update(updatePayload)
      .eq("id", body.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, deleted: body.id })
  }

  return NextResponse.json({ error: "provide id or all:true" }, { status: 400 })
}
