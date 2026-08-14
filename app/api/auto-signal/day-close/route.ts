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
import { saveDailySnapshot } from "@/lib/save-daily-snapshot"
import { getDayCloseMap } from "@/lib/binance-klines"
import { NextResponse } from "next/server"

const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? "tasko-internal"
const CRON_SECRET     = process.env.CRON_SECRET ?? ""
const BINANCE_FUTURES_BASE = "https://fapi.binance.com"
// 배포 리전에서 fapi.binance.com이 451(Restricted Location)로 막히는 경우가 있어
// 지역 차단이 없는 spot 미러를 1차로 시도한다 (lib/binance-klines.ts와 동일한 전략).
const BINANCE_VISION_BASE  = "https://data-api.binance.vision"

/**
 * Binance 현재가 일괄 조회 (spot 미러 ticker → futures ticker → 개별 fallback → 최근 klines fallback)
 * ⚠️ 이건 "지금 이 순간"의 라이브 가격이라 자정 크론 실행 시점에 Binance 쪽 순간 오류/지연이 있으면
 *    실패하기 쉽다. 그래서 이 함수는 보조 fallback 용도로만 쓰고, 1차 소스는 getDayCloseMap
 *    (KST 23:59~24:00 확정 1분봉, 사후 조회라 항상 존재함)을 사용한다.
 */
async function getBinancePrices(symbols: string[]): Promise<Map<string, number>> {
  const map     = new Map<string, number>()
  const needed  = new Set(symbols.map(s => s.replace(/\.P$/, "").toUpperCase()))

  // 1차: spot 미러 전체 ticker 한 번에 (지역 차단 없음, 대부분의 심볼 커버)
  try {
    const res = await fetch(`${BINANCE_VISION_BASE}/api/v3/ticker/price`, { cache: "no-store" })
    if (res.ok) {
      const data: { symbol: string; price: string }[] = await res.json()
      for (const row of data) {
        if (needed.has(row.symbol)) map.set(row.symbol, parseFloat(row.price))
      }
    }
  } catch { /* fallback으로 이어짐 */ }

  // 2차: futures 전체 ticker (선물 전용 심볼 등 미러에 없는 것들)
  const afterVision = [...needed].filter(s => !map.has(s))
  if (afterVision.length > 0) {
    try {
      const res = await fetch(`${BINANCE_FUTURES_BASE}/fapi/v1/ticker/price`, { cache: "no-store" })
      if (res.ok) {
        const data: { symbol: string; price: string }[] = await res.json()
        for (const row of data) {
          if (needed.has(row.symbol) && !map.has(row.symbol)) map.set(row.symbol, parseFloat(row.price))
        }
      }
    } catch { /* fallback으로 이어짐 */ }
  }

  // 3차: 그래도 누락 → 개별 심볼 조회 (spot 미러 → futures 순)
  const missing = [...needed].filter(s => !map.has(s))
  if (missing.length > 0) {
    await Promise.all(missing.map(async sym => {
      for (const base of [
        { url: `${BINANCE_VISION_BASE}/api/v3/ticker/price?symbol=${sym}` },
        { url: `${BINANCE_FUTURES_BASE}/fapi/v1/ticker/price?symbol=${sym}` },
      ]) {
        try {
          const res = await fetch(base.url, { cache: "no-store" })
          if (res.ok) {
            const d: { price: string } = await res.json()
            if (d.price) { map.set(sym, parseFloat(d.price)); return }
          }
        } catch { /* 다음 소스로 계속 */ }
      }
    }))
  }

  // 4차: 개별 조회도 실패한 심볼 → 최근 1분봉 klines로 fallback (spot 미러 → futures 순)
  const stillMissing = [...needed].filter(s => !map.has(s))
  if (stillMissing.length > 0) {
    await Promise.all(stillMissing.map(async sym => {
      for (const url of [
        `${BINANCE_VISION_BASE}/api/v3/klines?symbol=${sym}&interval=1m&limit=1`,
        `${BINANCE_FUTURES_BASE}/fapi/v1/klines?symbol=${sym}&interval=1m&limit=1`,
      ]) {
        try {
          const res = await fetch(url, { cache: "no-store" })
          if (res.ok) {
            const d: [number, string, string, string, string][] = await res.json()
            if (d?.[0]?.[4]) { map.set(sym, parseFloat(d[0][4])); return } // index 4 = close
          }
        } catch { /* 다음 소스로 계속 */ }
      }
    }))
  }

  return map
}

export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") ?? ""
  const bearer     = authHeader.replace("Bearer ", "")
  const xInternal  = req.headers.get("x-internal-secret") ?? ""

  // Vercel Cron: Authorization: Bearer <CRON_SECRET>
  // 수동 호출: x-internal-secret 헤더 또는 Bearer tasko-internal
  const validCron     = CRON_SECRET && bearer === CRON_SECRET
  const validInternal = bearer === INTERNAL_SECRET || xInternal === INTERNAL_SECRET
  // CRON_SECRET 미설정 시에는 내부 시크릿만으로도 허용 (개발 환경)
  const validNoCron   = !CRON_SECRET && (bearer === INTERNAL_SECRET || xInternal === INTERNAL_SECRET)

  if (!validCron && !validInternal && !validNoCron) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  // ?date=YYYY-MM-DD 파라미터로 소급 실행 가능 (관리자 전용)
  const url       = new URL(req.url)
  const dateParam = url.searchParams.get("date")
  let dateLabel: string
  if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    dateLabel = dateParam
  } else {
    // KST 어제 날짜 (자정 호출 기준 — 방금 끝난 날)
    const kstNow  = new Date(Date.now() + 9 * 60 * 60 * 1000)
    const kstYest = new Date(kstNow)
    kstYest.setDate(kstYest.getDate() - 1)
    dateLabel = kstYest.toISOString().slice(0, 10)
  }

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

  // Binance 종가 조회
  // 1차: KST 23:59~24:00 확정 1분봉 종가 (사후 조회 — 자정이 지난 뒤라 항상 존재, 실패 확률 매우 낮음)
  // 2차: 그래도 누락된 심볼만 라이브 ticker/klines fallback으로 보강
  const symbols      = positions.map((p: { symbol: string }) => p.symbol)
  const dayCloseMap  = await getDayCloseMap(symbols, dateLabel)
  const missingSyms  = symbols
    .map((s: string) => s.replace(/\.P$/, "").toUpperCase())
    .filter((s: string) => !dayCloseMap.has(s))

  const priceMap = new Map<string, number>(dayCloseMap)
  if (missingSyms.length > 0) {
    const livePriceMap = await getBinancePrices(missingSyms)
    for (const [sym, price] of livePriceMap) {
      if (!priceMap.has(sym)) priceMap.set(sym, price)
    }
    const stillMissing = missingSyms.filter((s: string) => !priceMap.has(s))
    if (stillMissing.length > 0) {
      console.error("[day-close] 종가 조회 실패 심볼 (1차 klines + 2차 live 모두 실패):", stillMissing, "date:", dateLabel)
    }
  }

  const now = new Date().toISOString()

  // 설정에서 stop_loss_pct, size_usd, leverage 조회
  const { data: cfg } = await adminSupabase
    .from("auto_signal_settings")
    .select("seed_capital, stop_loss_pct, size_usd, leverage")
    .eq("id", 1)
    .single()

  const cfgStopLossPct = Number(cfg?.stop_loss_pct ?? 5)
  const cfgSizeUsd     = Number(cfg?.size_usd ?? 10)
  const cfgLeverage    = Number(cfg?.leverage ?? 10)

  // ── 확정 잔고 기준값: rebalance 테이블의 가장 최근 est_value ──────
  // day-close는 설정의 seed_capital이 아닌 직전 반영 잔고에서 누적해야 함
  const { data: prevRebalance } = await adminSupabase
    .from("auto_signal_rebalance")
    .select("est_value, date_label")
    .lt("date_label", dateLabel)          // 오늘 이전 기록만
    .order("date_label", { ascending: false })
    .limit(1)
    .single()

  // 직전 반영 기록이 없으면 설정의 seed_capital을 초기값으로 사용
  const baseBalance = prevRebalance ? Number(prevRebalance.est_value) : Number(cfg?.seed_capital ?? 640)

  // 각 포지션별 closed_roi, closed_price, final_pnl, final_roi 계산 후 업데이트
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
    const lev      = Number(pos.leverage ?? cfgLeverage)
    const size     = Number(pos.size_usd ?? cfgSizeUsd)

    let closedRoi: number | null = null
    let finalPnl:  number | null = null
    if (curPrice && entry > 0) {
      const delta = pos.direction === "long"
        ? (curPrice - entry) / entry
        : (entry - curPrice) / entry
      closedRoi = delta * lev * 100
      finalPnl  = size * (closedRoi / 100)
    }
    // 수수료: 진입 0.03% + 청산 0.03% = 0.06% × size_usd
    const fee = size * 0.0006

    return adminSupabase
      .from("auto_signal_positions")
      .update({
        is_closed:    true,
        closed_at:    now,
        close_reason: "day_close",
        closed_price: curPrice,
        closed_roi:   closedRoi,
        final_roi:    closedRoi,
        final_pnl:    finalPnl,
        fee:          fee,
      })
      .eq("id", pos.id)
  })

  await Promise.all(updates)

  // ── 리밸런싱 스냅샷 저장 ───────────────────────────────────────
  // 중복 방지: 당일 기록이 이미 있으면 건너뜀 (수동 반영이 먼저 된 경우)
  const { data: existing } = await adminSupabase
    .from("auto_signal_rebalance")
    .select("id")
    .eq("date_label", dateLabel)
    .limit(1)
    .single()

  if (existing) {
    // 이미 수동으로 반영된 날 — 포지션 마감만 하고 재정산하지 않음
    return NextResponse.json({
      ok:           true,
      date_label:   dateLabel,
      closed_count: positions.length,
      note:         "positions closed; rebalance already exists (manual)",
    })
  }

  // 당일 SL 청산 PNL + 수수료
  const { data: slPositions } = await adminSupabase
    .from("auto_signal_positions")
    .select("leverage, size_usd, final_pnl, fee")
    .eq("date_label", dateLabel)
    .eq("close_reason", "stop_loss")
    .eq("is_closed", true)

  const slPnl = (slPositions ?? []).reduce((s: number, p: { leverage: number; size_usd: number; final_pnl: number | null; fee: number | null }) => {
    if (p.final_pnl != null) return s + Number(p.final_pnl)
    const size = Number(p.size_usd ?? cfgSizeUsd)
    return s - (size * 0.5)   // 45% ROI 청산 = 50% 마진 손실
  }, 0)

  // day_close 포지션들의 PNL + 수수료
  const { data: dayClosePos } = await adminSupabase
    .from("auto_signal_positions")
    .select("size_usd, closed_roi, final_pnl, fee")
    .eq("date_label", dateLabel)
    .eq("close_reason", "day_close")
    .eq("is_closed", true)

  const dayClosePnl = (dayClosePos ?? []).reduce((s: number, p: { size_usd: number; closed_roi: number | null; final_pnl: number | null; fee: number | null }) => {
    if (p.final_pnl != null) return s + Number(p.final_pnl)
    if (p.closed_roi == null) return s
    return s + Number(p.size_usd ?? cfgSizeUsd) * (Number(p.closed_roi) / 100)
  }, 0)

  // 당일 전체 수수료 (모든 청산 포지션)
  const allClosed = [...(slPositions ?? []), ...(dayClosePos ?? [])]
  const dailyFee  = allClosed.reduce((s: number, p: { size_usd: number; fee: number | null }) => {
    if (p.fee != null) return s + Number(p.fee)
    return s + Number(p.size_usd ?? cfgSizeUsd) * 0.0006
  }, 0)

  const dailyPnl = slPnl + dayClosePnl
  // 확정 잔고 = 직전 반영 잔고 + 오늘 PNL (누적 복리 구조)
  const estValue = baseBalance + dailyPnl

  await adminSupabase
    .from("auto_signal_rebalance")
    .insert({
      date_label:    dateLabel,
      seed_capital:  baseBalance,
      est_value:     estValue,
      daily_pnl:     dailyPnl,
      daily_fee:     dailyFee,
      note:          "day_close (auto)",
      rebalanced_at: now,
    })

  // 다음 날 시드를 EST. VALUE로 업데이트 (설정 seed_capital 갱신)
  await adminSupabase
    .from("auto_signal_settings")
    .update({ seed_capital: estValue })
    .eq("id", 1)

  // 일일 스냅샷 저장 — 과거 날짜 클릭 시 이 값으로 표시
  await saveDailySnapshot({
    dateLabel:   dateLabel,
    closeType:   "day_close",
    margin:      baseBalance,
    cfgSizeUsd:  cfgSizeUsd,
    cfgLeverage: cfgLeverage,
    cfgSlPct:    cfgStopLossPct,
  }).catch(e => console.error("[day-close] snapshot save error:", e))

  return NextResponse.json({
    ok:           true,
    date_label:   dateLabel,
    closed_count: positions.length,
    daily_pnl:    dailyPnl,
    est_value:    estValue,
  })
}
