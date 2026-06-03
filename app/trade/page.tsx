"use client"

import React, { useEffect, useRef, useState, useCallback } from "react"
import { supabaseBrowser } from "@/lib/supabase-browser"
import { usePriceWorker } from "@/hooks/use-price-worker"
import LivePricesTab, { liveCache } from "@/components/trade/live-prices-tab"
import SymbolChart from "@/components/trade/symbol-chart"
import { BarChart2, Wallet, X, TrendingUp, TrendingDown, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Search, Bot, LineChart, Clock, ArrowUpDown, Bell, ListChecks, BookOpen } from "lucide-react"

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
function LiveClock() {
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
    <div className="flex items-center gap-1.5 shrink-0">
      {/* 깜빡이는 초록 점 */}
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
      </span>
      <span suppressHydrationWarning style={{
        fontSize: 13,
        fontWeight: 600,
        color: "rgba(255,255,255,0.75)",
        fontVariantNumeric: "tabular-nums",
        letterSpacing: "0.03em",
      }}>
        {ampm} {String(h12).padStart(2, "0")}:{mm}:{ss}
      </span>
    </div>
  )
}

function DateStrip({ selectedDate, onSelect }: { selectedDate: Date; onSelect: (d: Date) => void }) {
  const today = new Date()
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

function ClosedPositionsPanel({ refreshKey = 0, tradeMode }: { refreshKey?: number; tradeMode: string }) {
  const [positions,    setPositions]   = useState<ClosedPos[]>([])
  const [loading,      setLoading]     = useState(true)
  const [stopLossPct,  setStopLossPct] = useState<number | null>(null)
  const [sizeUsdCfg,   setSizeUsdCfg]  = useState<number>(10)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [, setTick] = useState(0)

  const dateStr  = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,"0")}-${String(selectedDate.getDate()).padStart(2,"0")}`
  const todayStr = (() => { const n = new Date(); return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}` })()
  // 오늘: 모든 청산 포지션(SL 포함) → liveCache 실시간 계산
  // 과거: final_roi(Klines 종가) → closed_roi(DB) 사용
  const isToday  = dateStr === todayStr

  useEffect(() => {
    setLoading(true)
    // positions API 사용: 해당 날짜의 모든 포지션 (stop_loss + day_close 포함)
    // is_historical=true 시 final_roi/final_pnl이 서버에서 계산돼 내려옴
    fetch(`/api/auto-signal/positions?date=${dateStr}`)
      .then(r => r.ok ? r.json() : { positions: [] })
      .then(d => {
        // 청산 기록 탭: is_closed=true인 포지션만 표시
        const all = d.positions ?? []
        setPositions(all.filter((p: ClosedPos) => p.is_closed === true))
      })
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
        const cnt    = positions.length
        const margin = cnt * sizeUsdCfg
        const slCnt  = positions.filter(p => p.close_reason === "stop_loss").length
        // 포지션별 실제 PNL: size_usd × closed_roi / 100
        // SL도 closed_roi가 있으면 그 값 사용, 없으면 -(stop_loss_pct × leverage) 폴백
        // 오늘: liveCache 실시간 우선 (SL 포함 전체)
        // 과거: final_roi(Klines) → closed_roi(DB) → liveCache 폴백
        const perPnl = positions.map(p => {
          const entry  = Number(p.entry_price)
          const symKey = p.symbol.replace(/\.P$/, "").replace(/\//g, "")
          const cur    = liveCache.tickers.get(symKey)?.price ?? 0
          const lev    = Number(p.leverage ?? 10)
          const sz     = Number(p.size_usd ?? sizeUsdCfg)
          let roi: number
          if (isToday && cur > 0 && entry > 0) {
            // 오늘: 항상 실시간 가격으로 계산
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
        const estValue = margin + totalPnl
        const wins     = positions.filter(p =>
          p.close_reason !== "stop_loss" && p.closed_roi != null && Number(p.closed_roi) > 0
        ).length
        return (
          <div style={{ padding: "8px 12px", borderBottom: `1px solid rgba(212,175,55,0.1)`, flexShrink: 0 }}>
            {/* 타이틀 + 승률 */}
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: GOLD }}>
                청산 기록 ({cnt}건)
              </span>
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
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>{cnt}건 × ${sizeUsdCfg}</div>
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

function LedgerPanel({ tradeMode }: { tradeMode: string }) {
  const [records,      setRecords]      = useState<LedgerRecord[]>([])
  const [loading,      setLoading]      = useState(true)
  const [seedCapital,  setSeedCapital]  = useState(640)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [isMaster,     setIsMaster]     = useState(false)
  // 입력 폼 상태
  const [inputPnl,  setInputPnl]  = useState("")
  const [inputNote, setInputNote] = useState("")
  const [saving,    setSaving]    = useState(false)
  const [saveMsg,   setSaveMsg]   = useState<string | null>(null)

  const MASTER_ROLES = ["master", "admin"]
  const dateStr = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth()+1).padStart(2,"0")}-${String(selectedDate.getDate()).padStart(2,"0")}`

  const load = () => {
    setLoading(true)
    Promise.all([
      fetch("/api/auto-signal/rebalance", { credentials: "include" }).then(r => r.ok ? r.json() : { records: [] }),
      fetch("/api/auto-signal/settings").then(r => r.ok ? r.json() : null),
      fetch("/api/auth/me", { credentials: "include" }).then(r => r.ok ? r.json() : { role: null }),
    ]).then(([ledger, cfg, me]) => {
      setRecords(ledger.records ?? [])
      setIsMaster(MASTER_ROLES.includes(me.role ?? ""))
      if (cfg?.seed_capital != null) setSeedCapital(Number(cfg.seed_capital))
    }).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  // 날짜가 바뀌면 입력창을 해당 날짜 기존 값으로 채움
  useEffect(() => {
    const rec = records.find(r => r.date_label === dateStr)
    setInputPnl(rec ? String(rec.daily_pnl) : "")
    setInputNote(rec?.note ?? "")
    setSaveMsg(null)
  }, [dateStr, records])

  // 전체 누적 요약 (date_label 오름차순)
  const sorted      = [...records].sort((a, b) => a.date_label.localeCompare(b.date_label))
  const firstSeed   = sorted.length > 0 ? Number(sorted[0].seed_capital) : seedCapital
  const latestValue = sorted.length > 0 ? Number(sorted[sorted.length - 1].est_value) : seedCapital
  const totalPnl    = latestValue - firstSeed
  const totalRoi    = firstSeed > 0 ? (totalPnl / firstSeed) * 100 : 0

  // 선택 날짜 기존 기록
  const existing = records.find(r => r.date_label === dateStr)

  const handleSave = async () => {
    const pnl = parseFloat(inputPnl)
    if (isNaN(pnl)) { setSaveMsg("수익을 숫자로 입력해주세요."); return }
    setSaving(true); setSaveMsg(null)
    try {
      const res = await fetch("/api/auto-signal/rebalance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ date_label: dateStr, daily_pnl: pnl, note: inputNote }),
      })
      const json = await res.json()
      if (!res.ok) { setSaveMsg(json.error ?? "저장 실패"); return }
      setSaveMsg("저장됐습니다.")
      load()
    } catch { setSaveMsg("저장 실패") } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm("삭제하시겠습니까?")) return
    await fetch(`/api/auto-signal/rebalance?id=${id}`, { method: "DELETE", credentials: "include" })
    load()
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* 날짜 스트립 */}
      <DateStrip key={tradeMode} selectedDate={selectedDate} onSelect={setSelectedDate} />

      {/* 전체 요약 */}
      <div style={{ padding: "10px 14px 0", flexShrink: 0 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: GOLD }}>
            매매기록 ({records.length}일)
          </span>
          <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 800, color: totalPnl >= 0 ? UP_COLOR : DOWN_COLOR }}>
            {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
            <span style={{ fontSize: 9, fontWeight: 400, color: "rgba(255,255,255,0.3)", marginLeft: 4 }}>
              ({totalRoi >= 0 ? "+" : ""}{totalRoi.toFixed(2)}%)
            </span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-2" style={{ marginBottom: 10 }}>
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>초기 시드</div>
            <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: "rgba(255,255,255,0.85)" }}>
              ${firstSeed.toFixed(2)}
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>현재 잔고</div>
            <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: totalPnl >= 0 ? UP_COLOR : DOWN_COLOR }}>
              ${latestValue.toFixed(2)}
            </div>
          </div>
        </div>
      </div>

      {/* 날짜별 수익 입력 — 마스터 계정만 표시 */}
      {isMaster && <div style={{
        margin: "0 14px 10px",
        padding: "12px 14px",
        borderRadius: 10,
        border: `1px solid rgba(212,175,55,0.15)`,
        background: "rgba(212,175,55,0.04)",
        flexShrink: 0,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: GOLD, marginBottom: 10 }}>
          {`${selectedDate.getMonth()+1}월 ${selectedDate.getDate()}일`} 수익 입력
          {existing && (
            <span style={{ marginLeft: 6, fontSize: 9, color: "rgba(255,255,255,0.3)", fontWeight: 400 }}>기록 있음 — 덮어씁니다</span>
          )}
        </div>
        {/* PNL 입력 */}
        <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", width: 36, flexShrink: 0 }}>수익</span>
          <div className="flex items-center" style={{
            flex: 1, background: "rgba(255,255,255,0.06)", borderRadius: 6,
            border: "1px solid rgba(255,255,255,0.08)", padding: "5px 8px",
          }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", marginRight: 4 }}>$</span>
            <input
              type="number"
              value={inputPnl}
              onChange={e => setInputPnl(e.target.value)}
              placeholder="0.00  (손실은 음수)"
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.9)",
                fontVariantNumeric: "tabular-nums",
              }}
            />
          </div>
        </div>
        {/* 메모 입력 */}
        <div className="flex items-center gap-2" style={{ marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", width: 36, flexShrink: 0 }}>메모</span>
          <input
            type="text"
            value={inputNote}
            onChange={e => setInputNote(e.target.value)}
            placeholder="선택 입력"
            style={{
              flex: 1, background: "rgba(255,255,255,0.06)", borderRadius: 6,
              border: "1px solid rgba(255,255,255,0.08)", padding: "5px 8px",
              fontSize: 12, color: "rgba(255,255,255,0.7)", outline: "none",
            }}
          />
        </div>
        {/* 저장 버튼 */}
        <div className="flex items-center justify-between">
          <span style={{ fontSize: 10, color: saveMsg?.includes("저장") ? UP_COLOR : "rgba(239,68,68,0.8)" }}>
            {saveMsg ?? ""}
          </span>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: "6px 18px", borderRadius: 20, fontSize: 11, fontWeight: 700,
              background: saving ? "rgba(212,175,55,0.3)" : GOLD,
              color: "#000", border: "none", cursor: saving ? "default" : "pointer",
            }}
          >
            {saving ? "저장 중..." : existing ? "수정" : "저장"}
          </button>
        </div>
      </div>}

      {/* 기록 목록 */}
      <div style={{ flex: "1 1 0", overflowY: "auto", scrollbarWidth: "none" }}>
        {loading ? (
          <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 12 }}>로딩 중...</div>
        ) : sorted.length === 0 ? (
          <div style={{ padding: 24, textAlign: "center", color: "rgba(255,255,255,0.3)", fontSize: 12 }}>
            매매 시작일은 5월 31일입니다.
          </div>
        ) : [...sorted].reverse().map((rec) => {
          const pnl      = Number(rec.daily_pnl)
          const seed     = Number(rec.seed_capital)
          const estVal   = Number(rec.est_value)
          const roi      = seed > 0 ? (pnl / seed) * 100 : 0
          const pnlColor = pnl >= 0 ? UP_COLOR : DOWN_COLOR
          const [yy, mm, dd] = rec.date_label.split("-")
          const label    = `${parseInt(mm)}월 ${parseInt(dd)}일`

          return (
            <div key={rec.id} style={{
              padding: "10px 14px",
              borderBottom: `1px solid rgba(212,175,55,0.04)`,
              display: "flex", justifyContent: "space-between", alignItems: "center",
              background: rec.date_label === dateStr ? "rgba(212,175,55,0.04)" : undefined,
            }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
                  {label}
                  {rec.note && (
                    <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 400, color: "rgba(255,255,255,0.3)" }}>
                      {rec.note}
                    </span>
                  )}
                </div>
                <div style={{ marginTop: 2, fontSize: 10, color: "rgba(255,255,255,0.3)" }}>
                  시드 ${seed.toFixed(2)} → 잔고 ${estVal.toFixed(2)}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div style={{ textAlign: "right" }}>
                  <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: pnlColor }}>
                    {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                  </div>
                  <div className="tabular-nums" style={{ fontSize: 10, color: pnl >= 0 ? "rgba(34,197,94,0.6)" : "rgba(239,68,68,0.6)" }}>
                    {roi >= 0 ? "+" : ""}{roi.toFixed(2)}%
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(rec.id)}
                  style={{
                    width: 20, height: 20, borderRadius: 4, border: "none",
                    background: "rgba(239,68,68,0.12)", color: "rgba(239,68,68,0.6)",
                    fontSize: 11, cursor: "pointer", flexShrink: 0,
                  }}
                >×</button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── 자동매매 라이브 패널 ────────────��──────────────────────────────��─
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

function AutoSignalPanel({ selectedDate, sortOrder = "time", searchQ = "", onSlClosed }: {
  selectedDate: Date
  sortOrder?: "time" | "roi_desc" | "roi_asc" | "signal"
  searchQ?: string
  onSlClosed?: () => void
}) {
  const [positions,     setPositions]     = useState<AutoPos[]>([])
  const [isHistorical,  setIsHistorical]  = useState(false)
  const [loading,       setLoading]       = useState(true)
  const [, setTick]       = useState(0)
  const [stopLossPct,   setStopLossPct]  = useState<number | null>(null)
  const [sizeUsdCfg,    setSizeUsdCfg]   = useState<number>(10)
  const [seedCapital,   setSeedCapital]  = useState<number>(640)
  const closingRef = useRef<Set<string>>(new Set())

  // KST 기준 오늘 날짜
  const todayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)

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
        if (pos.is_closed) return  // 이미 청산된 포지션은 재트리거 방지
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
            // 서버가 반환한 고정 ROI 사용 (SL 임계값 고정, 예: -50%)
            const json = await r.json().catch(() => ({}))
            const fixedRoi = json.closed_roi ?? roi
            setPositions(prev => prev.map(p =>
              p.id === pos.id
                ? { ...p, is_closed: true, close_reason: "stop_loss", closed_roi: fixedRoi, closed_price: cur }
                : p
            ))
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
  // - 오늘: liveCache 실시간 가격으로 PnL 계산
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

    // 스탑���스로 청산된 포지션: 실시간 % 계속 계산, PNL은 SL 고정값 사용
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

  const totalRoi  = statsCalc.length > 0 ? statsCalc.reduce((s, p) => s + p.roi, 0) / statsCalc.length : 0
  const profitCnt = statsCalc.filter(p => p.roi > 0).length
  const lossCnt   = statsCalc.filter(p => p.roi < 0).length
  // 마진: 해당 날짜 포지션 수 × 포지션 금액
  const margin = statsCalc.length * sizeUsdCfg

  // SL 청산 (오늘: 고정값 PNL / 과거: final_roi가 이미 포함돼 있으므로 별도 계산 불필요)
  const slClosed    = positions.filter(p => p.is_closed && p.close_reason === "stop_loss")
  const slClosedCnt = isHistorical ? slClosed.length : slClosed.length
  const slClosedPnl = isHistorical
    ? statsCalc.filter(p => p.is_closed && p.close_reason === "stop_loss").reduce((s, p) => s + p.pnl, 0)
    : slClosed.reduce((s, p) => s - (Number(p.size_usd ?? sizeUsdCfg) * (stopLossPct ?? 5) * Number(p.leverage ?? 10) / 100), 0)

  // TOTAL PNL = 전체 포지션 PNL 합산 (과거: final_roi 기준 / 오늘: 활성PNL + SL고정)
  const activePnl = isHistorical
    ? statsCalc.reduce((s, p) => s + p.pnl, 0)
    : margin * (totalRoi / 100)
  const totalPnl = isHistorical ? activePnl : activePnl + slClosedPnl

  // EST. VALUE = 마진 + TOTAL PNL
  const estValue = margin + totalPnl

  const sortedCalc = [...filteredCalc].sort((a, b) => {
    if (sortOrder === "roi_desc") return b.roi - a.roi
    if (sortOrder === "roi_asc")  return a.roi - b.roi
    if (sortOrder === "signal")   return (a.signal_type ?? "").localeCompare(b.signal_type ?? "")
    // "time" — 기본: 수신 시각 내림차순 (id 기준)
    return 0
  })

  if (loading) return (
    <div className="flex items-center justify-center py-5"
      style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>로딩 중...</div>
  )

  return (
    <div>
      {/* 요약 헤더 */}
      <div className="px-4 py-3" style={{ borderBottom: `1px solid rgba(212,175,55,0.08)` }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <span style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>{dateLabel} 자동매매</span>
            {isHistorical && (
              <span style={{
                fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4,
                background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.35)",
              }}>종가 기준</span>
            )}
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
              {activeCalc.length}건 × ${sizeUsdCfg}
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
          이 날짜에 ���신된 시그널이 없습니다.
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
              <div className="text-right">
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
            </div>
            {/* 하단행: 진입가 | 현재가(오늘) 또는 종가(과거) | 시그널 */}
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
  const [selectedDate,  setSelectedDate]  = useState(new Date())
  const [tradeMode,       setTradeMode]       = useState<"auto" | "closed" | "ledger" | "mock">("auto")

  // 탭 전환 시 날짜를 오늘로 리셋 → DateStrip이 맨 오른쪽으로 스크롤
  const switchTab = (mode: "auto" | "closed" | "ledger" | "mock") => {
    setSelectedDate(new Date())
    setTradeMode(mode)
  }
  const [closedRefreshKey, setClosedRefreshKey] = useState(0)
  const [allowMockTrade, setAllowMockTrade] = useState(false)
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

  // 모의매매 허용 여부 조회 (마운트 시 1회)
  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetch("/api/user/profile", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const allowed = !!d?.profile?.allow_mock_trade
        setAllowMockTrade(allowed)
        if (!allowed) setTradeMode("auto")
      })
      .catch(() => {})
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
    // 클라이언트 WebSocket 가격을 쿼리로 전달 — 서버가 Binance 조회 없이 PnL 계산
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
        alert(`[강제청산] ${p.symbol.replace("USDT","")} ${p.direction === "long" ? "롱" : "숏"} ${p.leverage}x 포지션이 강제��산 되었습니다.`)
      )
    }

    const open = d.positions.filter((p: any) => !p.liquidated)
    setPositions(open.map((p: any) => {
      const entry   = Number(p.entry_price)
      const margin  = Number(p.margin)
      const lev     = Number(p.leverage)
      // 서버가 PnL 0을 반환하면 클라이언트 가격으로 직접 계산
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
    // 폴링(3초) 완전 제거 → Vercel Function 호출 ~97% 감소
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

  // ── 주문 ���들러 — ref ���용으로 stale closure 완전 차단 ──────────
  const handleOpen = useCallback(async (dir: Direction, amount: number, leverage: number) => {
    const bal = balanceRef.current
    if (bal === null) { alert("잔고를 불러오는 중입니다."); return }
    if (amount <= 0 || amount > bal) { alert("잔고가 부족합니다."); return }

    // dialogSymbolRef: 다이얼로그에서 호출 시 항상 올바른 심볼을 가리킴
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
      if (!res.ok) { alert(data.error ?? `청산 실패 (${res.status})`); return }
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

  // ── 종목 선택 ─────────��──────────────���──────────────────��────────
  // PC: 차트 변경만 (다이얼로그 열지 않음)
  const handlePcSelect = useCallback((symbol: string, price: number) => {
    priceMapRef.current.set(symbol, price)
    setSelectedSymbol(symbol)
    setSelectedPrice(price)
    selectedSymbolRef.current = symbol
    // PC에서도 dialogSymbol을 맞춰줘야 handleOpen이 올바른 심볼을 사용
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
          {/* 실시간 시계 — 탭바 위 */}
          <div className="flex justify-end" style={{ marginBottom: 4 }}>
            <LiveClock />
          </div>
          {/* 카테고리 탭 — 균등 25% */}
          <div className="flex w-full gap-1.5">
            {([
              { key: "auto",   label: "자동매매", Icon: Bot },
              { key: "closed", label: "청산 기록", Icon: ListChecks },
              { key: "ledger", label: "매매기록",  Icon: BookOpen },
              ...(allowMockTrade ? [{ key: "mock" as const, label: "모의매매", Icon: LineChart }] : []),
            ] as const).map(({ key, label, Icon }) => (
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
            <AutoSignalPanel selectedDate={selectedDate} sortOrder={sortOrder} searchQ={tradeMode === "auto" ? searchQ : ""} onSlClosed={() => setClosedRefreshKey(k => k + 1)} />
          </div>
        </div>
        {/* 청산 기록 */}
        <div style={{ position: "absolute", inset: 0, display: tradeMode === "closed" ? "flex" : "none", flexDirection: "column", background: PANEL_BG, overflowY: "auto" }}>
          <ClosedPositionsPanel refreshKey={closedRefreshKey} tradeMode={tradeMode} />
        </div>
        {/* 매매기록 */}
        <div style={{ position: "absolute", inset: 0, display: tradeMode === "ledger" ? "flex" : "none", flexDirection: "column", background: PANEL_BG }}>
          <LedgerPanel tradeMode={tradeMode} />
        </div>
      </div>

      {/* ══════ PC (lg 이상) ══════ */}
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
              <AutoSignalPanel selectedDate={selectedDate} sortOrder={sortOrder} searchQ={tradeMode === "auto" ? searchQ : ""} onSlClosed={() => setClosedRefreshKey(k => k + 1)} />
            </div>
          </div>
          {/* 청산 기록 */}
          <div className="rounded-2xl flex flex-col h-full" style={{
            background: PANEL_BG,
            border: `1px solid ${BORDER}`,
            display: tradeMode === "closed" ? "flex" : "none",
            overflowY: "auto",
          }}>
            <ClosedPositionsPanel refreshKey={closedRefreshKey} tradeMode={tradeMode} />
          </div>
          {/* 매매기록 */}
          <div className="rounded-2xl flex flex-col h-full" style={{
            background: PANEL_BG,
            border: `1px solid ${BORDER}`,
            display: tradeMode === "ledger" ? "flex" : "none",
          }}>
            <LedgerPanel tradeMode={tradeMode} />
          </div>
        </div>
      </main>

      {/* TradeDialog — 모바일/PC 공통 (PC에서는 LivePricesTab 클릭 시 열리지 않음) */}
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
