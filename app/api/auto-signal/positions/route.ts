export const dynamic = "force-dynamic"
/**
 * GET  /api/auto-signal/positions?date=YYYY-MM-DD  — 날짜별 포지션 목록
 *   - 오늘 날짜: is_historical=false, final_pnl/final_roi null → 클라이언트가 실시간 계산
 *   - 과거 날짜: is_historical=true, Binance Klines로 KST 일봉 종가 조회 → final_pnl/final_roi 계산해서 반환
 *     과거 응답은 Cache-Control: max-age=3600 → 동일 날짜 반복 조회 시 Binance 호출 0번
 *
 * PATCH /api/auto-signal/positions  — 방향 전환 (master 전용; 진입가/기록 보존)
 * DELETE /api/auto-signal/positions  — 삭제 (master 전용)
 *   body: { id } 단건 삭제 | { all: true } 전체 초기화
 */

import "server-only"
import { adminSupabase as _adminSupabase } from "@/lib/supabase-admin"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminSupabase = _adminSupabase as any
import { saveDailySnapshot } from "@/lib/save-daily-snapshot"
import { NextResponse } from "next/server"
import jwt from "jsonwebtoken"
import { verifySession } from "@/lib/auth"
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
  const date = searchParams.get("date") // YYYY-MM-DD (KST 기준)

  let query = adminSupabase
    .from("auto_signal_positions")
    .select("*")
    .order("signal_time", { ascending: false })

  if (date) {
    // 날짜 지정: 해당 날짜의 모든 포지션 (is_closed 무관 — 히스토리 포함)
    query = query.eq("date_label", date)
  } else {
    // 날짜 미지정: 오늘 KST 기준
    // 활성(is_closed=false): date_label=today
    // SL 청산(is_closed=true, close_reason=stop_loss): closed_at이 오늘 KST 날짜인 것
    const today    = todayKST()
    const kstStart = new Date(`${today}T00:00:00+09:00`).toISOString()
    const kstEnd   = new Date(`${today}T23:59:59+09:00`).toISOString()
    // Supabase or()로 두 조건 합침:
    // 1) 활성 포지션 (date_label=today AND is_closed=false)
    // 2) 오늘 SL 청산 (is_closed=true AND close_reason=stop_loss AND closed_at between kstStart~kstEnd)
    query = query.or(
      `and(date_label.eq.${today},is_closed.eq.false),` +
      `and(is_closed.eq.true,close_reason.eq.stop_loss,closed_at.gte.${kstStart},closed_at.lte.${kstEnd})`
    )
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
  const body = await req.json().catch(() => ({}))
  const session = await verifySession(req)
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status })

  const isMaster = MASTER_ROLES.includes(session.role ?? "")
  const { data: profile } = await adminSupabase
    .from("profiles")
    .select("username")
    .eq("id", session.userId)
    .single()
  const isSoltest5 = (profile as { username?: string } | null)?.username === "soltest5"
  const isConfirmOnlyClose = isSoltest5 && body.all === true && body.reason === "confirmed_by_master"
  if ((!isMaster && !isConfirmOnlyClose) || (isSoltest5 && !isConfirmOnlyClose)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const now = new Date().toISOString()

  if (body.all === true) {
    // 활성 포지션 조회 → Binance 현재가로 closed_price, closed_roi 계산 후 저장
    const { data: activePos, error: fetchErr } = await adminSupabase
      .from("auto_signal_positions")
      .select("id, symbol, direction, entry_price, leverage")
      .eq("is_closed", false)
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })

    if (activePos && activePos.length > 0) {
      // Binance 현재가 일괄 조회 (전체 ticker → 개별 fallback → klines fallback)
      const BINANCE_BASE = "https://fapi.binance.com"
      const priceMap = new Map<string, number>()
      const needed = new Set<string>(activePos.map((p: { symbol: string }) => p.symbol.replace(/\.P$/, "").toUpperCase()))

      // 1차: 전체 ticker
      try {
        const res = await fetch(`${BINANCE_BASE}/fapi/v1/ticker/price`, { cache: "no-store" })
        if (res.ok) {
          const data: { symbol: string; price: string }[] = await res.json()
          for (const row of data) {
            if (needed.has(row.symbol)) priceMap.set(row.symbol, parseFloat(row.price))
          }
        }
      } catch { /* fallback으로 이어짐 */ }

      // 2차: 누락 심볼 개별 조회
      const missing = [...needed].filter(s => !priceMap.has(s))
      if (missing.length > 0) {
        await Promise.all(missing.map(async sym => {
          try {
            const res = await fetch(`${BINANCE_BASE}/fapi/v1/ticker/price?symbol=${sym}`, { cache: "no-store" })
            if (res.ok) {
              const d: { price: string } = await res.json()
              if (d.price) priceMap.set(sym, parseFloat(d.price))
            }
          } catch { /* 개별 조회 실패 */ }
        }))
      }

      // 3차: 여전히 누락이면 최근 1분봉 klines
      const stillMissing = [...needed].filter(s => !priceMap.has(s))
      if (stillMissing.length > 0) {
        await Promise.all(stillMissing.map(async sym => {
          try {
            const res = await fetch(
              `${BINANCE_BASE}/fapi/v1/klines?symbol=${sym}&interval=1m&limit=1`,
              { cache: "no-store" }
            )
            if (res.ok) {
              const d: [number, string, string, string, string][] = await res.json()
              if (d?.[0]?.[4]) priceMap.set(sym, parseFloat(d[0][4]))
            }
          } catch { /* klines 조회도 실패 */ }
        }))
      }

      // 포지션별 개별 업데이트 (closed_price, closed_roi 포함)
      await Promise.all(
        activePos.map(async (pos: { id: string; symbol: string; direction: string; entry_price: number; leverage: number }) => {
          const sym      = pos.symbol.replace(/\.P$/, "").toUpperCase()
          const curPrice = priceMap.get(sym) ?? null
          const entry    = Number(pos.entry_price)
          const lev      = Number(pos.leverage ?? 10)
          let closedRoi: number | null = null
          if (curPrice && entry > 0) {
            const delta = pos.direction === "long"
              ? (curPrice - entry) / entry
              : (entry - curPrice) / entry
            closedRoi = delta * lev * 100
          }
          return adminSupabase
            .from("auto_signal_positions")
            .update({
              is_closed:    true,
              closed_at:    now,
              close_reason: body.reason ?? "manual",
              closed_price: curPrice,
              closed_roi:   closedRoi,
            })
            .eq("id", pos.id)
        })
      )
    }

    // 반영 버튼(confirmed_by_master) 시 스냅샷 저장
    if ((body.reason ?? "manual") === "confirmed_by_master" && activePos && activePos.length > 0) {
      const dateLabel = todayKST()
      // 설정에서 margin 기준값(seed_capital) 조회
      const { data: cfg } = await adminSupabase
        .from("auto_signal_settings")
        .select("seed_capital, stop_loss_pct, size_usd, leverage")
        .eq("id", 1)
        .single()
      await saveDailySnapshot({
        dateLabel,
        closeType:   "confirmed_by_master",
        margin:      Number(cfg?.seed_capital ?? 0),
        cfgSizeUsd:  Number(cfg?.size_usd     ?? 10),
        cfgLeverage: Number(cfg?.leverage     ?? 10),
        cfgSlPct:    Number(cfg?.stop_loss_pct ?? 5),
      }).catch(e => console.error("[positions/DELETE] snapshot save error:", e))
    }

    return NextResponse.json({ ok: true, closed: "all", count: activePos?.length ?? 0 })
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

/** PATCH /api/auto-signal/positions — 진입가 수정 (master 전용, 미청산 포지션만) */
export async function PATCH(req: Request) {
  const role = getCallerRole(req)
  if (!MASTER_ROLES.includes(role ?? "")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const { id, entry_price, direction } = body
  if (!id || (entry_price === undefined && !["long", "short"].includes(direction))) {
    return NextResponse.json({ error: "id and entry_price or direction required" }, { status: 400 })
  }
  const update: Record<string, unknown> = {}
  if (entry_price !== undefined) {
    const price = Number(entry_price)
    if (!Number.isFinite(price) || price <= 0) return NextResponse.json({ error: "invalid entry_price" }, { status: 400 })
    update.entry_price = price
  }
  if (["long", "short"].includes(direction)) {
    // 참고: auto_signal_positions 테이블에는 current_price/roi/pnl 컬럼이 없음 —
    // ROI/PNL은 클라이언트가 실시간 가격(pos.cur)으로 매 렌더마다 재계산하므로
    // 서버는 direction(및 entry_price)만 갱신하고 존재 여부만 확인한다.
    const { data: pos, error: fetchErr } = await adminSupabase
      .from("auto_signal_positions")
      .select("id")
      .eq("id", id)
      .eq("is_closed", false)
      .maybeSingle()
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
    if (!pos) return NextResponse.json({ error: "position not found or already closed" }, { status: 404 })
    update.direction = direction
  }
  const { data, error } = await adminSupabase.from("auto_signal_positions").update(update).eq("id", id).eq("is_closed", false).select("*").maybeSingle()
  if (error) {
    // 동일 심볼/방향/날짜 조합의 포지션이 이미 존재하는 경우 (uq_asp_symbol_direction_date)
    if (error.code === "23505") {
      return NextResponse.json({ error: "같은 심볼·방향의 포지션이 오늘 이미 존재하여 전환할 수 없습니다." }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: "position not found or already closed" }, { status: 404 })
  return NextResponse.json(data)
}
