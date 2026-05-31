"use client"

import React, { useEffect, useRef, useState, useCallback } from "react"
import { supabaseBrowser } from "@/lib/supabase-browser"
import { usePriceWorker } from "@/hooks/use-price-worker"
import LivePricesTab, { liveCache } from "@/components/trade/live-prices-tab"
import SymbolChart from "@/components/trade/symbol-chart"
import { BarChart2, Wallet, X, TrendingUp, TrendingDown, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Search, Bot, LineChart, Clock, ArrowUpDown, Bell, ListChecks } from "lucide-react"

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
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const h   = now.getHours()
  const ampm = h < 12 ? "오전" : "오후"
  const h12  = h % 12 === 0 ? 12 : h % 12
  const mm   = String(now.getMinutes()).padStart(2, "0")
  const ss   = String(now.getSeconds()).padStart(2, "0")

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      {/* 깜빡이는 초록 점 */}
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
      </span>
      <span style={{
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

  // 마운트 시 오늘(맨 오른쪽)으로 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
    }
  }, [])

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

// ─── 모바일 주문 다이얼로그 ──────────────────────────────────────────
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
              <span className="text-xs" style={{ color: "rgba(212,175,55,0.6)" }}>사용 가능 잔고</span>
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
  closed_at: string | null
  close_reason: string | null
  closed_roi: number | null
  closed_price: number | null
}

function ClosedPositionsPanel({ refreshKey = 0 }: { refreshKey?: number }) {
  const [positions,   setPositions]   = useState<ClosedPos[]>([])
  const [loading,     setLoading]     = useState(true)
  const [stopLossPct, setStopLossPct] = useState<number | null>(null)
  const [sizeUsdCfg,  setSizeUsdCfg]  = useState<number>(10)
  const [, setTick] = useState(0)

  useEffect(() => {
    setLoading(true)
    fetch("/api/auto-signal/closed-positions?limit=100")
      .then(r => r.ok ? r.json() : { positions: [] })
      .then(d => setPositions(d.positions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [refreshKey])

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

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
      불러오는 중...
    </div>
  )
  if (positions.length === 0) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0", color: "rgba(255,255,255,0.3)", fontSize: 13 }}>
      청산 기록이 없습니다.
    </div>
  )

  return (
    <div>
      {/* 헤더 */}
      {(() => {
        const totalPnl = positions.reduce((sum, p) => {
          const lv  = Number(p.leverage ?? 1)
          const sl  = stopLossPct ?? 5
          // 모든 청산 건: SL이면 설정값 고정, 아닌 경우는 closed_roi 사용
          if (p.close_reason === "stop_loss") {
            return sum - (sizeUsdCfg * sl * lv / 100)
          }
          if (p.closed_roi == null) return sum
          return sum + Number(p.size_usd ?? sizeUsdCfg) * (Number(p.closed_roi) / 100)
        }, 0)
        // 승률: SL 청산은 무조건 손실, 나머지는 closed_roi > 0 여부
        const wins  = positions.filter(p =>
          p.close_reason !== "stop_loss" && p.closed_roi != null && Number(p.closed_roi) > 0
        ).length
        const total = positions.length
        return (
          <div style={{
            padding: "10px 14px 8px", borderBottom: `1px solid rgba(212,175,55,0.1)`,
          }}>
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 11, fontWeight: 700, color: GOLD }}>
                청산 기록 ({positions.length}건)
              </span>
              <div className="flex items-center gap-3">
                {total > 0 && (
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
                    승률 {wins}/{total} ({Math.round(wins / total * 100)}%)
                  </span>
                )}
                <span className="tabular-nums" style={{
                  fontSize: 12, fontWeight: 800,
                  color: totalPnl >= 0 ? UP_COLOR : DOWN_COLOR,
                }}>
                  {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )
      })()}
      {positions.map(pos => {
        const entry      = Number(pos.entry_price)
        const sym        = pos.symbol.replace(/\.P$/, "").replace(/\//g, "")
        const baseSymbol = pos.symbol.replace(/\.P$/, "").replace("USDT", "")
        const sizeUsd    = Number(pos.size_usd ?? 10)
        const lev        = Number(pos.leverage ?? 1)
        const closedAt   = pos.closed_at
          ? new Date(pos.closed_at).toLocaleString("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
          : "-"
        const reasonLabel: Record<string, string> = {
          manual:    "수동",
          stop_loss: "스탑로스",
          all:       "전체청산",
        }
        const reason = reasonLabel[pos.close_reason ?? ""] ?? pos.close_reason ?? "-"

        // ROI: 실시간 liveCache 가격으로 계속 계산
        const ticker  = liveCache.tickers.get(sym)
        const cur     = ticker ? ticker.price : 0
        const hasCur  = cur > 0 && entry > 0
        const delta   = hasCur
          ? (pos.direction === "long" ? (cur - entry) / entry : (entry - cur) / entry)
          : 0
        const liveRoi = hasCur ? delta * lev * 100 : null

        // % 표시: 실시간 값 사용
        const roi = liveRoi

        // PNL 금액: SL 청산이면 설정값 기준 고정 (-$5), 아니면 실시간 계산
        // size_usd × (stop_loss_pct × leverage / 100)
        // 예) 10불 × (5% × 10배 / 100) = -$5 고정
        const pnl = (() => {
          if (pos.close_reason === "stop_loss" && stopLossPct != null) {
            return -(sizeUsdCfg * (stopLossPct * lev / 100))
          }
          return liveRoi != null ? sizeUsd * (liveRoi / 100) : null
        })()

        const roiColor = roi == null ? "rgba(255,255,255,0.4)" : roi >= 0 ? UP_COLOR : DOWN_COLOR

        return (
          <div key={pos.id} style={{ padding: "10px 14px", borderBottom: `1px solid rgba(212,175,55,0.04)` }}>
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
                {roi != null && (
                  <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 800, color: roiColor }}>
                    {roi >= 0 ? "+" : ""}{roi.toFixed(2)}%
                  </span>
                )}
                <span style={{
                  padding: "1px 5px", borderRadius: 4, fontSize: 9, fontWeight: 700,
                  background: roi == null || roi >= 0 ? "rgba(255,255,255,0.06)" : "rgba(239,68,68,0.12)",
                  color: roi == null || roi >= 0 ? "rgba(255,255,255,0.4)" : "rgba(239,68,68,0.8)",
                }}>{reason}</span>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                {pnl != null && (
                  <span className="tabular-nums" style={{ fontSize: 12, fontWeight: 700, color: roiColor }}>
                    {pnl >= 0 ? "+" : ""}${pnl.toFixed(3)}
                  </span>
                )}
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}>{closedAt}</span>
              </div>
            </div>
            <div style={{ marginTop: 4, display: "flex", gap: 12, fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
              <span>진입: ${entry > 0 ? entry.toPrecision(5) : "-"}</span>
              {pos.closed_price != null && (
                <span>청산: ${Number(pos.closed_price).toPrecision(5)}</span>
              )}
              <span style={{ color: "rgba(255,255,255,0.25)" }}>{pos.signal_type}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── 자동매매 라이브 패널 ─────────────────────────────────────────────
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

  // 스탑로스 + 포지션당 금액 설정 조회 (마운트 시 1회)
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
      // 과거 날짜 — API에서 이미 계산된 종가 기준 값 사용
      const closePrice = Number(pos.close_price ?? 0)
      const finalPnl   = pos.final_pnl !== null && pos.final_pnl !== undefined ? Number(pos.final_pnl) : null
      const finalRoi   = pos.final_roi !== null && pos.final_roi !== undefined ? Number(pos.final_roi) : null
      const hasCur     = finalPnl !== null
      return {
        ...pos,
        sym,
        cur:     closePrice,
        hasCur,
        pnl:     finalPnl ?? 0,
        roi:     finalRoi ?? 0,
        delta:   0,
        isClose: true,  // 종가 기준 표시용
      }
    }

    const sizeUsd = pos.size_usd ?? 10
    const lev     = pos.leverage ?? 1

    // 스탑로스로 청산된 포지션: 실시간 % 계속 계산, PNL은 SL 고정값 사용
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

  // 활성 포지션만 (카드 목록 + 통계)
  const activeCalc  = posCalc.filter(p => !p.is_closed)
  const filteredCalc = searchQ
    ? activeCalc.filter(p => p.sym.toLowerCase().includes(searchQ.toLowerCase()))
    : activeCalc

  const activePnl  = activeCalc.reduce((s, p) => s + p.pnl, 0)
  const totalRoi   = activeCalc.length > 0 ? activeCalc.reduce((s, p) => s + p.roi, 0) / activeCalc.length : 0
  const profitCnt  = activeCalc.filter(p => p.roi > 0).length
  const lossCnt    = activeCalc.filter(p => p.roi < 0 && p.hasCur).length
  // 마진: 활성 포지션 수 × 설정상 포지션 금액
  const margin     = activeCalc.length * sizeUsdCfg

  // 스탑로스 청산 누적 — PNL은 반드시 설정값으로 계산 (DB closed_roi 무시)
  // 예) size_usd=10, stop_loss_pct=5, leverage=10 → 손실 = 10 × (5×10/100) = -$5
  const slClosed    = positions.filter(p => p.is_closed && p.close_reason === "stop_loss")
  const slClosedCnt = slClosed.length
  // 항상 설정값으로 계산 — DB closed_roi 절대 사용 안 함
  // size_usd(설정) × stop_loss_pct × leverage / 100 = 예) 10 × 5 × 10 / 100 = -$5/건
  const slClosedPnl = slClosed.reduce((s, p) => {
    const lev = Number(p.leverage ?? 1)
    const sl  = stopLossPct ?? 5  // settings 로드 전 임시 기본값
    return s - (sizeUsdCfg * sl * lev / 100)
  }, 0)

  // TOTAL PNL = 활성 PNL + 청산 PNL (진짜 잔고)
  const totalPnl   = activePnl + slClosedPnl
  const estValue   = margin + activePnl

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
              {posCalc.length}건 × $10
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>EST. VALUE</div>
            <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: estValue >= margin ? UP_COLOR : DOWN_COLOR }}>
              ${estValue.toFixed(2)}
            </div>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>
              MARGIN + PNL
            </div>
          </div>
        </div>
        {/* TOTAL ROI + TOTAL PNL + TOTAL CLOSE */}
        <div className="grid grid-cols-3 gap-2">
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>TOTAL ROI</div>
            <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: totalRoi >= 0 ? UP_COLOR : DOWN_COLOR }}>
              {totalRoi >= 0 ? "+" : ""}{totalRoi.toFixed(2)}%
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>TOTAL PNL</div>
            <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: totalPnl >= 0 ? UP_COLOR : DOWN_COLOR }}>
              {totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}
            </div>
            {slClosedCnt > 0 && (
              <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>
                청산 포함
              </div>
            )}
          </div>
          <div style={{ background: slClosedCnt > 0 ? "rgba(239,68,68,0.06)" : "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 10px" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontWeight: 600, marginBottom: 2 }}>TOTAL CLOSE</div>
            <div className="tabular-nums" style={{ fontSize: 14, fontWeight: 800, color: slClosedCnt === 0 ? "rgba(255,255,255,0.3)" : slClosedPnl >= 0 ? UP_COLOR : DOWN_COLOR }}>
              {slClosedCnt === 0 ? "-" : `${slClosedPnl >= 0 ? "+" : ""}$${slClosedPnl.toFixed(2)}`}
            </div>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.2)", marginTop: 1 }}>
              {slClosedCnt > 0 ? `SL 청산 ${slClosedCnt}건` : "스탑로스 청산 없음"}
            </div>
          </div>
        </div>
      </div>

      {posCalc.length === 0 && (
        <div className="py-6 text-center" style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
          이 날짜에 수신된 시그널이 없습니다.
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
  const [tradeMode,       setTradeMode]       = useState<"auto" | "closed" | "mock">("auto")
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
        alert(`[강제청산] ${p.symbol.replace("USDT","")} ${p.direction === "long" ? "롱" : "숏"} ${p.leverage}x 포지션이 강제청산 되었습니다.`)
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

  // ── 주문 핸들러 — ref ���용으로 stale closure 완전 차단 ──────────
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

  // ── 종목 선택 ────────────────────────────────────────────────────
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

  // PC/모바일 모두 다이얼로그 방식으로 통일
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
          {/* 검색바 + 우측 버튼들 */}
          <div className="flex items-center gap-2">
            {/* 검색 입력 */}
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

            {/* 정렬 순환 버튼 — 자동매매 탭일 때만 */}
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
          {/* 카테고리 탭 + 실시간 시계 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {([
                { key: "auto",   label: "자동매매", Icon: Bot },
                { key: "closed", label: "청산 기록", Icon: ListChecks },
                ...(allowMockTrade ? [{ key: "mock" as const, label: "모의매매", Icon: LineChart }] : []),
              ] as const).map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => setTradeMode(key)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all shrink-0"
                  style={tradeMode === key ? {
                    background: GOLD,
                    color: "#000",
                  } : {
                    background: "rgba(255,255,255,0.06)",
                    color: "rgba(255,255,255,0.5)",
                    border: `1px solid ${BORDER}`,
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {/* 실시간 시계 */}
            <LiveClock />
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
        {/* 자동매매: 날짜 스트립 + 포지션 */}
        <div style={{ position: "absolute", inset: 0, display: tradeMode === "auto" ? "flex" : "none", flexDirection: "column", background: PANEL_BG }}>
          <div style={{ flexShrink: 0 }}>
            <DateStrip selectedDate={selectedDate} onSelect={setSelectedDate} />
          </div>
          <div style={{ flex: "1 1 0", overflowY: "auto", scrollbarWidth: "none" }}>
            <AutoSignalPanel selectedDate={selectedDate} sortOrder={sortOrder} searchQ={tradeMode === "auto" ? searchQ : ""} onSlClosed={() => setClosedRefreshKey(k => k + 1)} />
          </div>
        </div>
        {/* 청산 기록 */}
        <div style={{ position: "absolute", inset: 0, display: tradeMode === "closed" ? "flex" : "none", flexDirection: "column", background: PANEL_BG, overflowY: "auto" }}>
          <ClosedPositionsPanel refreshKey={closedRefreshKey} />
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
          {/* 자동매매: 날짜 스트립 + 포지션 전체 너비 */}
          <div className="rounded-2xl flex flex-col h-full" style={{
            background: PANEL_BG,
            border: `1px solid ${BORDER}`,
            display: tradeMode === "auto" ? "flex" : "none",
          }}>
            <div style={{ flexShrink: 0 }}>
              <DateStrip selectedDate={selectedDate} onSelect={setSelectedDate} />
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
            <ClosedPositionsPanel refreshKey={closedRefreshKey} />
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
