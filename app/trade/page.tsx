"use client"

import React, { useEffect, useRef, useState, useCallback } from "react"
import { supabaseBrowser } from "@/lib/supabase-browser"
import { usePriceWorker } from "@/hooks/use-price-worker"
import LivePricesTab, { liveCache } from "@/components/trade/live-prices-tab"
import SymbolChart from "@/components/trade/symbol-chart"
import { BarChart2, Wallet, X, TrendingUp, TrendingDown, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Search, Bot, LineChart, Clock, ArrowUpDown, Bell, ListChecks, BookOpen } from "lucide-react"

// KST 기준 오늘 날짜를 Date 객체로 반환하는 헬퍼
// new Date(Date.now() + 9h) 는 UTC Date 객체이므로
// .getDate()/.getMonth() 등이 UTC 기준으로 읽혀 하루 틀림
// 올바른 방법: Intl 으로 KST 날짜 문자열 파싱 후 로컬 Date 생성
function kstToday(): Date {
  const kstStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }) // "2026-06-07"
  const [y, m, d] = kstStr.split("-").map(Number)
  return new Date(y, m - 1, d) // 로컬 자정 Date — .getDate()/.getMonth() 안전
}
// KST 기준 오늘 날짜 문자열 "YYYY-MM-DD"
function kstTodayStr(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
}

const GOLD       = "#d4af37"
const UP_COLOR   = "#22c55e"
const DOWN_COLOR = "#ef4444"
const PANEL_BG   = "rgba(5,13,10,0.97)"
const BORDER     = "rgba(212,175,55,0.18)"

type Direction = "long" | "short"

interface Position {
  id:                 string
  symbol:             string
  direction:          Direction
  entry_price:        number
  margin:             number
  leverage:           number
  opened_at:          string
  current_price:      number
  unrealized_pnl:     number
  unrealized_pnl_pct: number
  liquidated:         boolean
  entryPrice:         number
  amount:             number
  pnl:                number
  pnlPct:             number
  openedAt:           number
}

interface TradeLog {
  id:         string
  symbol:     string
  direction:  Direction
  pnl:        number
  closedAt:   number
  entryPrice: number
  exitPrice:  number
}

function fmt(n: number): string {
  if (!n || n === 0)  return "0"
  if (n < 0.00001)    return n.toFixed(8)
  if (n < 0.0001)     return n.toFixed(7)
  if (n < 0.001)      return n.toFixed(6)
  if (n < 0.01)       return n.toFixed(5)
  if (n < 1)          return n.toFixed(5)
  if (n < 10)         return n.toFixed(3)
  if (n < 1000)       return n.toFixed(2)
  return n.toLocaleString("en-US", { maximumFractionDigits: 0 })
}

function getToken(): string | null {
  if (typeof window === "undefined") return null
  try { return localStorage.getItem("app_token") } catch { return null }
}

function elapsedStr(ms: number): string {
  const s = Math.floor((Date.now() - ms) / 1000)
  if (s < 60)   return `${s}초`
  if (s < 3600) return `${Math.floor(s / 60)}분`
  return `${Math.floor(s / 3600)}시간`
}

// ─── 날짜 스트립 ─────────────────────────────────────────────────────

/** 깜빡이는 초록 점만 */
function PulseDot() {
  return (
    <span className="relative flex h-1.5 w-1.5 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-green-500" />
    </span>
  )
}

/** 현재 시간 텍스트만 */
function ClockTime() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const h    = now ? now.getHours() : 0
  const ampm = h < 12 ? "오전" : "오후"
  const h12  = h % 12 === 0 ? 12 : h % 12
  const mm   = now ? String(now.getMinutes()).padStart(2, "0") : "00"
  const ss   = now ? String(now.getSeconds()).padStart(2, "0") : "00"
  return (
    <span suppressHydrationWarning style={{
      fontSize: 9,
      fontWeight: 500,
      color: "rgba(255,255,255,0.45)",
      fontVariantNumeric: "tabular-nums",
      letterSpacing: "0.03em",
    }}>
      {ampm} {String(h12).padStart(2, "0")}:{mm}:{ss}
    </span>
  )
}

/** 점 + 시간 묶음 (하위 호환) */
function LiveClock() {
  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <PulseDot />
      <ClockTime />
    </div>
  )
}

function DateStrip({ selectedDate, onSelect }: { selectedDate: Date; onSelect: (d: Date) => void }) {
  // KST 기준 오늘 날짜
  const today = kstToday()
  const scrollRef = useRef<HTMLDivElement>(null)

  // 오늘 기준 29일 전부터 오늘까지 (30일)
  const DAYS_BACK = 29
  const days: Date[] = []
  for (let i = DAYS_BACK; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    days.push(d)
  }

  const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"]
  const isSame = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  // 마운트 시 또는 selectedDate가 오늘로 변경될 때 맨 오른쪽으로 스크롤
  const isSelectedToday = isSame(selectedDate, today)
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const scroll = () => { el.scrollLeft = el.scrollWidth }
    scroll()
    const t = setTimeout(scroll, 50)
    return () => clearTimeout(t)
  }, [isSelectedToday])

  return (
    <div style={{ borderBottom: `1px solid rgba(255,255,255,0.06)` }}>
      <div
        ref={scrollRef}
        style={{ display: "flex", overflowX: "auto", scrollbarWidth: "none" }}
      >
        {days.map((d, i) => {
          const isSun   = d.getDay() === 0
          const isSat   = d.getDay() === 6
          const isToday = isSame(d, today)
          const isSel   = isSame(d, selectedDate)

          const dayColor = isSat ? "#4a90d9" : isSun ? "#e05555" : "rgba(255,255,255,0.35)"
          const numColor = isToday ? "#fff" : isSel ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.75)"

          return (
            <button
              key={i}
              onClick={() => onSelect(d)}
              style={{
                flexShrink: 0,
                width: 48,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                padding: "10px 0",
                gap: 6,
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              {/* 요일 */}
              <span style={{ fontSize: 9, fontWeight: 500, color: dayColor, letterSpacing: "0.02em" }}>
                {DAY_KO[d.getDay()]}
              </span>
              {/* 날짜 숫자 */}
              <span style={{
                width: 30, height: 30,
                display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: "50%",
                fontSize: 13, fontWeight: 700,
                color: numColor,
                border: isToday
                  ? "2px solid #22c55e"
                  : isSel
                  ? "2px solid rgba(212,175,55,0.6)"
                  : "2px solid transparent",
                background: isSel && !isToday ? "rgba(212,175,55,0.1)" : "transparent",
              }}>
                {d.getDate()}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── 공통 투자 폼 ────────────────────────────────────────────────────
function TradeForm({
  symbol, price, balance, onOpen, isOpening,
}: {
  symbol:    string
  price:     number | null
  balance:   number | null
  onOpen:    (dir: Direction, amount: number, leverage: number) => void
  isOpening: boolean
}) {
  const [amountPct, setAmountPct] = useState(10)
  const [leverage,  setLeverage]  = useState(10)
  const maxBal      = balance ?? 0
  const amount      = Math.floor(maxBal * amountPct / 100)
  const posSize     = amount * leverage
  const liqPct      = leverage > 1 ? (100 / leverage).toFixed(1) : null
  const profit1pct  = Math.floor(posSize * 0.01)

  return (
    <div className="space-y-4">
      {/* 투자 금액 */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-xs" style={{ color: "rgba(212,175,55,0.5)" }}>투자 금액</span>
          <div className="flex items-center gap-2">
            <span className="text-xs tabular-nums" style={{ color: "rgba(255,255,255,0.35)" }}>
              {amount > 0 ? `₩${amount.toLocaleString("ko-KR")}` : "—"}
            </span>
            <span className="text-sm font-bold" style={{ color: GOLD }}>{amountPct}%</span>
          </div>
        </div>
        <input type="range" min={1} max={100} value={amountPct}
          onChange={e => setAmountPct(Number(e.target.value))}
          className="w-full h-1 rounded-full appearance-none cursor-pointer" style={{ accentColor: GOLD }} />
        <div className="flex justify-between gap-1">
          {[10, 25, 50, 75, 100].map(p => (
            <button key={p} onClick={() => setAmountPct(p)}
              className="flex-1 py-1.5 rounded-full text-xs font-semibold border transition-colors"
              style={{
                background:  amountPct === p ? "rgba(212,175,55,0.15)" : "transparent",
                borderColor: amountPct === p ? GOLD : "rgba(255,255,255,0.1)",
                color:       amountPct === p ? GOLD : "rgba(255,255,255,0.4)",
              }}>{p}%</button>
          ))}
        </div>
      </div>

      {/* 레버리지 */}
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-xs" style={{ color: "rgba(212,175,55,0.5)" }}>레버리지</span>
          <span className="text-sm font-bold" style={{ color: GOLD }}>{leverage}x</span>
        </div>
        <input type="range" min={1} max={100} value={leverage}
          onChange={e => setLeverage(Number(e.target.value))}
          className="w-full h-1 rounded-full appearance-none cursor-pointer" style={{ accentColor: GOLD }} />
        <div className="flex justify-between gap-1">
          {[1, 5, 10, 25, 50, 100].map(lv => (
            <button key={lv} onClick={() => setLeverage(lv)}
              className="flex-1 py-1.5 rounded-full text-xs font-semibold border transition-colors"
              style={{
                background:  leverage === lv ? "rgba(212,175,55,0.15)" : "transparent",
                borderColor: leverage === lv ? GOLD : "rgba(255,255,255,0.1)",
                color:       leverage === lv ? GOLD : "rgba(255,255,255,0.4)",
              }}>{lv}x</button>
          ))}
        </div>
      </div>

      {/* 요약 */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-3 py-3 rounded-xl text-xs"
        style={{ background: "rgba(212,175,55,0.04)", border: `1px solid rgba(212,175,55,0.1)` }}>
        <div className="flex justify-between">
          <span style={{ color: "rgba(212,175,55,0.4)" }}>투자금</span>
          <span className="font-bold tabular-nums" style={{ color: "rgba(212,175,55,0.85)" }}>
            {amount > 0 ? `₩${amount.toLocaleString("ko-KR")}` : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "rgba(212,175,55,0.4)" }}>포지션 크기</span>
          <span className="font-bold tabular-nums" style={{ color: "rgba(212,175,55,0.85)" }}>
            {posSize > 0 ? `₩${posSize.toLocaleString("ko-KR")}` : "—"}
          </span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "rgba(212,175,55,0.4)" }}>롱 청산 기준</span>
          <span className="font-bold" style={{ color: DOWN_COLOR }}>
            {liqPct ? `-${liqPct}%` : "없음"}
          </span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: "rgba(212,175,55,0.4)" }}>1% 수익 예상</span>
          <span className="font-bold tabular-nums" style={{ color: UP_COLOR }}>
            {profit1pct > 0 ? `₩${profit1pct.toLocaleString("ko-KR")}` : "—"}
          </span>
        </div>
      </div>

      {/* 주문 버튼 */}
      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => onOpen("long", amount, leverage)}
          disabled={isOpening || amount <= 0}
          className="py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
          style={{ background: "linear-gradient(135deg,#16a34a,#22c55e)", color: "#fff" }}>
          <TrendingUp className="w-4 h-4" />
          {isOpening ? "처리중..." : "롱 진입"}
        </button>
        <button
          onClick={() => onOpen("short", amount, leverage)}
          disabled={isOpening || amount <= 0}
          className="py-4 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 transition-all disabled:opacity-40"
          style={{ background: "linear-gradient(135deg,#dc2626,#ef4444)", color: "#fff" }}>
          <TrendingDown className="w-4 h-4" />
          {isOpening ? "처리중..." : "숏 진입"}
        </button>
      </div>
    </div>
  )
}

// ─── 모바일 주문 다����������� ──────────────────────────────────────────
function TradeDialog({
  symbol, price, balance, onClose, onOpen, isOpening,
}: {
  symbol:    string
  price:     number | null
  balance:   number | null
  onClose:   () => void
  onOpen:    (dir: Direction, amount: number, leverage: number) => void
  isOpening: boolean
}) {
  const base = symbol.replace("USDT", "")

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", fn)
    return () => window.removeEventListener("keydown", fn)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full sm:w-[440px] rounded-t-2xl sm:rounded-2xl"
        style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, maxHeight: "92dvh", overflowY: "auto" }}>
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: BORDER }}>
          <div className="flex items-center gap-3">
            <div style={{
              width: 38, height: 38, borderRadius: "50%",
              background: "radial-gradient(circle at 35% 35%,#627EEA,#3a4fc7)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 900, color: "#fff",
            }}>{base.slice(0, 3)}</div>
            <div>
              <div className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>{base}/USDT</div>
              <div className="text-xs tabular-nums" style={{ color: GOLD }}>
                {price && price > 0 ? `$${fmt(price)}` : "—"}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ color: "rgba(255,255,255,0.4)" }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* 잔고 */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg"
            style={{ background: "rgba(212,175,55,0.06)", border: `1px solid ${BORDER}` }}>
            <div className="flex items-center gap-2">
              <Wallet className="w-3.5 h-3.5" style={{ color: GOLD }} />
              <span className="text-xs" style={{ color: "rgba(212,175,55,0.6)" }}>사용 가능 ��고</span>
            </div>
            <span className="text-sm font-bold tabular-nums" style={{ color: GOLD }}>
              {balance === null ? "—" : `₩${(balance ?? 0).toLocaleString("ko-KR")}`}
            </span>
          </div>

          <TradeForm
            symbol={symbol}
            price={price}
            balance={balance}
            onOpen={onOpen}
            isOpening={isOpening}
          />
        </div>
      </div>
    </div>
  )
}

// ─── PC 포지션 카드 ──────────────────────────────────────────────────
function PcPositionCard({ pos, onClose, isClosing }: {
  pos:       Position
  onClose:   (id: string) => void
  isClosing: boolean
}) {
  const isLong   = pos.direction === "long"
  const pnlColor = pos.pnlPct >= 0 ? UP_COLOR : DOWN_COLOR
  const liqPrice = isLong
    ? pos.entryPrice * (1 - 1 / pos.leverage)
    : pos.entryPrice * (1 + 1 / pos.leverage)

  return (
    <div style={{ padding: "12px 16px", borderBottom: `1px solid rgba(212,175,55,0.06)` }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span style={{
            fontSize: 9, fontWeight: 800, padding: "2px 6px", borderRadius: 4,
            background: isLong ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
            color: isLong ? UP_COLOR : DOWN_COLOR,
          }}>{isLong ? "LONG" : "SHORT"}</span>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", fontWeight: 600 }}>
            {pos.symbol.replace("USDT", "")} / USDT
          </span>
          <span style={{ fontSize: 9, color: GOLD, fontWeight: 700 }}>{pos.leverage}x</span>
        </div>
        <div className="text-right">
          <div className="text-sm font-extrabold tabular-nums" style={{ color: pnlColor }}>
            {pos.pnl >= 0 ? "+" : ""}₩{Math.floor(pos.pnl).toLocaleString("ko-KR")}
          </div>
          <div style={{ fontSize: 10, color: pnlColor, opacity: 0.8 }} className="tabular-nums">
            {pos.pnlPct >= 0 ? "+" : ""}{pos.pnlPct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* 가격 3열 */}
      <div className="grid grid-cols-3 gap-2 mb-2" style={{ fontSize: 10 }}>
        <div>
          <div style={{ color: "rgba(255,255,255,0.3)" }}>진입가</div>
          <div style={{ color: "rgba(255,255,255,0.7)" }} className="tabular-nums">${fmt(pos.entryPrice)}</div>
        </div>
        <div>
          <div style={{ color: "rgba(255,255,255,0.3)" }}>현재가</div>
          <div style={{ color: "rgba(255,255,255,0.85)" }} className="tabular-nums">${fmt(pos.current_price ?? pos.entryPrice)}</div>
        </div>
        <div>
          <div style={{ color: "rgba(255,255,255,0.3)" }}>청산가</div>
          <div style={{ color: DOWN_COLOR }} className="tabular-nums">${fmt(liqPrice)}</div>
        </div>
      </div>

      {/* 통계 4열 */}
      <div className="grid grid-cols-4 gap-1.5 mb-3 px-3 py-2 rounded-lg" style={{ background: "rgba(0,0,0,0.25)", fontSize: 10 }}>
        <div>
          <div style={{ color: "rgba(255,255,255,0.25)" }}>투자금</div>
          <div style={{ color: "rgba(255,255,255,0.65)" }} className="tabular-nums">₩{Math.floor(pos.amount).toLocaleString("ko-KR")}</div>
        </div>
        <div>
          <div style={{ color: "rgba(255,255,255,0.25)" }}>포지션 크기</div>
          <div style={{ color: GOLD, opacity: 0.85 }} className="tabular-nums">₩{Math.floor(pos.amount * pos.leverage).toLocaleString("ko-KR")}</div>
        </div>
        <div>
          <div style={{ color: "rgba(255,255,255,0.25)" }}>{isLong ? "롱" : "숏"} 청산 기준</div>
          <div style={{ color: DOWN_COLOR }} className="tabular-nums">
            {isLong ? `-${(100 / pos.leverage).toFixed(1)}%` : `+${(100 / pos.leverage).toFixed(1)}%`}
          </div>
        </div>
        <div>
          <div style={{ color: "rgba(255,255,255,0.25)" }}>1% 수익 예상</div>
          <div style={{ color: UP_COLOR }} className="tabular-nums">₩{Math.floor(pos.amount * pos.leverage * 0.01).toLocaleString("ko-KR")}</div>
        </div>
      </div>

      <button
        onClick={() => onClose(pos.id)}
        disabled={isClosing}
        className="w-full rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.5)", padding: "8px 0", minHeight: 32 }}>
        {isClosing ? "청산 처리중..." : "포�����션 청산"}
      </button>
    </div>
  )
}

// ���── 메인 페이지 ────────────────────────────────────────────────────
// ─── 청산 기록 패널 ──────────────────────────────────────────────────
type ClosedPos = {
  id: string
  symbol: string
  direction: "long" | "short"
  entry_price: string | number
  size_usd: number
  leverage: number
  signal_type: string
  signal_time: string
  date_label: string
  is_closed: boolean
  closed_at: string | null
  close_reason: string | null
  closed_roi: number | null
  closed_price: number | null
  // positions API 과거 날짜 응답에서 추가되는 필드
  final_roi: number | null
  final_pnl: number | null
}

function OtherPositionsGroup({
  positions,
  renderCard,
}: {
  positions: ClosedPos[]
  renderCard: (pos: ClosedPos) => React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const reasonLabel: Record<string, string> = { manual: "수동", stop_loss: "스탑로스", all: "전체청산" }
  // 대표 reason 레이블 (중복 제거)
  const reasons = [...new Set(positions.map(p => reasonLabel[p.close_reason ?? ""] ?? p.close_reason ?? "-"))].join(" · ")

  return (
    <div>
      {/* 토글 헤더 */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between"
        style={{
          padding: "9px 14px",
          borderBottom: `1px solid rgba(212,175,55,0.06)`,
          background: "rgba(255,255,255,0.02)",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.4)" }}>
          {reasons} {positions.length}건
        </span>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
          {open ? "접기 ▲" : "펼치기 ▼"}
        </span>
      </button>
      {open && positions.map(renderCard)}
    </div>
  )
}

function ClosedPositionsPanel({ refreshKey = 0, tradeMode, selectedDate: propDate, onSelectDate, confirmedMargin = 0 }: {
  refreshKey?: number
  tradeMode: string
  selectedDate?: Date
  onSelectDate?: (d: Date) => void
  confirmedMargin?: number   // 자동매매와 동일한 확정 잔고 — MARGIN 기준값
}) {
  const [positions,    setPositions]   = useState<ClosedPos[]>([])
  const [loading,      setLoading]     = useState(true)
  const [stopLossPct,  setStopLossPct] = useState<number | null>(null)
  const [sizeUsdCfg,   setSizeUsdCfg]  = useState<number>(10)
  const [innerDate,    setInnerDate]   = useState<Date>(() => kstToday())
  const [dateEstValue, setDateEstValue] = useState<number | null>(null)  // 해당 날짜 rebalance est_value
  const [, setTick] = useState(0)

  type DailySnapshot = {
    date_label: string; close_type: string; snapped_at: string
    margin: number; est_value: number; total_pnl: number; total_roi: number
    sl_pnl: number; sl_count: number
    position_count: number; profit_count: number; loss_count: number; liq_count: number
  }
  const [snapshot, setSnapshot] = useState<DailySnapshot | null>(null)

  // 부모에서 날짜를 제어하면 부모 날짜 우선 사용
  const selectedDate = propDate ?? innerDate
  const setSelectedDate = (d: Date) => { setInnerDate(d); onSelectDate?.(d) }

  const dateStr  = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,"0")}-${String(selectedDate.getDate()).padStart(2,"0")}`
  const todayStr = kstTodayStr()
  const isToday  = dateStr === todayStr

  useEffect(() => {
    setLoading(true)
    // closed-positions API: closed_at KST 기준으로 필터 (date_label 아님)
    // SL 청산 포지션은 date_label(생성일)과 청산일이 다를 수 있으므로
    // closed_at 날짜로 조회해야 정확함
    fetch(`/api/auto-signal/closed-positions?date=${dateStr}&limit=200`)
      .then(r => r.ok ? r.json() : { positions: [] })
      .then(d => setPositions(d.positions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [refreshKey, dateStr])

  // 설정 조회 (SL%, size_usd)
  useEffect(() => {
    fetch("/api/auto-signal/settings")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        if (d.stop_loss_pct != null) setStopLossPct(Number(d.stop_loss_pct))
        if (d.size_usd      != null) setSizeUsdCfg(Number(d.size_usd))
      })
      .catch(() => {})
  }, [])

  // 과거 날짜 선택 시 해당 날짜 rebalance 기록의 est_value fetch
  // — EST. VALUE를 확정된 최종 잔고로 표시하기 위함
  useEffect(() => {
    if (isToday) { setDateEstValue(null); return }
    fetch("/api/auto-signal/rebalance")
      .then(r => r.ok ? r.json() : { records: [] })
      .then(d => {
        const rec = (d.records ?? []).find((r: { date_label: string; est_value: number }) => r.date_label === dateStr)
        setDateEstValue(rec ? Number(rec.est_value) : null)
      })
      .catch(() => setDateEstValue(null))
  }, [dateStr, isToday])

  // 과거 날짜 선택 시 daily_snapshot fetch — 고정 수치 표시용
  useEffect(() => {
    if (isToday) { setSnapshot(null); return }
    fetch(`/api/auto-signal/snapshots?date=${dateStr}`)
      .then(r => r.ok ? r.json() : { snapshot: null })
      .then(d => setSnapshot(d.snapshot ?? null))
      .catch(() => setSnapshot(null))
  }, [dateStr, isToday])

  // 1초 tick — 실시간 % 갱신
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 날짜 스트립 */}
      <DateStrip key={tradeMode} selectedDate={selectedDate} onSelect={setSelectedDate} />
      {/* 요약 카드 */}
      {(() => {
        const cnt = positions.length

        // ── 과거 날짜 + 스냅샷 있으면 고정값으로 표시 ──────────────
        if (!isToday && snapshot) {
          const sp       = snapshot
          const pnlColor = sp.total_pnl >= 0 ? UP_COLOR : DOWN_COLOR
          const roiColor = sp.total_roi >= 0 ? UP_COLOR : DOWN_COLOR
          return (
            <div style={{ padding: "8px 12px", borderBottom: `1px solid rgba(212,175,55,0.1)`, flexShrink: 0 }}>
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <div className="flex items-center gap-1.5">
                  <PulseDot />
                  <span style={{ fontSize: 10, fontWeight: 700, color: GOLD }}>청산 기록 ({sp.position_count}건)</span>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>
                    수익 {sp.profit_count} / 손실 {sp.loss_count} / 청산 {sp.liq_count}
                  </span>
                </div>
                <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", fontStyle: "italic" }}>
                  스냅샷 {sp.close_type === "day_close" ? "(자정 자동)" : "(반영)"}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2" style={{ marginBottom: 6 }}>
                <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>MARGIN</div>
                  <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.9)" }}>
                    ${Number(sp.margin).toFixed(2)}
                  </div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>확정 시작 잔고</div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>EST. VALUE</div>
                  <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: pnlColor }}>
                    ${Number(sp.est_value).toFixed(2)}
                  </div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>
                    MARGIN + PNL {sp.total_pnl >= 0 ? "+" : ""}{Number(sp.total_pnl).toFixed(2)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>TOTAL ROI</div>
                  <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: roiColor }}>
                    {sp.total_roi >= 0 ? "+" : ""}{Number(sp.total_roi).toFixed(2)}%
                  </div>
                </div>
                <div style={{ background: sp.sl_count > 0 ? "rgba(239,68,68,0.05)" : "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>SL CLOSE</div>
                  <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: sp.sl_count === 0 ? "rgba(255,255,255,0.25)" : DOWN_COLOR }}>
                    {sp.sl_count === 0 ? "-" : `$${Number(sp.sl_pnl).toFixed(2)}`}
                  </div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>
                    {sp.sl_count > 0
                      ? `${sp.sl_count}건 × $${Math.abs(Number(sp.sl_pnl) / sp.sl_count).toFixed(2)}`
                      : "청산 없음"}
                  </div>
                </div>
                <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>TOTAL PNL</div>
                  <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: pnlColor }}>
                    {sp.total_pnl >= 0 ? "+" : ""}${Number(sp.total_pnl).toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          )
        }
        // ────────────────────────────────────────────────────���────────

        // ── 오늘 or 스냅샷 없는 날 — 기존 실시간 계산 ────────────────
        // MARGIN = 자동매매와 동일하게 확정 잔고(confirmedMargin) 기준
        // confirmedMargin이 없으면 포지션 수 × size_usd 폴백
        const margin = confirmedMargin > 0 ? confirmedMargin : cnt * sizeUsdCfg
        const perPnl = positions.map(p => {
          const entry  = Number(p.entry_price)
          const symKey = p.symbol.replace(/\.P$/, "").replace(/\//g, "")
          const cur    = liveCache.tickers.get(symKey)?.price ?? 0
          const lev    = Number(p.leverage ?? 10)
          const sz     = Number(p.size_usd ?? sizeUsdCfg)
          let roi: number
          if (isToday && cur > 0 && entry > 0) {
            const delta = p.direction === "long" ? (cur - entry) / entry : (entry - cur) / entry
            roi = delta * lev * 100
          } else if (!isToday && p.final_roi != null) {
            roi = Number(p.final_roi)
          } else if (!isToday && p.closed_roi != null) {
            roi = Number(p.closed_roi)
          } else if (cur > 0 && entry > 0) {
            const delta = p.direction === "long" ? (cur - entry) / entry : (entry - cur) / entry
            roi = delta * lev * 100
          } else {
            roi = 0
          }
          return { roi, pnl: sz * (roi / 100), isSl: p.close_reason === "stop_loss" }
        })
        const slPnl    = perPnl.filter(x => x.isSl).reduce((s, x) => s + x.pnl, 0)
        const slCntAdj = perPnl.filter(x => x.isSl).length
        const totalPnl = perPnl.reduce((s, x) => s + x.pnl, 0)
        const avgRoi   = cnt > 0 ? perPnl.reduce((s, x) => s + x.roi, 0) / cnt : 0
        const estValue = (!isToday && dateEstValue != null)
          ? dateEstValue
          : margin + totalPnl
        const wins     = positions.filter(p =>
          p.close_reason !== "stop_loss" && p.closed_roi != null && Number(p.closed_roi) > 0
        ).length
        return (
          <div style={{ padding: "8px 12px", borderBottom: `1px solid rgba(212,175,55,0.1)`, flexShrink: 0 }}>
            {/* 타이틀 + 승률 */}
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <div className="flex items-center gap-1.5">
                <PulseDot />
                <span style={{ fontSize: 10, fontWeight: 700, color: GOLD }}>청산 기록 ({cnt}건)</span>
                <ClockTime />
              </div>
              {cnt > 0 && (
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                  승률 {wins}/{cnt} ({Math.round(wins / cnt * 100)}%)
                </span>
              )}
            </div>
            {/* MARGIN / EST.VALUE */}
            <div className="grid grid-cols-2 gap-2" style={{ marginBottom: 6 }}>
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>MARGIN</div>
                <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.9)" }}>
                  ${margin.toFixed(2)}
                </div>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>
                  {confirmedMargin > 0
                    ? `확정잔고 기준 (${cnt}건 × $${sizeUsdCfg} = $${(cnt * sizeUsdCfg).toLocaleString()})`
                    : `${cnt}건 × $${sizeUsdCfg}`
                  }
                </div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>EST. VALUE</div>
                <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: totalPnl >= 0 ? UP_COLOR : DOWN_COLOR }}>
                  ${estValue.toFixed(2)}
                </div>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>
                  {(!isToday && dateEstValue != null)
                    ? `확정 잔고 (반영완료)`
                    : `MARGIN + PNL ${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}`
                  }
                </div>
              </div>
            </div>
            {/* TOTAL ROI / SL CLOSE / TOTAL PNL */}
            <div className="grid grid-cols-3 gap-2">
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>TOTAL ROI</div>
                <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: avgRoi >= 0 ? UP_COLOR : DOWN_COLOR }}>
                  {avgRoi >= 0 ? "+" : ""}{avgRoi.toFixed(2)}%
                </div>
              </div>
              <div style={{ background: slCntAdj > 0 ? "rgba(239,68,68,0.05)" : "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>SL CLOSE</div>
                <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: slCntAdj === 0 ? "rgba(255,255,255,0.25)" : DOWN_COLOR }}>
                  {slCntAdj === 0 ? "-" : `$${slPnl.toFixed(2)}`}
                </div>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>
                  {slCntAdj > 0 ? `${slCntAdj}건 × $${Math.abs(slPnl / slCntAdj).toFixed(2)}` : "청산 없음"}
                </div>
              </div>
              <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>TOTAL PNL</div>
                <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: totalPnl >= 0 ? UP_COLOR : DOWN_COLOR }}>
                  {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        )
      })()}
      {/* 목록 */}
      <div style={{ flex: "1 1 0", overflowY: "auto", scrollbarWidth: "none" }}>
      {loading ? (
        <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>불러오는 중...</div>
      ) : positions.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
          {dateStr} 청산 기록이 없습니다.
        </div>
      ) : null}
      {(() => {
        const slPositions    = positions.filter(p => p.close_reason === "stop_loss")
        const otherPositions = positions.filter(p => p.close_reason !== "stop_loss")

        const renderCard = (pos: ClosedPos) => {
          const entry      = Number(pos.entry_price)
          const sym        = pos.symbol.replace(/\.P$/, "").replace(/\//g, "")
          const baseSymbol = pos.symbol.replace(/\.P$/, "").replace("USDT", "")
          const sizeUsd    = Number(pos.size_usd ?? sizeUsdCfg)
          const lev        = Number(pos.leverage ?? 10)
          const closedAt   = pos.closed_at
            ? new Date(pos.closed_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
            : "-"
          const reasonLabel: Record<string, string> = { manual: "수동", stop_loss: "스탑로스", all: "전체청산" }
          const reason = reasonLabel[pos.close_reason ?? ""] ?? pos.close_reason ?? "-"

          const cur     = liveCache.tickers.get(sym)?.price ?? 0
          const liveRoi = cur > 0 && entry > 0
            ? (pos.direction === "long" ? (cur - entry) / entry : (entry - cur) / entry) * lev * 100
            : null
          const roi: number = isToday && liveRoi != null
            ? liveRoi
            : pos.final_roi  != null ? Number(pos.final_roi)
            : pos.closed_roi != null ? Number(pos.closed_roi)
            : liveRoi ?? 0
          const pnl      = sizeUsd * (roi / 100)
          const roiColor = roi >= 0 ? UP_COLOR : DOWN_COLOR
          const isSl     = pos.close_reason === "stop_loss"

          return (
            <div key={pos.id} style={{
              padding: "10px 14px",
              borderBottom: `1px solid rgba(212,175,55,0.04)`,
              background: isSl ? "rgba(239,68,68,0.04)" : undefined,
            }}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span style={{
                    width: 18, height: 18, borderRadius: 4, fontSize: 9, fontWeight: 900,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: pos.direction === "long" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                    color: pos.direction === "long" ? UP_COLOR : DOWN_COLOR,
                  }}>{pos.direction === "long" ? "L" : "S"}</span>
                  <span style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.9)" }}>
                    {baseSymbol}/USDT
                  </span>
                  <span style={{
                    padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                    background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)",
                  }}>{lev}x</span>
                  <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 800, color: roiColor }}>
                    {roi >= 0 ? "+" : ""}{roi.toFixed(2)}%
                  </span>
                  <span style={{
                    padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                    background: isSl ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.06)",
                    color: isSl ? "rgba(239,68,68,0.8)" : "rgba(255,255,255,0.4)",
                  }}>{reason}</span>
                </div>
                <div className="flex flex-col items-end gap-0.5">
                  <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 800, color: roiColor }}>
                    {pnl >= 0 ? "+" : ""}${pnl.toFixed(3)}
                  </span>
                  <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>{closedAt}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-0.5" style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                <span>진입: <span className="tabular-nums" style={{ color: "rgba(255,255,255,0.55)" }}>${fmt(entry)}</span></span>
                {pos.closed_price != null && (
                  <span>청산: <span className="tabular-nums" style={{ color: roiColor }}>${fmt(Number(pos.closed_price))}</span></span>
                )}
                <span style={{ color: "rgba(255,255,255,0.25)" }}>{pos.signal_type}</span>
              </div>
            </div>
          )
        }

        return (
          <>
            {/* 스탑로스: 항상 펼쳐서 표시 */}
            {slPositions.map(renderCard)}

            {/* 나머지(수동/전체청산): 접기 토글 */}
            {otherPositions.length > 0 && (
              <OtherPositionsGroup positions={otherPositions} renderCard={renderCard} />
            )}
          </>
        )
      })()}
      </div>{/* /scroll wrapper */}
    </div>
  )
}

// ─── 매매기록 패널 ─────────────────────────────────────────────────────
type LedgerRecord = {
  id:            number
  date_label:    string
  rebalanced_at: string
  seed_capital:  number
  est_value:     number
  daily_pnl:     number
  note:          string
}

// 반영 버튼 + 수익입력/삭제 모두 허용 username 목록
const CONFIRM_ALLOWED_USERS = ["mirea2131"]
// 반영 버튼만 허용 (수익 입력 폼·삭제 버튼은 숨김)
const CONFIRM_ONLY_USERS = ["mirea21310"]

function LedgerPanel({ tradeMode, userRole, userName, todayAutoPnl = 0, onConfirmedValue }: { tradeMode: string; userRole: string | null; userName?: string | null; todayAutoPnl?: number; onConfirmedValue?: (v: number) => void }) {
  const [records,      setRecords]      = useState<LedgerRecord[]>([])
  const [loading,      setLoading]      = useState(true)
  const [seedCapital,  setSeedCapital]  = useState<number | null>(null)
  const [initialSeedVal,   setInitialSeedVal]   = useState<number | null>(null)
  const [showProfitDist,   setShowProfitDist]   = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date>(() => kstToday())
  const [statTab,      setStatTab]      = useState<"daily" | "weekly" | "monthly">("daily")
  const krwRate = 1420
  const [countdown,    setCountdown]    = useState("")
  // 입력 폼 상태
  const [inputPnl,  setInputPnl]  = useState("")
  const [inputNote, setInputNote] = useState("")
  const [saving,    setSaving]    = useState(false)
  const [saveMsg,   setSaveMsg]   = useState<string | null>(null)

  // 반영 확인 모달
  const [confirmOpen,    setConfirmOpen]    = useState(false)
  const [confirmPnl,     setConfirmPnl]     = useState(0)
  const [confirmPw,      setConfirmPw]      = useState("")
  const [confirmMsg,     setConfirmMsg]     = useState<string | null>(null)
  const [confirming,     setConfirming]     = useState(false)
  const [closedToday,    setClosedToday]    = useState(false)   // 반영 완료 → 금일매매 종료 표시
  const [closedTime,     setClosedTime]     = useState("")      // 반영 완료 시각 (HH:MM:SS)

  const MASTER_ROLES = ["master", "admin"]
  const isConfirmOnly = CONFIRM_ONLY_USERS.includes(userName ?? "")   // 반영만 가능 (수익입력·삭제 불가)
  const isMaster = MASTER_ROLES.includes(userRole ?? "") || CONFIRM_ALLOWED_USERS.includes(userName ?? "") || isConfirmOnly

  const authHeaders = () => {
    const tok = getToken()
    return tok
      ? { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
      : { "Content-Type": "application/json" }
  }

  const dateStr   = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,"0")}-${String(selectedDate.getDate()).padStart(2,"0")}`
  const todayKST  = kstTodayStr()
  const isToday   = dateStr === todayKST

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch("/api/auto-signal/rebalance", { credentials: "include", headers: { Authorization: `Bearer ${getToken() ?? ""}` } }).then(r => r.ok ? r.json() : { records: [] }),
      fetch("/api/auto-signal/settings").then(r => r.ok ? r.json() : null),
    ]).then(([ledger, cfg]) => {
      setRecords(ledger.records ?? [])
      if (cfg?.seed_capital != null) setSeedCapital(Number(cfg.seed_capital))
      if (cfg?.initial_seed != null) setInitialSeedVal(Number(cfg.initial_seed))
      setShowProfitDist(Boolean(cfg?.show_profit_dist))
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])


  // 다음 토요일 자정(일요일 00:00 KST)까지 카운트���운
  useEffect(() => {
    const calc = () => {
      const now = new Date()
      // KST = UTC+9
      const kstNow = new Date(now.getTime() + 9 * 3600_000)
      const day = kstNow.getUTCDay() // 0=일, 6=토
      // 토요일 23:59:59 → 남은 초 = 자정(일요일 00:00)까지
      const daysUntilSat = day === 6 ? 0 : (6 - day)
      const nextSat = new Date(kstNow)
      nextSat.setUTCDate(kstNow.getUTCDate() + daysUntilSat)
      nextSat.setUTCHours(15, 0, 0, 0) // KST 00:00 = UTC 15:00
      // 이미 지난 경우 다음 ���� 토요일로
      if (nextSat.getTime() <= now.getTime()) {
        nextSat.setUTCDate(nextSat.getUTCDate() + 7)
      }
      const diff = Math.max(0, Math.floor((nextSat.getTime() - now.getTime()) / 1000))
      const d = Math.floor(diff / 86400)
      const h = Math.floor((diff % 86400) / 3600)
      const m = Math.floor((diff % 3600) / 60)
      const s = diff % 60
      const pad = (n: number) => String(n).padStart(2, "0")
      setCountdown(d > 0 ? `${d}일 ${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(h)}:${pad(m)}:${pad(s)}`)
    }
    calc()
    const id = setInterval(calc, 1000)
    return () => clearInterval(id)
  }, [])

  // 날짜가 바뀌면 입력창을 해당 날짜 기존 값으로 채움
  useEffect(() => {
    const rec = records.find(r => r.date_label === dateStr)
    setInputPnl(rec ? String(rec.daily_pnl) : "")
    setInputNote(rec?.note ?? "")
    setSaveMsg(null)
  }, [dateStr, records])

  // 전체 누적 (오름차순)
  const sorted      = [...records].sort((a, b) => a.date_label.localeCompare(b.date_label))
  // 초기 시드: 첫 번째 rebalance 기록의 seed_capital (없으면 settings의 seed_capital 폴백)
  const firstSeed   = sorted.length > 0 ? Number(sorted[0].seed_capital) : (seedCapital ?? 0)
  // 마지막 확정 잔고 (저장된 기록 기준)
  const confirmedValue = sorted.length > 0 ? Number(sorted[sorted.length - 1].est_value) : (seedCapital ?? 0)
  // 부모에 확정 잔고 전달 (AutoSignalPanel MARGIN 기준값으로 사용)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { onConfirmedValue?.(confirmedValue) }, [confirmedValue])
  // 오늘 날짜 기록이 아직 없으면 실시간 PNL을 더해서 현재 잔고 표시
  const todayRecordExists = records.some(r => r.date_label === todayKST)
  const liveValue   = (!todayRecordExists && todayAutoPnl !== 0) ? confirmedValue + todayAutoPnl : confirmedValue
  const latestValue = liveValue
  // 수익률 기준: initial_seed가 양수로 설정된 경우 그것을 기준으로, 미설정(null)이거나 0 이하이면 첫 레코드의 seed_capital 사용
  const baseSeed    = (initialSeedVal !== null && initialSeedVal > 0) ? initialSeedVal : firstSeed
  const totalPnl    = latestValue - baseSeed
  const totalRoi    = baseSeed > 0 ? (totalPnl / baseSeed) * 100 : 0

  // 선택 날짜 기존 기록
  const existing = records.find(r => r.date_label === dateStr)

  const handleSave = async () => {
    const pnl = parseFloat(inputPnl)
    if (isNaN(pnl)) { setSaveMsg("수익을 숫자로 입력해주세요."); return }
    setSaving(true); setSaveMsg(null)
    try {
      const res = await fetch("/api/auto-signal/rebalance", {
        method: "POST",
        headers: authHeaders(),
        credentials: "include",
        body: JSON.stringify({ date_label: dateStr, daily_pnl: pnl, note: inputNote }),
      })
      const json = await res.json()
      if (!res.ok) { setSaveMsg(json.error ?? "저��� 실패"); return }
      setSaveMsg("저장 완료")
      load()
    } catch { setSaveMsg("저장 실패") } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("삭제하시겠습니까?")) return
    await fetch(`/api/auto-signal/rebalance?id=${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      credentials: "include",
    })
    load()
  }

  const handleConfirmOpen = (pnl: number) => {
    setConfirmPnl(pnl)
    setConfirmPw("")
    setConfirmMsg(null)
    setConfirmOpen(true)
  }

  const handleConfirmSubmit = async () => {
    if (!confirmPw) { setConfirmMsg("비밀번호를 입력해주세요."); return }
    setConfirming(true); setConfirmMsg(null)
    try {
      // 1. 비밀번호 검증 — 현재 로그인된 계정으로 확인 (하드코딩 제거)
      const loginRes = await fetch("/api/auth/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken() ?? ""}` },
        body: JSON.stringify({ password: confirmPw }),
      })
      if (!loginRes.ok) { setConfirmMsg("비밀번호가 올바르지 않습니다."); setConfirming(false); return }

      const freshTok = getToken() ?? ""

      const kstDate = kstTodayStr()

      // 2. 오늘 매매기록에 PNL 저장
      const saveRes = await fetch("/api/auto-signal/rebalance", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${freshTok}` },
        credentials: "include",
        body: JSON.stringify({ date_label: kstDate, daily_pnl: confirmPnl, note: "자동매매 반영" }),
      })
      if (!saveRes.ok) { setConfirmMsg("저장 실패: " + (await saveRes.json()).error); return }

      // 3. 오늘 자동매매 포지션 전체 종료
      await fetch("/api/auto-signal/positions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${freshTok}` },
        body: JSON.stringify({ all: true, reason: "confirmed_by_master" }),
      })

      const now = new Date(Date.now() + 9 * 3600_000)
      const hh = String(now.getUTCHours()).padStart(2, "0")
      const mi = String(now.getUTCMinutes()).padStart(2, "0")
      const ss = String(now.getUTCSeconds()).padStart(2, "0")
      const ampm = now.getUTCHours() < 12 ? "���전" : "오후"
      const h12  = now.getUTCHours() % 12 === 0 ? 12 : now.getUTCHours() % 12
      setClosedTime(`${ampm} ${String(h12).padStart(2,"0")}:${mi}:${ss}`)
      setConfirmOpen(false)
      setClosedToday(true)
      load()
    } catch (e) {
      setConfirmMsg("오류가 발생했습니다.")
    } finally {
      setConfirming(false)
    }
  }

  // ── 통계 계산 ──────────────────────────────��───────────────────────
  // 주별: ISO 주 번호(월요일 기준)
  const getWeekKey = (dateLabel: string) => {
    const d = new Date(dateLabel)
    const day = d.getDay() === 0 ? 7 : d.getDay()
    const mon = new Date(d); mon.setDate(d.getDate() - (day - 1))
    return `${mon.getFullYear()}-W${String(mon.getMonth()+1).padStart(2,"0")}${String(mon.getDate()).padStart(2,"0")}`
  }

  const weeklyMap = new Map<string, { pnl: number; days: string[] }>()
  const monthlyMap = new Map<string, { pnl: number; days: string[] }>()

  sorted.forEach(r => {
    const pnl = Number(r.daily_pnl)
    const wk  = getWeekKey(r.date_label)
    const mk  = r.date_label.slice(0, 7)
    if (!weeklyMap.has(wk))  weeklyMap.set(wk,  { pnl: 0, days: [] })
    if (!monthlyMap.has(mk)) monthlyMap.set(mk, { pnl: 0, days: [] })
    weeklyMap.get(wk)!.pnl  += pnl; weeklyMap.get(wk)!.days.push(r.date_label)
    monthlyMap.get(mk)!.pnl += pnl; monthlyMap.get(mk)!.days.push(r.date_label)
  })

  const weeklyRows  = [...weeklyMap.entries()].reverse()
  const monthlyRows = [...monthlyMap.entries()].reverse()

  const statTabStyle = (active: boolean) => ({
    padding: "4px 12px", borderRadius: 20, fontSize: 10, fontWeight: 700,
    background: active ? GOLD : "rgba(255,255,255,0.06)",
    color: active ? "#000" : "rgba(255,255,255,0.45)",
    border: "none", cursor: "pointer",
  } as React.CSSProperties)

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", scrollbarWidth: "none" }}>
      {/* 날짜 스트립 */}
      <DateStrip key={tradeMode} selectedDate={selectedDate} onSelect={setSelectedDate} />

      {/* 전체 요약 카드 */}
      <div style={{ padding: "10px 14px 0" }}>
        {/* 헤더 행 */}
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <div className="flex items-center gap-1.5">
            <PulseDot />
            <span style={{ fontSize: 10, fontWeight: 700, color: GOLD }}>매매기록 ({records.length}일)</span>
            <ClockTime />
          </div>
          <div style={{ textAlign: "right" }}>
            <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 800, color: totalPnl >= 0 ? UP_COLOR : DOWN_COLOR }}>
              {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
              <span style={{ fontSize: 9, fontWeight: 400, color: "rgba(255,255,255,0.65)", marginLeft: 4 }}>
                ({totalRoi >= 0 ? "+" : ""}{totalRoi.toFixed(2)}%)
              </span>
            </span>
            <div className="tabular-nums" style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", marginTop: 1 }}>
              {totalPnl >= 0 ? "+" : ""}{Math.round(totalPnl * krwRate).toLocaleString("ko-KR")}원
            </div>
          </div>
        </div>

        {/* 시드 / 잔고 카드 (원화 포함) */}
        <div className="grid grid-cols-2 gap-2" style={{ marginBottom: 8 }}>
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", fontWeight: 600, marginBottom: 2 }}>초기 시드</div>
            <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.95)" }}>
              {initialSeedVal != null ? `$${initialSeedVal.toFixed(2)}` : firstSeed > 0 ? `$${firstSeed.toFixed(2)}` : "—"}
            </div>
            <div className="tabular-nums" style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", marginTop: 1 }}>
              {(initialSeedVal ?? (firstSeed > 0 ? firstSeed : null)) != null
                ? `≈ ${Math.round((initialSeedVal ?? firstSeed) * krwRate).toLocaleString("ko-KR")}원`
                : ""}
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
            <div className="flex items-center gap-1.5" style={{ marginBottom: 2 }}>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", fontWeight: 600 }}>현재 잔고</span>
              {!todayRecordExists && todayAutoPnl !== 0 && (
                <span style={{ fontSize: 8, fontWeight: 700, padding: "0px 4px", borderRadius: 3, background: "rgba(34,197,94,0.15)", color: "rgba(34,197,94,0.8)" }}>실시간</span>
              )}
            </div>
            <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: totalPnl >= 0 ? UP_COLOR : DOWN_COLOR }}>
              {seedCapital !== null || records.length > 0 ? `$${latestValue.toFixed(2)}` : "—"}
            </div>
            {!todayRecordExists && todayAutoPnl !== 0 && (
              <div className="tabular-nums" style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", marginTop: 1 }}>
                확정 ${confirmedValue.toFixed(2)} + 자동 {todayAutoPnl >= 0 ? "+" : ""}{todayAutoPnl.toFixed(2)}
              </div>
            )}
            <div className="tabular-nums" style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", marginTop: 1 }}>
              {seedCapital !== null || records.length > 0 ? `≈ ${Math.round(latestValue * krwRate).toLocaleString("ko-KR")}원` : ""}
            </div>
          </div>
        </div>

        {/* 수익 분배 카드 (1/2, 2/2) — show_profit_dist 설정 시에만 표시 */}
        {showProfitDist && (
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.65)", fontWeight: 600, marginBottom: 6 }}>
              수익 분배 (총 {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)} ≈ {Math.round(totalPnl * krwRate).toLocaleString("ko-KR")}원)
            </div>
            {totalPnl <= 0 ? (
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", textAlign: "center", padding: "6px 0" }}>
                누적 수익이 없습니다.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {[1, 2].map(n => (
                  <div key={n} style={{ background: "rgba(212,175,55,0.06)", borderRadius: 6, padding: "5px 8px", textAlign: "center" }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.65)", marginBottom: 2 }}>{n}/2</div>
                    <div className="tabular-nums" style={{ fontSize: 13, fontWeight: 800, color: GOLD }}>${(totalPnl / 2).toFixed(2)}</div>
                    <div className="tabular-nums" style={{ fontSize: 10, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>
                      {Math.round((totalPnl / 2) * krwRate).toLocaleString("ko-KR")}원
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 전략 건강 지표 */}
        {(() => {
          const MIN_SAMPLE = 50
          const total      = records.length
          if (total === 0) return null

          const insufficient = total < MIN_SAMPLE
          const AMBER = "rgba(251,191,36,1)"

          const winDays  = records.filter(r => Number(r.daily_pnl) > 0).length
          const lossDays = records.filter(r => Number(r.daily_pnl) < 0).length
          const grossWin  = records.filter(r => Number(r.daily_pnl) > 0).reduce((s, r) => s + Number(r.daily_pnl), 0)
          const grossLoss = Math.abs(records.filter(r => Number(r.daily_pnl) < 0).reduce((s, r) => s + Number(r.daily_pnl), 0))

          const winRate = winDays / total * 100
          const pf      = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 1
          // 최근 10일 연속 손실 여부로 모멘텀 계산
          const recent10 = [...records].sort((a, b) => b.date_label.localeCompare(a.date_label)).slice(0, 10)
          const recentWin = recent10.filter(r => Number(r.daily_pnl) > 0).length
          const momentum  = recent10.length > 0 ? recentWin / recent10.length * 100 : 50

          const wrStatus  = insufficient ? "-" : winRate >= 55 ? "양호" : winRate >= 45 ? "주의" : "위험"
          const wrColor   = insufficient ? "rgba(255,255,255,0.25)" : winRate >= 55 ? UP_COLOR : winRate >= 45 ? AMBER : DOWN_COLOR
          const pfStatus  = insufficient ? "-" : pf >= 1.5 ? "양호" : pf >= 1.0 ? "주의" : "위험"
          const pfColor   = insufficient ? "rgba(255,255,255,0.25)" : pf >= 1.5 ? UP_COLOR : pf >= 1.0 ? AMBER : DOWN_COLOR
          const moStatus  = insufficient ? "-" : momentum >= 55 ? "양호" : momentum >= 40 ? "주의" : "위험"
          const moColor   = insufficient ? "rgba(255,255,255,0.25)" : momentum >= 55 ? UP_COLOR : momentum >= 40 ? AMBER : DOWN_COLOR

          const statuses    = insufficient ? [] : [wrStatus, pfStatus, moStatus]
          const overall     = insufficient ? "데이터 부족" : statuses.includes("위험") ? "위험" : statuses.includes("주의") ? "주의" : "양호"
          const overallColor = insufficient ? "rgba(255,255,255,0.25)" : overall === "위험" ? DOWN_COLOR : overall === "주의" ? AMBER : UP_COLOR
          const overallBg    = insufficient ? "rgba(255,255,255,0.02)" : overall === "위험" ? "rgba(239,68,68,0.08)" : overall === "주의" ? "rgba(251,191,36,0.06)" : "rgba(34,197,94,0.06)"

          return (
            <div style={{ marginTop: 8, background: overallBg, borderRadius: 8, padding: "7px 10px", border: `1px solid ${overallColor}22`, opacity: insufficient ? 0.65 : 1 }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.05em" }}>STRATEGY HEALTH</span>
                  <span style={{ fontSize: 8, color: "rgba(255,255,255,0.25)" }}>{total}일 / 최소 {MIN_SAMPLE}일</span>
                </div>
                <span style={{ fontSize: 9, fontWeight: 800, color: overallColor, padding: "1px 6px", borderRadius: 4, background: `${overallColor}18` }}>
                  {overall}
                </span>
              </div>
              {insufficient && (
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", marginBottom: 6, lineHeight: 1.5 }}>
                  {total}일 기록 — {MIN_SAMPLE}일 이상 누적 시 신뢰도가 높아집니다.
                </div>
              )}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", marginBottom: 1 }}>WIN RATE</div>
                  <div className="tabular-nums" style={{ fontSize: 13, fontWeight: 800, color: wrColor }}>{winRate.toFixed(1)}%</div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)" }}>{winDays}승 / {lossDays}패{insufficient ? "" : ` · ${wrStatus}`}</div>
                </div>
                <div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", marginBottom: 1 }}>PROFIT FACTOR</div>
                  <div className="tabular-nums" style={{ fontSize: 13, fontWeight: 800, color: pfColor }}>{pf >= 99 ? "∞" : pf.toFixed(2)}</div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)" }}>{insufficient ? "참고용" : `${pfStatus} (1.0 기준)`}</div>
                </div>
                <div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", marginBottom: 1 }}>MOMENTUM</div>
                  <div className="tabular-nums" style={{ fontSize: 13, fontWeight: 800, color: moColor }}>{recent10.length > 0 ? `${recentWin}/${recent10.length}` : "-"}</div>
                  <div style={{ fontSize: 8, color: "rgba(255,255,255,0.25)" }}>{insufficient ? "참고용" : `최근 10일 ${moStatus}`}</div>
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      {/* 수익 입력 폼 — 마스터 계정만 (반영 전용 계정 제외) */}
      {isMaster && !isConfirmOnly && <div style={{ margin: "0 14px 10px", padding: "12px 14px", borderRadius: 10, border: `1px solid rgba(212,175,55,0.15)`, background: "rgba(212,175,55,0.04)", flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, marginBottom: 10 }}>
          {`${selectedDate.getMonth()+1}월 ${selectedDate.getDate()}일`} 수익 입력
          {existing && <span style={{ marginLeft: 6, fontSize: 9, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>기록 있음 — 덮어씁니다</span>}
        </div>
        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", width: 36, flexShrink: 0 }}>수익</span>
          <div className="flex items-center" style={{ flex: 1, background: "rgba(255,255,255,0.06)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", padding: "5px 8px" }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginRight: 4 }}>$</span>
            <input type="number" value={inputPnl} onChange={e => setInputPnl(e.target.value)}
              placeholder="0.00  (손실은 음수)"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)", fontVariantNumeric: "tabular-nums" }} />
          </div>
        </div>
        <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", width: 36, flexShrink: 0 }}>메모</span>
          <input type="text" value={inputNote} onChange={e => setInputNote(e.target.value)} placeholder="선택 입력"
            style={{ flex: 1, background: "rgba(255,255,255,0.06)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.08)", padding: "5px 8px", fontSize: 12, color: "rgba(255,255,255,0.7)", outline: "none" }} />
        </div>
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 10, color: saveMsg === "저장 완료" ? UP_COLOR : "rgba(239,68,68,0.8)" }}>{saveMsg ?? ""}</span>
          <button onClick={handleSave} disabled={saving}
            style={{ padding: "6px 18px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: saving ? "rgba(212,175,55,0.3)" : GOLD, color: "#000", border: "none", cursor: saving ? "default" : "pointer" }}>
            {saving ? "저장 중..." : existing ? "수정" : "저장"}
          </button>
        </div>
      </div>}

      {/* 통계 탭 + 카운트다운 한 줄 */}
      <div className="flex items-center justify-between" style={{ padding: "0 14px 8px", flexShrink: 0 }}>
        <div className="flex items-center gap-2">
          <button style={statTabStyle(statTab === "daily")}   onClick={() => setStatTab("daily")}>일별</button>
          <button style={statTabStyle(statTab === "weekly")}  onClick={() => setStatTab("weekly")}>주별</button>
          <button style={statTabStyle(statTab === "monthly")} onClick={() => setStatTab("monthly")}>월별</button>
        </div>
        <div className="flex items-center gap-2">
          <div style={{ fontSize: 9, color: "rgba(255,255,255,0.6)", textAlign: "right" }}>분배일까지</div>
          <div className="tabular-nums" style={{ fontSize: 12, fontWeight: 800, color: GOLD, letterSpacing: "0.04em" }}>{countdown || "--:--:--"}</div>
        </div>
      </div>

      {/* 기록 목록 */}
      <div>
        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 12 }}>로딩 중...</div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 12 }}>매매 시작일은 5월 31일입니다.</div>

        ) : statTab === "daily" ? (
          // ── 일별 ──
          <>
            {/* 오늘 실시간 행 — 미반영 시 반영 버튼, 반영 후 금일매매 종료 표시 */}
            {((!todayRecordExists && todayAutoPnl !== 0) || closedToday) && (() => {
              const kstStr = kstTodayStr() // "YYYY-MM-DD"
              const mm = parseInt(kstStr.slice(5, 7))
              const dd = parseInt(kstStr.slice(8, 10))
              const pnlColor = todayAutoPnl >= 0 ? UP_COLOR : DOWN_COLOR
              const roi = confirmedValue > 0 ? (todayAutoPnl / confirmedValue) * 100 : 0
              return closedToday ? (
                /* 반영 완료 — 가운데 정렬, 시간만 표시 */
                <div style={{ padding: "14px", borderBottom: "1px solid rgba(239,68,68,0.15)", background: "rgba(239,68,68,0.04)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 900, color: "rgba(239,68,68,0.9)", letterSpacing: "0.04em" }}>금일매매 종료</span>
                  <span className="tabular-nums" style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>{closedTime}</span>
                </div>
              ) : (
                /* 실시간 미반영 행 */
                <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(212,175,55,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(212,175,55,0.03)" }}>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <PulseDot />
                      <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{mm}월 {dd}일</span>
                      <span style={{ fontSize: 8, fontWeight: 700, padding: "0px 4px", borderRadius: 3, background: "rgba(34,197,94,0.15)", color: "rgba(34,197,94,0.8)" }}>실시간</span>
                    </div>
                    <div style={{ marginTop: 2, fontSize: 10, color: "rgba(255,255,255,0.6)" }}>
                      확정 ${confirmedValue.toFixed(2)} → 예상 ${liveValue.toFixed(2)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div style={{ textAlign: "right" }}>
                      <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: pnlColor }}>{todayAutoPnl >= 0 ? "+" : ""}${todayAutoPnl.toFixed(2)}</div>
                      <div className="tabular-nums" style={{ fontSize: 9, color: "rgba(255,255,255,0.65)" }}>{todayAutoPnl >= 0 ? "+" : ""}{Math.round(todayAutoPnl * krwRate).toLocaleString("ko-KR")}원</div>
                      <div className="tabular-nums" style={{ fontSize: 10, color: todayAutoPnl >= 0 ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)" }}>{roi >= 0 ? "+" : ""}{roi.toFixed(2)}%</div>
                    </div>
                    {isMaster && !isConfirmOnly && (
                      <button onClick={() => handleConfirmOpen(todayAutoPnl)}
                        style={{ padding: "4px 10px", borderRadius: 12, border: "none", background: GOLD, color: "#000", fontSize: 10, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}>
                        반영
                      </button>
                    )}
                  </div>
                </div>
              )
            })()}
            {[...sorted].reverse().map(rec => {
              const pnl      = Number(rec.daily_pnl)
              const seed     = Number(rec.seed_capital)
              const estVal   = Number(rec.est_value)
              const roi      = seed > 0 ? (pnl / seed) * 100 : 0
              const pnlColor = pnl >= 0 ? UP_COLOR : DOWN_COLOR
              const [, mm, dd] = rec.date_label.split("-")
              return (
                <div key={rec.id} style={{ padding: "10px 14px", borderBottom: `1px solid rgba(212,175,55,0.04)`, display: "flex", justifyContent: "space-between", alignItems: "center", background: rec.date_label === dateStr ? "rgba(212,175,55,0.04)" : undefined }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.95)" }}>
                      {parseInt(mm)}월 {parseInt(dd)}일
                      {rec.note && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 400, color: "rgba(255,255,255,0.55)" }}>{rec.note}</span>}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 10, color: "rgba(255,255,255,0.6)" }}>
                      시드 ${seed.toFixed(2)} → 잔고 ${estVal.toFixed(2)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div style={{ textAlign: "right" }}>
                      <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: pnlColor }}>{pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}</div>
                      <div className="tabular-nums" style={{ fontSize: 9, color: "rgba(255,255,255,0.65)" }}>{pnl >= 0 ? "+" : ""}{Math.round(pnl * krwRate).toLocaleString("ko-KR")}원</div>
                      <div className="tabular-nums" style={{ fontSize: 10, color: pnl >= 0 ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)" }}>{roi >= 0 ? "+" : ""}{roi.toFixed(2)}%</div>
                    </div>
                    {isMaster && !isConfirmOnly && (
                      <button onClick={() => handleDelete(rec.id)}
                        style={{ width: 20, height: 20, borderRadius: 4, border: "none", background: "rgba(239,68,68,0.12)", color: "rgba(239,68,68,0.6)", fontSize: 11, cursor: "pointer", flexShrink: 0 }}>×</button>
                    )}
                  </div>
                </div>
              )
            })}
          </>

        ) : statTab === "weekly" ? (
          // ── 주별 ──
          weeklyRows.length === 0
            ? <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 12 }}>데이터 없음</div>
            : weeklyRows.map(([wk, { pnl, days }]) => {
              const startDay = days[0]; const endDay = days[days.length - 1]
              const [,sm,sd] = startDay.split("-"); const [,em,ed] = endDay.split("-")
              const roiPct = baseSeed > 0 ? (pnl / baseSeed) * 100 : 0
              const col = pnl >= 0 ? UP_COLOR : DOWN_COLOR
              return (
                <div key={wk} style={{ padding: "11px 14px", borderBottom: `1px solid rgba(212,175,55,0.04)`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.95)" }}>
                      {parseInt(sm)}월 {parseInt(sd)}일 ~ {parseInt(em)}월 {parseInt(ed)}일
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{days.length}일 기록</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: col }}>{pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}</div>
                    <div className="tabular-nums" style={{ fontSize: 9, color: "rgba(255,255,255,0.65)" }}>{pnl >= 0 ? "+" : ""}{Math.round(pnl * krwRate).toLocaleString("ko-KR")}원</div>
                    <div className="tabular-nums" style={{ fontSize: 10, color: pnl >= 0 ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)" }}>{roiPct >= 0 ? "+" : ""}{roiPct.toFixed(2)}%</div>
                  </div>
                </div>
              )
            })

        ) : (
          // ── 월별 ──
          monthlyRows.length === 0
            ? <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 12 }}>데이터 없음</div>
            : monthlyRows.map(([mk, { pnl, days }]) => {
              const [yy, mm] = mk.split("-")
              const roiPct = baseSeed > 0 ? (pnl / baseSeed) * 100 : 0
              const col = pnl >= 0 ? UP_COLOR : DOWN_COLOR
              return (
                <div key={mk} style={{ padding: "11px 14px", borderBottom: `1px solid rgba(212,175,55,0.04)`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.95)" }}>{yy}년 {parseInt(mm)}월</div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>{days.length}일 기록</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: col }}>{pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}</div>
                    <div className="tabular-nums" style={{ fontSize: 9, color: "rgba(255,255,255,0.65)" }}>{pnl >= 0 ? "+" : ""}{Math.round(pnl * krwRate).toLocaleString("ko-KR")}원</div>
                    <div className="tabular-nums" style={{ fontSize: 10, color: pnl >= 0 ? "rgba(34,197,94,0.9)" : "rgba(239,68,68,0.9)" }}>{roiPct >= 0 ? "+" : ""}{roiPct.toFixed(2)}%</div>
                  </div>
                </div>
              )
            })
        )}
      </div>

      {/* 반영 확인 모달 */}
      {confirmOpen && (
        <div style={{
          position: "fixed", inset: 0, zIndex: 9999,
          background: "rgba(0,0,0,0.7)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }} onClick={() => setConfirmOpen(false)}>
          <div style={{
            background: "#0e100f",
            border: `1px solid rgba(212,175,55,0.25)`,
            borderRadius: 14, padding: "22px 20px", width: 300,
            boxShadow: "0 8px 40px rgba(0,0,0,0.8)",
          }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 4 }}>자동매매 반영 확인</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginBottom: 16 }}>
              오늘 TOTAL PNL{" "}
              <span style={{ color: confirmPnl >= 0 ? UP_COLOR : DOWN_COLOR, fontWeight: 700 }}>
                {confirmPnl >= 0 ? "+" : ""}${confirmPnl.toFixed(2)}
              </span>
              {" "}을 매매기록에 저장하고<br />
              모든 자동매매 포지션을 종료합니다.
            </div>
            <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 6 }}>마스터 비밀번호</div>
            <input
              type="password"
              value={confirmPw}
              onChange={e => setConfirmPw(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleConfirmSubmit()}
              placeholder="비밀번호 입력"
              autoFocus
              style={{
                width: "100%", background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8,
                padding: "8px 10px", fontSize: 13, color: "rgba(255,255,255,0.85)",
                outline: "none", marginBottom: 10, boxSizing: "border-box",
              }}
            />
            {confirmMsg && (
              <div style={{ fontSize: 10, color: "rgba(239,68,68,0.8)", marginBottom: 8 }}>{confirmMsg}</div>
            )}
            <div className="flex items-center gap-2">
              <button onClick={() => setConfirmOpen(false)}
                style={{ flex: 1, padding: "8px 0", borderRadius: 20, border: "1px solid rgba(255,255,255,0.1)", background: "transparent", color: "rgba(255,255,255,0.45)", fontSize: 11, cursor: "pointer" }}>
                취소
              </button>
              <button onClick={handleConfirmSubmit} disabled={confirming}
                style={{ flex: 2, padding: "8px 0", borderRadius: 20, border: "none", background: confirming ? "rgba(212,175,55,0.4)" : GOLD, color: "#000", fontSize: 11, fontWeight: 700, cursor: confirming ? "default" : "pointer" }}>
                {confirming ? "처리 중..." : "반영 및 종료"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 자동매매 라이브 패널 ────────────��─────────────��────────────────��─
interface AutoPos {
  id:           string
  signal_type:  string
  symbol:       string
  direction:    string
  entry_price:  number
  size_usd:     number
  leverage:     number
  signal_time:  string
  date_label:   string
  is_closed:    boolean
  close_reason: string | null
  closed_roi:   number | null
  closed_price: number | null
}

function AutoSignalPanel({ selectedDate, sortOrder = "time", searchQ = "", onSlClosed, onTodayPnl, confirmedMargin, userRole }: {
  selectedDate: Date
  sortOrder?: "time" | "roi_desc" | "roi_asc" | "signal"
  searchQ?: string
  onSlClosed?: () => void
  onTodayPnl?: (pnl: number) => void
  confirmedMargin?: number   // 전날 확정 잔고 — MARGIN 기준값
  userRole?: string | null
}) {
  const [positions,        setPositions]        = useState<AutoPos[]>([])
  const [isHistorical,     setIsHistorical]     = useState(false)
  const [loading,          setLoading]          = useState(true)
  const [, setTick]        = useState(0)
  const [stopLossPct,      setStopLossPct]      = useState<number | null>(null)
  const [sizeUsdCfg,       setSizeUsdCfg]       = useState<number>(10)
  const [seedCapital,      setSeedCapital]       = useState<number | null>(null)
  // 강제 청산 모달 state
  const [forceCloseId,     setForceCloseId]     = useState<string | null>(null)
  const [forceClosePrice,  setForceClosePrice]  = useState<string>("")
  const [forceClosing,     setForceClosing]      = useState(false)
  const closingRef = useRef<Set<string>>(new Set())

  // KST 기준 오늘 날짜
  const todayKST = kstTodayStr()

  const dateKey = [
    selectedDate.getFullYear(),
    String(selectedDate.getMonth() + 1).padStart(2, "0"),
    String(selectedDate.getDate()).padStart(2, "0"),
  ].join("-")

  const isToday = dateKey === todayKST

  const fetchPositions = useCallback(() => {
    fetch(`/api/auto-signal/positions?date=${dateKey}`)
      .then(r => r.ok ? r.json() : { positions: [], is_historical: false })
      .then(d => {
        setPositions(d.positions ?? [])
        setIsHistorical(d.is_historical ?? false)
      })
      .finally(() => setLoading(false))
  }, [dateKey])

  useEffect(() => {
    setLoading(true)
    fetchPositions()
    // 과거 날짜는 갱신 불필요, 오늘만 30초 주기로 갱신
    if (isToday) {
      const refresh = setInterval(fetchPositions, 30_000)
      return () => clearInterval(refresh)
    }
  }, [fetchPositions, isToday])

  // 스탑로스 + 포지션당 금액 + 시드 설정 조회 (마운트 시 1회)
  useEffect(() => {
    fetch("/api/auto-signal/settings")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) return
        if (d.stop_loss_pct != null) setStopLossPct(Number(d.stop_loss_pct))
        if (d.size_usd      != null) setSizeUsdCfg(Number(d.size_usd))
        if (d.seed_capital  != null) setSeedCapital(Number(d.seed_capital))
      })
      .catch(() => {})
  }, [])

  // 스탑로스 자동 클로즈 — 오늘 날짜, 1초마다 체크
  useEffect(() => {
    if (!isToday || stopLossPct === null) return
    const check = setInterval(() => {
      positions.forEach(pos => {
        if (closingRef.current.has(pos.id)) return
        if (pos.is_closed) return  // 이��� 청산된 포지션은 재트리거 방지
        const entry  = Number(pos.entry_price)
        const sym    = pos.symbol.replace(/\.P$/, "").replace(/\//g, "")
        const ticker = liveCache.tickers.get(sym)
        const cur    = ticker?.price ?? 0
        if (cur <= 0 || entry <= 0) return
        const delta  = pos.direction === "long" ? (cur - entry) / entry : (entry - cur) / entry
        const roi    = delta * (pos.leverage ?? 1) * 100
        const threshold = -(stopLossPct * (pos.leverage ?? 1))
        if (roi <= threshold) {
          closingRef.current.add(pos.id)
          const tok = typeof window !== "undefined" ? localStorage.getItem("app_token") ?? "" : ""
          fetch("/api/auto-signal/stop-loss", {
            method:  "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
            body:    JSON.stringify({ id: pos.id, closed_price: cur }),
          }).then(async r => {
            if (!r.ok) { closingRef.current.delete(pos.id); return }
            const json = await r.json().catch(() => ({}))
            const fixedRoi = json.closed_roi ?? roi
            const fixedPnl = json.final_pnl  ?? null
            // UI 즉시 반영
            setPositions(prev => prev.map(p =>
              p.id === pos.id
                ? { ...p, is_closed: true, close_reason: "stop_loss", closed_roi: fixedRoi, closed_price: cur, final_pnl: fixedPnl, final_roi: fixedRoi }
                : p
            ))
            // DB 실제 상태로 동기화 (is_closed 반영 확인)
            fetchPositions()
            onSlClosed?.()
          }).catch(() => { closingRef.current.delete(pos.id) })
        }
      })
    }, 1000)
    return () => clearInterval(check)
  }, [isToday, stopLossPct, positions])

  // 1초 tick → 오늘 날짜일 때만 liveCache 실시간 반영
  useEffect(() => {
    if (!isToday) return
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [isToday])

  const dateLabel = `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일`

  // 심볼 정규화: JCTUSDT.P → JCTUSDT
  const normalize = (raw: string) => raw.replace(/\.P$/, "").replace(/\//g, "")

  // 통계 계산
  // - 오늘: liveCache 실�����간 가격으로 PnL 계산
  // - ���거: API가 반환한 final_pnl / final_roi (Binance Klines 종가 기준)
  const posCalc = positions.map(pos => {
    const sym    = normalize(pos.symbol)
    const entry  = Number(pos.entry_price)

    if (isHistorical) {
      // 과거 날짜 — final_roi(Klines) → closed_roi(DB 저장값) 순 폴백
      const sizeUsd  = Number(pos.size_usd ?? 10)
      const lev      = Number(pos.leverage ?? 10)
      const rawRoi   = pos.final_roi   != null ? Number(pos.final_roi)
                     : pos.closed_roi  != null ? Number(pos.closed_roi)
                     : null
      const rawPrice = pos.close_price != null ? Number(pos.close_price)
                     : pos.closed_price!= null ? Number(pos.closed_price)
                     : 0
      const hasCur   = rawRoi !== null
      const roi      = rawRoi ?? 0
      const pnl      = sizeUsd * (roi / 100)
      return {
        ...pos,
        sym,
        cur:     rawPrice,
        hasCur,
        pnl,
        roi,
        delta:   0,
        isClose: true,
      }
    }

    const sizeUsd = pos.size_usd ?? 10
    const lev     = pos.leverage ?? 1

    // 스탑���스로 청산된 포지션: 실시간 % 계�� 계산, PNL은 SL 고정값 사용
    if (pos.is_closed && pos.close_reason === "stop_loss") {
      const ticker  = liveCache.tickers.get(sym)
      const cur     = ticker ? ticker.price : 0
      const hasCur  = cur > 0 && entry > 0
      const delta   = hasCur
        ? (pos.direction === "long" ? (cur - entry) / entry : (entry - cur) / entry)
        : 0
      const roi    = delta * lev * 100
      // PNL은 항상 설정값 기준으로 고정 — DB closed_roi 무시
      // size_usd × (stop_loss_pct × leverage / 100) = -$5
      const fixedRoi = stopLossPct != null ? -(stopLossPct * lev) : 0
      const pnl      = sizeUsd * (fixedRoi / 100)
      return { ...pos, sym, cur, hasCur, delta, roi, pnl, isClose: false }
    }

    // 오늘 활성 포지션 — liveCache 실시간 가격
    const ticker  = liveCache.tickers.get(sym)
    const cur     = ticker ? ticker.price : 0
    const hasCur  = cur > 0 && entry > 0
    const delta   = hasCur
      ? (pos.direction === "long" ? (cur - entry) / entry : (entry - cur) / entry)
      : 0
    let roi = delta * lev * 100
    let pnl = sizeUsd * delta * lev

    // 아직 청산 안됐지만 임계값 이하인 경우 PNL 캡
    if (stopLossPct !== null) {
      const slRoiThreshold = -(stopLossPct * lev)
      const slPnlFixed     = sizeUsd * (slRoiThreshold / 100)
      if (roi < slRoiThreshold) {
        pnl = slPnlFixed
      }
    }

    return { ...pos, sym, cur, hasCur, delta, roi, pnl, isClose: false }
  })

  // 과거 날짜: 전체 포지션(day_close + SL 포함) / 오늘: 활성 포지션만
  const statsCalc   = isHistorical ? posCalc : posCalc.filter(p => !p.is_closed)
  // 카드 목록: 오늘은 활성만, 과거는 전체
  const activeCalc  = statsCalc
  const filteredCalc = searchQ
    ? activeCalc.filter(p => p.sym.toLowerCase().includes(searchQ.toLowerCase()))
    : activeCalc

  const avgRoi    = statsCalc.length > 0 ? statsCalc.reduce((s, p) => s + p.roi, 0) / statsCalc.length : 0
  const profitCnt = statsCalc.filter(p => p.roi > 0).length
  const lossCnt   = statsCalc.filter(p => p.roi < 0).length
  // 포지션 수 × 포지션금액 (부 통계 표시용)
  const posMargin = statsCalc.length * sizeUsdCfg

  // SL 청산 (오늘: 고정값 PNL / 과거: final_roi가 이미 포함돼 있으므로 별도 계산 불필요)
  const slClosed    = positions.filter(p => p.is_closed && p.close_reason === "stop_loss")
  const slClosedCnt = slClosed.length
  const slClosedPnl = isHistorical
    ? statsCalc.filter(p => p.is_closed && p.close_reason === "stop_loss").reduce((s, p) => s + p.pnl, 0)
    : slClosed.reduce((s, p) => s - (Number(p.size_usd ?? sizeUsdCfg) * (stopLossPct ?? 5) * Number(p.leverage ?? 10) / 100), 0)

  // TOTAL PNL = 전체 포지션 PNL 합산 (과거: final_roi 기준 / 오늘: 활성PNL + SL고정)
  const activePnl = isHistorical
    ? statsCalc.reduce((s, p) => s + p.pnl, 0)
    : posMargin * (avgRoi / 100)
  const totalPnl = isHistorical ? activePnl : activePnl + slClosedPnl

  // MARGIN: 오늘은 확정 잔고(전날 최종 잔고)가 기준 / 과거는 당일 포지션 마진
  const margin   = (!isHistorical && confirmedMargin != null && confirmedMargin > 0)
    ? confirmedMargin
    : posMargin

  // EST. VALUE = MARGIN + TOTAL PNL
  const estValue = margin + totalPnl

  // TOTAL ROI = totalPnl / margin × 100
  const totalRoi = margin > 0 ? (totalPnl / margin) * 100 : avgRoi

  // 오늘 날짜이면 부모에게 실시간 PNL 전달 (마스터가 반영할 때까지 계속 유지)
  useEffect(() => {
    if (isToday) onTodayPnl?.(totalPnl)
  }, [totalPnl, isToday])

  const sortedCalc = [...filteredCalc].sort((a, b) => {
    if (sortOrder === "roi_desc") return b.roi - a.roi
    if (sortOrder === "roi_asc")  return a.roi - b.roi
    if (sortOrder === "signal")   return (a.signal_type ?? "").localeCompare(b.signal_type ?? "")
    // "time" — 기본: 수신 시각 내림차순 (id 기준)
    return 0
  })

  // 강제 청산 X 버튼 클릭: 청산가(SL 기준)보다 10% 더 나쁜 방향으로 preset
  const openForceClose = (pos: typeof posCalc[0]) => {
    const entry = Number(pos.entry_price)
    const lev   = Number(pos.leverage ?? 10)
    const isLong = pos.direction === "long"
    // SL 청산 기준가: 롱 = entry × (1 - 1/lev), 숏 = entry × (1 + 1/lev)
    const slPrice = isLong
      ? entry * (1 - 1 / lev)
      : entry * (1 + 1 / lev)
    // 10% 더 나쁜 방향 (롱이면 더 낮게, 숏이면 더 ��게)
    const triggerPrice = isLong
      ? slPrice * 0.90
      : slPrice * 1.10
    setForceCloseId(pos.id)
    setForceClosePrice(triggerPrice.toFixed(entry < 1 ? 6 : entry < 100 ? 4 : 2))
  }

  const handleForceClose = async () => {
    if (!forceCloseId) return
    const pos   = posCalc.find(p => p.id === forceCloseId)
    if (!pos) return
    setForceClosing(true)
    const price  = parseFloat(forceClosePrice)
    const entry  = Number(pos.entry_price)
    const lev    = Number(pos.leverage ?? 10)
    const sizeUsd = Number(pos.size_usd ?? sizeUsdCfg)
    const delta  = pos.direction === "long"
      ? (price - entry) / entry
      : (entry - price) / entry
    const closedRoi = delta * lev * 100
    const tok = typeof window !== "undefined" ? localStorage.getItem("app_token") ?? "" : ""
    const res = await fetch("/api/auto-signal/positions", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
      body:    JSON.stringify({ id: forceCloseId, closed_price: price, closed_roi: closedRoi, reason: "stop_loss" }),
    })
    if (res.ok) {
      setPositions(prev => prev.map(p =>
        p.id === forceCloseId
          ? { ...p, is_closed: true, close_reason: "stop_loss", closed_roi: closedRoi, closed_price: price }
          : p
      ))
      onSlClosed?.()
    } else {
      const d = await res.json().catch(() => ({}))
      alert(d.error ?? "강제 청산 실패")
    }
    setForceClosing(false)
    setForceCloseId(null)
  }

  if (loading) return (
    <div className="flex items-center justify-center py-5"
      style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>로딩 중...</div>
  )

  return (
    <div>
      {/* 강제 청산 모달 — master 전용 */}
      {forceCloseId && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl p-5 w-full max-w-xs shadow-2xl space-y-4 mx-4">
            <div className="space-y-0.5">
              <h3 className="text-sm font-bold text-foreground">강제 청산</h3>
              <p className="text-xs text-muted-foreground">
                청산 기준가(SL)보다 10% 더 불리한 가격이 자동 입력됩니다.<br />
                <span style={{ color: "rgba(239,68,68,0.8)" }}>SL CLOSE로 기록되며 TOTAL PNL에서 차감됩니다.</span>
              </p>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">청산 현재가 (수정 가능)</label>
              <input
                type="number"
                value={forceClosePrice}
                onChange={e => setForceClosePrice(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground tabular-nums focus:outline-none focus:ring-1 focus:ring-destructive"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setForceCloseId(null)}
                className="flex-1 h-9 rounded-lg text-xs font-semibold border border-border text-muted-foreground bg-transparent hover:bg-muted/30 transition-colors"
              >취소</button>
              <button
                onClick={handleForceClose}
                disabled={forceClosing}
                className="flex-1 h-9 rounded-lg text-xs font-bold text-white transition-colors disabled:opacity-50"
                style={{ background: "rgba(239,68,68,0.8)" }}
              >{forceClosing ? "처리중..." : "청산 확인"}</button>
            </div>
          </div>
        </div>
      )}

      {/* 요약 헤더 */}
      <div className="px-4 py-3" style={{ borderBottom: `1px solid rgba(212,175,55,0.08)` }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            {!isHistorical && <PulseDot />}
            <span style={{ fontSize: 10, fontWeight: 700, color: GOLD }}>자동매매</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.5)" }}>{dateLabel}</span>
            {isHistorical
              ? <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.35)" }}>종가 기준</span>
              : <ClockTime />
            }
          </div>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
              수익 <span style={{ color: UP_COLOR, fontWeight: 700 }}>{profitCnt}</span>
              {" / "}손실 <span style={{ color: DOWN_COLOR, fontWeight: 700 }}>{lossCnt}</span>
              {slClosedCnt > 0 && (
                <> {" / "}청산 <span style={{ color: "rgba(239,68,68,0.7)", fontWeight: 700 }}>{slClosedCnt}</span></>
              )}
            </span>
          </div>
        </div>
        {/* MARGIN + EST. VALUE */}
        <div className="grid grid-cols-2 gap-2 mb-2">
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>MARGIN</div>
            <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.75)" }}>
              ${margin.toFixed(2)}
            </div>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>
              {(!isHistorical && confirmedMargin != null && confirmedMargin > 0)
                ? `확정잔고 기준 (${activeCalc.length}건 × $${sizeUsdCfg} = $${(activeCalc.length * sizeUsdCfg).toLocaleString()})`
                : `${activeCalc.length}건 × $${sizeUsdCfg}`
              }
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>EST. VALUE</div>
            <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: totalPnl >= 0 ? UP_COLOR : DOWN_COLOR }}>
              ${estValue.toFixed(2)}
            </div>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>
              MARGIN + PNL {totalPnl >= 0 ? "+" : ""}{totalPnl.toFixed(2)}
            </div>
          </div>
        </div>
        {/* TOTAL ROI + SL CLOSE + TOTAL PNL */}
        <div className="grid grid-cols-3 gap-2">
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>TOTAL ROI</div>
            <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: totalRoi >= 0 ? UP_COLOR : DOWN_COLOR }}>
              {totalRoi >= 0 ? "+" : ""}{totalRoi.toFixed(2)}%
            </div>
          </div>
          <div style={{ background: slClosedCnt > 0 ? "rgba(239,68,68,0.05)" : "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>SL CLOSE</div>
            <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: slClosedCnt === 0 ? "rgba(255,255,255,0.25)" : DOWN_COLOR }}>
              {slClosedCnt === 0 ? "-" : `$${slClosedPnl.toFixed(2)}`}
            </div>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>
              {slClosedCnt > 0 ? `${slClosedCnt}건 × $${Math.abs(slClosedPnl / slClosedCnt).toFixed(2)}` : "청산 없음"}
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>TOTAL PNL</div>
            <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: totalPnl >= 0 ? UP_COLOR : DOWN_COLOR }}>
              {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
            </div>
          </div>
        </div>


      </div>

      {posCalc.length === 0 && (
        <div className="py-6 text-center" style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
          이 날짜에 확인된 시그널이 없습니다.
        </div>
      )}

      {sortedCalc.map(pos => {
        const roiColor    = pos.roi >= 0 ? UP_COLOR : DOWN_COLOR
        const inTime      = new Date(pos.signal_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
        const baseSymbol  = pos.symbol.replace(/\.P$/, "").replace("USDT", "")
        const slThreshold = stopLossPct !== null ? -(stopLossPct * (pos.leverage ?? 1)) : null
        const isSlWarning = slThreshold !== null && pos.hasCur && pos.roi <= slThreshold * 0.8 && pos.roi > slThreshold
        const isSlHit     = slThreshold !== null && pos.hasCur && pos.roi <= slThreshold

        return (
          <div key={pos.id} style={{
            padding: "10px 14px",
            borderBottom: `1px solid rgba(212,175,55,0.05)`,
            background: isSlHit ? "rgba(239,68,68,0.09)" : isSlWarning ? "rgba(239,68,68,0.04)" : undefined,
          }}>
            {/* 상단행: 방향뱃지 + 심볼 + 레버리지 + ROI | IN시각 + PnL */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span style={{
                  width: 18, height: 18, borderRadius: 4, fontSize: 9, fontWeight: 900,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: pos.direction === "long" ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                  color: pos.direction === "long" ? UP_COLOR : DOWN_COLOR,
                }}>{pos.direction === "long" ? "L" : "S"}</span>
                <span style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.9)" }}>
                  {baseSymbol}/USDT
                </span>
                <span style={{
                  padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                  background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.5)",
                }}>{pos.leverage}x</span>
                {pos.hasCur && (
                  <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 800, color: roiColor }}>
                    {pos.roi >= 0 ? "+" : ""}{pos.roi.toFixed(2)}%
                  </span>
                )}
                {isSlHit && (
                  <span style={{ fontSize: 8, fontWeight: 800, padding: "1px 4px", borderRadius: 3, background: "rgba(239,68,68,0.25)", color: DOWN_COLOR }}>SL 청산</span>
                )}
                {isSlWarning && !isSlHit && (
                  <span style={{ fontSize: 8, fontWeight: 800, padding: "1px 4px", borderRadius: 3, background: "rgba(251,191,36,0.15)", color: "#fbbf24" }}>SL 임박</span>
                )}
              </div>
              <div className="text-right flex items-start gap-2">
                <div>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>IN:{inTime}</div>
                  {pos.hasCur ? (
                    /* 실시간 가격 수신 중 — 진입가 기준 PnL */
                    <div className="tabular-nums" style={{ fontSize: 13, fontWeight: 800, color: roiColor }}>
                      {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(3)}
                    </div>
                  ) : Number(pos.entry_price) > 0 ? (
                    /* 가격 대기 중 — 0 표시 */
                    <div className="tabular-nums" style={{ fontSize: 13, fontWeight: 800, color: "rgba(255,255,255,0.2)" }}>
                      $0.000
                    </div>
                  ) : null}
                </div>
                {/* 강제 청산 X 버튼 — master 전용, 오늘 활성 포지션만 */}
                {userRole === "master" && isToday && !pos.is_closed && (
                  <button
                    onClick={e => { e.stopPropagation(); openForceClose(pos) }}
                    title="강제 청산"
                    style={{
                      width: 18, height: 18, borderRadius: 4, border: "none", cursor: "pointer",
                      background: "rgba(239,68,68,0.18)", color: "rgba(239,68,68,0.85)",
                      fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center",
                      flexShrink: 0, marginTop: 2,
                    }}
                  >×</button>
                )}
              </div>
            </div>
            {/* 하단행: 진입가 | 현재가(오늘) 또는 종가(과���) | 시그널 */}
            <div className="flex items-center gap-3 mt-0.5" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
              <span>
                진입:{" "}
                <span className="tabular-nums" style={{ color: "rgba(255,255,255,0.55)" }}>
                  ${fmt(Number(pos.entry_price))}
                </span>
              </span>
              {pos.hasCur && (
                <span>
                  {pos.isClose ? "종가" : "현재"}:{" "}
                  <span className="tabular-nums" style={{ color: pos.roi >= 0 ? "rgba(34,197,94,0.8)" : "rgba(239,68,68,0.8)" }}>
                    ${fmt(pos.cur)}
                  </span>
                </span>
              )}
              {!pos.hasCur && !isHistorical && (
                <span style={{ color: "rgba(255,255,255,0.2)" }}>가격 수신 대기중...</span>
              )}
              {!pos.hasCur && isHistorical && (
                <span style={{ color: "rgba(255,255,255,0.2)" }}>종가 없음</span>
              )}
              <span style={{ color: "rgba(212,175,55,0.4)" }}>{pos.signal_type}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function TradePage() {
  const [balance,       setBalance]       = useState<number | null>(null)
  const [positions,     setPositions]     = useState<Position[]>([])
  const [logs,          setLogs]          = useState<TradeLog[]>([])
  const [openingId,     setOpeningId]     = useState<string | null>(null)
  const [closingId,     setClosingId]     = useState<string | null>(null)
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT")
  const [selectedPrice,  setSelectedPrice]  = useState<number | null>(null)
  const [dialogOpen,    setDialogOpen]    = useState(false)
  const [dialogSymbol,  setDialogSymbol]  = useState("BTCUSDT")
  const [dialogPrice,   setDialogPrice]   = useState<number | null>(null)
  const [tick,          setTick]          = useState(0)
  const [formCollapsed, setFormCollapsed] = useState(true)   // 기본값: 접힘
  const [selectedDate,  setSelectedDate]  = useState(() => kstToday())
  const [tradeMode,       setTradeMode]       = useState<"auto" | "closed" | "ledger" | "mock">("ledger")

  // 탭 전환 시 날짜를 오늘로 리셋 → DateStrip이 �� 오른쪽으로 스크롤
  const switchTab = (mode: "auto" | "closed" | "ledger" | "mock") => {
    setSelectedDate(kstToday())
    setTradeMode(mode)
  }
  const [closedRefreshKey, setClosedRefreshKey] = useState(0)
  const [allowMockTrade, setAllowMockTrade] = useState(false)
  const [userRole,       setUserRole]       = useState<string | null>(null)
  const [userName,       setUserName]       = useState<string | null>(null)
  const [todayAutoPnl,   setTodayAutoPnl]   = useState<number>(0)
  const [confirmedValue, setConfirmedValue] = useState<number>(0)

  // 앱 시작 시 매매기록의 최신 확정 잔고(est_value)를 로드
  // LedgerPanel 탭을 열지 않아도 AutoSignalPanel MARGIN 기준값이 올바르게 설정됨
  useEffect(() => {
    Promise.all([
      fetch("/api/auto-signal/rebalance", {
        credentials: "include",
        headers: { Authorization: `Bearer ${getToken() ?? ""}` },
      }).then(r => r.ok ? r.json() : { records: [] }),
      fetch("/api/auto-signal/settings").then(r => r.ok ? r.json() : null),
    ]).then(([ledger, cfg]) => {
      const recs: { date_label: string; est_value: number }[] = ledger.records ?? []
      const seed = cfg?.seed_capital != null ? Number(cfg.seed_capital) : null
      if (recs.length > 0) {
        const latest = [...recs].sort((a, b) => a.date_label.localeCompare(b.date_label))
        setConfirmedValue(Number(latest[latest.length - 1].est_value))
      } else {
        setConfirmedValue(seed)
      }
    }).catch(() => {})
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const [searchQ,       setSearchQ]       = useState("")
  type SortOrder = "time" | "roi_desc" | "roi_asc" | "signal"
  const SORT_CYCLE: SortOrder[] = ["time", "roi_desc", "roi_asc", "signal"]
  const SORT_LABEL: Record<SortOrder, string> = { time: "시간순", roi_desc: "수익↑", roi_asc: "수익↓", signal: "시그널" }
  const [sortOrder,     setSortOrder]     = useState<SortOrder>("time")
  const cycleSort = () => setSortOrder(prev => {
    const idx = SORT_CYCLE.indexOf(prev)
    return SORT_CYCLE[(idx + 1) % SORT_CYCLE.length]
  })

  // refs — stale closure 방지
  const priceMapRef       = useRef<Map<string, number>>(new Map())
  const balanceRef        = useRef<number | null>(null)
  const positionsRef      = useRef<Position[]>([])
  const dialogSymbolRef   = useRef("BTCUSDT")
  const selectedSymbolRef = useRef("BTCUSDT")

  useEffect(() => { balanceRef.current      = balance   }, [balance])
  useEffect(() => { positionsRef.current    = positions }, [positions])
  useEffect(() => { dialogSymbolRef.current = dialogSymbol }, [dialogSymbol])
  useEffect(() => { selectedSymbolRef.current = selectedSymbol }, [selectedSymbol])

  useEffect(() => {
    if (positions.length === 0) return
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [positions.length])

  usePriceWorker({})

  // 모의매매 허용 여부 + 사용자 role 조회 (마운트 시 1회)
  useEffect(() => {
    const token = getToken()
    if (!token) return
    Promise.all([
      fetch("/api/user/profile", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
      fetch("/api/auth/me", { credentials: "include", headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : { role: null }),
    ]).then(([profileData, meData]) => {
      const allowed = !!profileData?.profile?.allow_mock_trade
      setAllowMockTrade(allowed)
      if (!allowed) setTradeMode("auto")
      setUserRole(meData.role ?? null)
      setUserName(meData.username ?? null)
    }).catch(() => {})
  }, [])

  // ── 폴링 ────────────────────────────────────────────────────────
  const fetchBalance = useCallback(() => {
    const token = getToken()
    if (!token) return
    fetch("/api/user/trade", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.balance !== undefined) setBalance(d.balance) })
      .catch(() => {})
  }, [])

  const fetchPositions = useCallback(async () => {
    const token = getToken()
    if (!token) return
    fetchBalance()
    // 클라이언트 WebSocket 가격�� 쿼리로 전달 — 서버가 Binance 조회 ��이 PnL 계산
    const pricesParam = [...priceMapRef.current.entries()]
      .map(([sym, price]) => `${sym}:${price}`).join(",")
    const qs = pricesParam ? `?prices=${encodeURIComponent(pricesParam)}` : ""
    const r = await fetch(`/api/user/trade/positions${qs}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null)
    if (!r?.ok) return
    const d = await r.json()
    if (!d?.positions) return

    const liquidated = d.positions.filter((p: any) => p.liquidated)
    if (liquidated.length > 0) {
      fetchBalance()
      liquidated.forEach((p: any) =>
        alert(`[강제청산] ${p.symbol.replace("USDT","")} ${p.direction === "long" ? "롱" : "숏"} ${p.leverage}x 포지션이 강제���� 되었���니다.`)
      )
    }

    const open = d.positions.filter((p: any) => !p.liquidated)
    setPositions(open.map((p: any) => {
      const entry   = Number(p.entry_price)
      const margin  = Number(p.margin)
      const lev     = Number(p.leverage)
      // 서버가 PnL 0을 반환하면 클라이언트 ���격으로 직접 계산
      let pnl    = p.unrealized_pnl     ?? 0
      let pnlPct = p.unrealized_pnl_pct ?? 0
      const cur = priceMapRef.current.get(p.symbol) ?? 0
      if (cur > 0 && entry > 0) {
        const delta = p.direction === "long"
          ? (cur - entry) / entry
          : (entry - cur) / entry
        pnlPct = delta * lev * 100
        pnl    = Math.round(margin * delta * lev)
      }
      return {
        ...p,
        entryPrice:    entry,
        amount:        margin,
        pnl,
        pnlPct,
        current_price: cur > 0 ? cur : entry,
        openedAt:      new Date(p.opened_at).getTime(),
      }
    }))
  }, [fetchBalance])

  useEffect(() => {
    // 최초 1회 fetch
    fetchPositions()

    // Supabase Realtime — trade_positions 변경 시 즉시 re-fetch
    // 폴링(3초) 완전 제거 → Vercel Function 호출 ~97% 감���
    const token = getToken()
    if (!token) return

    const channel = supabaseBrowser
      .channel("trade-positions-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trade_positions" },
        () => { fetchPositions() }
      )
      .subscribe()

    // 안전망: 30초에 1번만 폴링 (Realtime 연결 끊겼을 때 fallback)
    const fallback = setInterval(fetchPositions, 30_000)

    return () => {
      supabaseBrowser.removeChannel(channel)
      clearInterval(fallback)
    }
  }, [fetchPositions])

  // ── 주문 ���들러 — ref ���용으로 stale closure 완����� 차단 ────��─────
  const handleOpen = useCallback(async (dir: Direction, amount: number, leverage: number) => {
    const bal = balanceRef.current
    if (bal === null) { alert("잔고를 불러오는 중입니다."); return }
    if (amount <= 0 || amount > bal) { alert("잔고가 부족합니다."); return }

    // dialogSymbolRef: 다이얼로그에서 호출 시 항상 올바른 심볼을 ������킴
    const sym   = dialogSymbolRef.current
    const price = priceMapRef.current.get(sym) ?? 0

    setOpeningId("opening")
    try {
      const token = getToken()
      if (!token) { alert("로그인이 필요합니다."); return }
      const res = await fetch("/api/user/trade/positions", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ symbol: sym, direction: dir, leverage, amount, current_price: price }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { alert(data.error ?? `진입 실패 (${res.status})`); return }
      setBalance(data.newBalance)
      await fetchPositions()
      setDialogOpen(false)
    } finally {
      setOpeningId(null)
    }
  }, [fetchPositions])

  const handleClose = useCallback(async (id: string) => {
    const pos = positionsRef.current.find(p => p.id === id)
    if (!pos) return
    setClosingId(id)
    try {
      const token = getToken()
      if (!token) return
      const price = priceMapRef.current.get(pos.symbol) ?? 0
      const res = await fetch("/api/user/trade/positions", {
        method:  "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ position_id: id, current_price: price }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { alert(data.error ?? `청산 ���패 (${res.status})`); return }
      setBalance(data.newBalance)
      setPositions(prev => prev.filter(p => p.id !== id))
      setLogs(l => [{
        id:         Date.now().toString(),
        symbol:     pos.symbol,
        direction:  pos.direction,
        pnl:        data.pnl,
        closedAt:   Date.now(),
        entryPrice: Number(pos.entry_price),
        exitPrice:  data.exit_price,
      }, ...l])
      // 사이드바 통계 갱신 — bet_history DB 반영 후 fetch하도록 300ms 대기
      setTimeout(() => window.dispatchEvent(new Event("trade:refresh")), 300)
    } finally {
      setClosingId(null)
    }
  }, [])

  // ── 종목 선택 ─────────��────────���─────���───���─���─────��──────��────────
  // PC: 차트 변경만 (다이얼로그 열지 않음)
  const handlePcSelect = useCallback((symbol: string, price: number) => {
    priceMapRef.current.set(symbol, price)
    setSelectedSymbol(symbol)
    setSelectedPrice(price)
    selectedSymbolRef.current = symbol
    // PC에서도 dialogSymbol을 맞춰줘야 handleOpen이 올바른 심볼을 사��
    setDialogSymbol(symbol)
    dialogSymbolRef.current = symbol
  }, [])

  // PC/모바일 모두 ���이얼로그 방식으로 통일
  const handleMobileSelect = useCallback((symbol: string, price: number) => {
    priceMapRef.current.set(symbol, price)
    setSelectedSymbol(symbol)
    setDialogSymbol(symbol)
    setDialogPrice(price)
    dialogSymbolRef.current = symbol
    setDialogOpen(true)
  }, [])

  const totalPnl       = positions.reduce((sum, p) => sum + p.pnl, 0)
  const displayBalance = balance === null ? null : Math.floor(balance + totalPnl)

  const positionRows = positions.map(p => ({
    id:         p.id,
    symbol:     p.symbol,
    direction:  p.direction,
    entryPrice: p.entryPrice,
    leverage:   p.leverage,
    pnl:        p.pnl,
    pnlPct:     p.pnlPct,
    openedAt:   p.openedAt,
  }))

  return (
    <div className="min-h-screen font-sans"
      style={{ background: "radial-gradient(ellipse at 50% 30%,#0a1a10 0%,#060d09 60%,#040a06 100%)" }}>

      {/* ══════ 공통 Sticky 검색 + 카테고리 헤더 ══════ */}
      <div className="sticky top-0 z-40 border-b" style={{ background: "rgba(4,10,6,0.97)", borderColor: BORDER, backdropFilter: "blur(12px)" }}>
        <div className="max-w-7xl mx-auto px-4 pt-3 pb-2 space-y-2.5">
          {/* 검색바 + 우��� 버튼들 */}
          <div className="flex items-center gap-2">
            {/* ���색 입력 */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(255,255,255,0.3)" }} />
              <input
                type="text"
                placeholder="심볼 검색..."
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                className="w-full pl-9 pr-8 py-2 rounded-lg text-sm focus:outline-none"
                style={{
                  background: "rgba(255,255,255,0.05)",
                  border: `1px solid ${BORDER}`,
                  color: "rgba(255,255,255,0.8)",
                }}
              />
              {searchQ && (
                <button onClick={() => setSearchQ("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.3)" }} />
                </button>
              )}
            </div>

            {/* 정�� 순환 버튼 — 자동매매 탭일 때만 */}
            {tradeMode === "auto" && (
              <button
                onClick={cycleSort}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all shrink-0"
                style={{
                  background: sortOrder !== "time" ? `rgba(212,175,55,0.15)` : "rgba(255,255,255,0.05)",
                  border: `1px solid ${sortOrder !== "time" ? "rgba(212,175,55,0.4)" : BORDER}`,
                  color: sortOrder !== "time" ? GOLD : "rgba(255,255,255,0.5)",
                }}
              >
                {sortOrder === "time"     && <Clock        className="w-3.5 h-3.5" />}
                {sortOrder === "roi_desc" && <TrendingUp   className="w-3.5 h-3.5" />}
                {sortOrder === "roi_asc"  && <TrendingDown className="w-3.5 h-3.5" />}
                {sortOrder === "signal"   && <ArrowUpDown  className="w-3.5 h-3.5" />}
                {SORT_LABEL[sortOrder]}
              </button>
            )}

            {/* 알림 버튼 — 텔레그램 */}
            <a
              href="https://t.me/+HHv5pyuGGAw5YTc1"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-all"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: `1px solid ${BORDER}`,
                color: "rgba(255,255,255,0.5)",
              }}
            >
              <Bell className="w-3.5 h-3.5" />
              알림
            </a>
          </div>
          {/* 카테고리 탭 — 균등 배분 / 탭 순서: 모의매매 > 자동매매 > 매매기록 / 청산기록은 역삼1만 */}
          <div className="flex w-full gap-1.5">
            {([
              ...(allowMockTrade ? [{ key: "mock" as const,   label: "모의매매", Icon: LineChart }]  : []),
              { key: "auto"   as const, label: "자동매매", Icon: Bot },
              { key: "ledger" as const, label: "매매기록",  Icon: BookOpen },
              ...(userName === "역삼1" ? [{ key: "closed" as const, label: "청산기록", Icon: ListChecks }] : []),
            ]).map(({ key, label, Icon }) => (
              <button
                key={key}
                onClick={() => switchTab(key)}
                className="flex items-center justify-center gap-1 py-1.5 rounded-full text-xs font-semibold transition-all"
                style={{
                  flex: "1 1 0",
                  minWidth: 0,
                  ...(tradeMode === key ? {
                    background: GOLD,
                    color: "#000",
                  } : {
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.5)",
                    border: `1px solid ${BORDER}`,
                  })
                }}
              >
                <Icon className="w-3 h-3 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══════ 모바일 (lg 미만) ══════ */}
      <div className="lg:hidden" style={{ height: "calc(100dvh - 148px)", overflow: "hidden", position: "relative" }}>
        {/* LivePricesTab — 항상 mount (소켓 유지), 자동매매 탭에서는 숨김 */}
        <div style={{ position: "absolute", inset: 0, display: tradeMode === "mock" ? "block" : "none" }}>
          <LivePricesTab
            externalSearch={tradeMode === "mock" ? searchQ : ""}
            onSelect={handleMobileSelect}
            onPriceUpdate={(sym, price) => {
              priceMapRef.current.set(sym, price)
              if (sym === dialogSymbolRef.current) setDialogPrice(price)
              setPositions(prev => prev.map(p => {
                if (p.symbol !== sym || !p.entryPrice) return p
                const delta = p.direction === "long"
                  ? (price - p.entryPrice) / p.entryPrice
                  : (p.entryPrice - price) / p.entryPrice
                return { ...p, current_price: price, pnl: Math.round(p.amount * delta * p.leverage), pnlPct: delta * p.leverage * 100 }
              }))
            }}
            onClose={handleClose}
            closingId={closingId}
            selectedSymbol={dialogSymbol}
            positions={positionRows}
          />
        </div>
        {/* 자동매매: 날짜 스트립 + 포��션 */}
        <div style={{ position: "absolute", inset: 0, display: tradeMode === "auto" ? "flex" : "none", flexDirection: "column", background: PANEL_BG }}>
          <div style={{ flexShrink: 0 }}>
            <DateStrip key={tradeMode} selectedDate={selectedDate} onSelect={setSelectedDate} />
          </div>
          <div style={{ flex: "1 1 0", overflowY: "auto", scrollbarWidth: "none" }}>
              <AutoSignalPanel selectedDate={selectedDate} sortOrder={sortOrder} searchQ={tradeMode === "auto" ? searchQ : ""} onSlClosed={() => setClosedRefreshKey(k => k + 1)} onTodayPnl={setTodayAutoPnl} confirmedMargin={confirmedValue} userRole={userRole} />
          </div>
        </div>
        {/* 청산 기록 */}
        <div style={{ position: "absolute", inset: 0, display: tradeMode === "closed" ? "flex" : "none", flexDirection: "column", background: PANEL_BG, overflowY: "auto" }}>
          <ClosedPositionsPanel refreshKey={closedRefreshKey} tradeMode={tradeMode} selectedDate={selectedDate} onSelectDate={setSelectedDate} confirmedMargin={confirmedValue} />
        </div>
        {/* 매매기록 */}
        <div style={{ position: "absolute", inset: 0, display: tradeMode === "ledger" ? "flex" : "none", flexDirection: "column", background: PANEL_BG, overflow: "hidden" }}>
          <LedgerPanel tradeMode={tradeMode} userRole={userRole} userName={userName} todayAutoPnl={todayAutoPnl} onConfirmedValue={setConfirmedValue} />
        </div>
      </div>

      {/* ══����══ PC (lg 이상) ══���═══ */}
      <main className="hidden lg:block max-w-7xl mx-auto p-4">
        <div style={{ height: "calc(100vh - 172px)", position: "relative" }}>
          {/* LivePricesTab — 항상 mount (소켓 유지), 자동매매 탭에서는 숨김 */}
          <div className="rounded-2xl overflow-hidden h-full" style={{
            background: "#0a0b0f",
            border: `1px solid rgba(212,175,55,0.15)`,
            display: tradeMode === "mock" ? "block" : "none",
          }}>
            <LivePricesTab
              externalSearch={tradeMode === "mock" ? searchQ : ""}
              onSelect={handleMobileSelect}
              onPriceUpdate={(sym, price) => {
                priceMapRef.current.set(sym, price)
                if (sym === selectedSymbol) setSelectedPrice(price)
                setPositions(prev => prev.map(p => {
                  if (p.symbol !== sym || !p.entryPrice) return p
                  const delta = p.direction === "long"
                    ? (price - p.entryPrice) / p.entryPrice
                    : (p.entryPrice - price) / p.entryPrice
                  return { ...p, current_price: price, pnl: Math.round(p.amount * delta * p.leverage), pnlPct: delta * p.leverage * 100 }
                }))
              }}
              onClose={handleClose}
              closingId={closingId}
              selectedSymbol={selectedSymbol}
              positions={positionRows}
            />
          </div>
          {/* 자동매매: 날짜 스트립 + 포지션 전체 ���비 */}
          <div className="rounded-2xl flex flex-col h-full" style={{
            background: PANEL_BG,
            border: `1px solid ${BORDER}`,
            display: tradeMode === "auto" ? "flex" : "none",
          }}>
            <div style={{ flexShrink: 0 }}>
              <DateStrip key={tradeMode} selectedDate={selectedDate} onSelect={setSelectedDate} />
            </div>
            <div style={{ flex: "1 1 0", overflowY: "auto", scrollbarWidth: "none" }}>
            <AutoSignalPanel selectedDate={selectedDate} sortOrder={sortOrder} searchQ={tradeMode === "auto" ? searchQ : ""} onSlClosed={() => setClosedRefreshKey(k => k + 1)} onTodayPnl={setTodayAutoPnl} confirmedMargin={confirmedValue} userRole={userRole} />
            </div>
          </div>
          {/* 청산 기록 */}
          <div className="rounded-2xl flex flex-col h-full" style={{
            background: PANEL_BG,
            border: `1px solid ${BORDER}`,
            display: tradeMode === "closed" ? "flex" : "none",
            overflowY: "auto",
          }}>
            <ClosedPositionsPanel refreshKey={closedRefreshKey} tradeMode={tradeMode} selectedDate={selectedDate} onSelectDate={setSelectedDate} confirmedMargin={confirmedValue} />
          </div>
          {/* 매매기록 */}
          <div className="rounded-2xl flex flex-col h-full overflow-hidden" style={{
            background: PANEL_BG,
            border: `1px solid ${BORDER}`,
            display: tradeMode === "ledger" ? "flex" : "none",
          }}>
            <LedgerPanel tradeMode={tradeMode} userRole={userRole} userName={userName} todayAutoPnl={todayAutoPnl} onConfirmedValue={setConfirmedValue} />
          </div>
        </div>
      </main>

      {/* TradeDialog ��� 모바일/PC 공통 (PC에서는 LivePricesTab 클릭 시 열리지 않음) */}
      {dialogOpen && (
        <TradeDialog
          symbol={dialogSymbol}
          price={dialogPrice}
          balance={balance}
          onClose={() => setDialogOpen(false)}
          onOpen={handleOpen}
          isOpening={openingId !== null}
        />
      )}

      <style>{`
        @keyframes pulseDot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.6)} }
      `}</style>
    </div>
  )
}
