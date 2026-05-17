"use client"

import React, { useEffect, useRef, useState, useCallback } from "react"
import { supabaseBrowser } from "@/lib/supabase-browser"
import { usePriceWorker } from "@/hooks/use-price-worker"
import LivePricesTab, { liveCache } from "@/components/trade/live-prices-tab"
import SymbolChart from "@/components/trade/symbol-chart"
import { BarChart2, Wallet, X, TrendingUp, TrendingDown, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Search, Bot, LineChart } from "lucide-react"

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
function DateStrip({ selectedDate, onSelect }: { selectedDate: Date; onSelect: (d: Date) => void }) {
  const today = new Date()
  // 현재 주 월요일 기준 7일
  const startOfWeek = new Date(today)
  const dow = today.getDay() // 0=일
  startOfWeek.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))

  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(startOfWeek)
    d.setDate(startOfWeek.getDate() + i)
    days.push(d)
  }

  const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"]
  const isSame = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  const year  = today.getFullYear()
  const month = today.getMonth() + 1

  return (
    <div className="px-4 py-2" style={{ borderBottom: `1px solid rgba(212,175,55,0.08)` }}>
      <div className="flex items-center justify-between mb-1.5">
        <span style={{ fontSize: 11, color: "rgba(212,175,55,0.5)", fontWeight: 600 }}>
          {year}년 {month}월
        </span>
        <button style={{ fontSize: 10, color: "rgba(212,175,55,0.35)" }}>오늘</button>
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {days.map((d, i) => {
          const isSun = d.getDay() === 0
          const isSat = d.getDay() === 6
          const isToday = isSame(d, today)
          const isSel   = isSame(d, selectedDate)
          return (
            <button key={i} onClick={() => onSelect(d)}
              className="flex flex-col items-center gap-0.5 py-1 rounded-xl transition-all"
              style={{
                background: isSel ? "rgba(212,175,55,0.15)" : "transparent",
                border: `1px solid ${isSel ? "rgba(212,175,55,0.4)" : "transparent"}`,
              }}>
              <span style={{
                fontSize: 9, fontWeight: 600,
                color: isSat ? "#3b82f6" : isSun ? "#ef4444" : "rgba(255,255,255,0.3)",
              }}>{DAY_KO[d.getDay()]}</span>
              <span style={{
                fontSize: 14, fontWeight: 700,
                color: isToday ? GOLD : isSel ? "rgba(212,175,55,0.85)" : "rgba(255,255,255,0.7)",
                width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
                borderRadius: "50%",
                background: isToday && !isSel ? "rgba(212,175,55,0.12)" : "transparent",
                border: isToday ? `1.5px solid rgba(212,175,55,0.4)` : "1.5px solid transparent",
              }}>{d.getDate()}</span>
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
// ─── 자동매매 라이브 패널 ─────────────────────────────────────────────
interface AutoPos {
  id:          string
  signal_type: string
  symbol:      string
  direction:   string
  entry_price: number
  size_usd:    number
  leverage:    number
  signal_time: string
  date_label:  string
  is_closed:   boolean
}

function AutoSignalPanel({ selectedDate }: { selectedDate: Date }) {
  const [positions, setPositions] = useState<AutoPos[]>([])
  const [loading,   setLoading]   = useState(true)
  // 1초마다 강제 리렌더 — liveCache에서 최신 가격 읽기
  const [, setTick] = useState(0)

  const dateKey = [
    selectedDate.getFullYear(),
    String(selectedDate.getMonth() + 1).padStart(2, "0"),
    String(selectedDate.getDate()).padStart(2, "0"),
  ].join("-")

  const fetchPositions = useCallback(() => {
    fetch(`/api/auto-signal/positions?date=${dateKey}`)
      .then(r => r.ok ? r.json() : { positions: [] })
      .then(d => setPositions(d.positions ?? []))
      .finally(() => setLoading(false))
  }, [dateKey])

  useEffect(() => {
    setLoading(true)
    fetchPositions()
    const refresh = setInterval(fetchPositions, 30_000)
    return () => clearInterval(refresh)
  }, [fetchPositions])

  // 1초 tick → liveCache.tickers에서 최신 가격 re-read
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [])

  const dateLabel = `${selectedDate.getMonth() + 1}월 ${selectedDate.getDate()}일`

  // 심볼 정규화: JCTUSDT.P → JCTUSDT
  const normalize = (raw: string) => raw.replace(/\.P$/, "").replace(/\//g, "")

  // 통계 계산
  const posCalc = positions.map(pos => {
    const sym    = normalize(pos.symbol)
    const ticker = liveCache.tickers.get(sym)
    const cur    = ticker?.price ?? 0
    const entry  = Number(pos.entry_price)
    const hasCur = cur > 0 && entry > 0
    const delta  = hasCur
      ? (pos.direction === "long" ? (cur - entry) / entry : (entry - cur) / entry)
      : 0
    const roi = delta * pos.leverage * 100
    const pnl = pos.size_usd * delta * pos.leverage
    return { ...pos, cur, hasCur, delta, roi, pnl, sym }
  })

  const totalPnl   = posCalc.reduce((s, p) => s + p.pnl, 0)
  const totalRoi   = posCalc.length > 0 ? posCalc.reduce((s, p) => s + p.roi, 0) / posCalc.length : 0
  const profitCnt  = posCalc.filter(p => p.roi > 0).length
  const lossCnt    = posCalc.filter(p => p.roi <= 0 && p.hasCur).length
  // 포지션 1개당 $10 마진
  const margin     = posCalc.length * 10
  const estValue   = margin + totalPnl

  if (loading) return (
    <div className="flex items-center justify-center py-5"
      style={{ fontSize: 11, color: "rgba(255,255,255,0.3)" }}>로딩 중...</div>
  )

  return (
    <div>
      {/* 요약 헤더 */}
      <div className="px-4 py-3" style={{ borderBottom: `1px solid rgba(212,175,55,0.08)` }}>
        <div className="flex items-center justify-between mb-2">
          <span style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>{dateLabel} 자동매매</span>
          <div className="flex items-center gap-3">
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>
              수익 <span style={{ color: UP_COLOR, fontWeight: 700 }}>{profitCnt}</span>
              {" / "}손실 <span style={{ color: DOWN_COLOR, fontWeight: 700 }}>{lossCnt}</span>
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
        {/* TOTAL ROI + TOTAL PNL */}
        <div className="grid grid-cols-2 gap-2">
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
          </div>
        </div>
      </div>

      {posCalc.length === 0 && (
        <div className="py-6 text-center" style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>
          이 날짜에 수신된 시그널이 없습니다.
        </div>
      )}

      {posCalc.map(pos => {
        const roiColor = pos.roi >= 0 ? UP_COLOR : DOWN_COLOR
        const inTime   = new Date(pos.signal_time).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })
        const baseSymbol = pos.symbol.replace(/\.P$/, "").replace("USDT", "")

        return (
          <div key={pos.id} style={{ padding: "10px 14px", borderBottom: `1px solid rgba(212,175,55,0.05)` }}>
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
              </div>
              <div className="text-right">
                <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>IN:{inTime}</div>
                {pos.hasCur && (
                  <div className="tabular-nums" style={{ fontSize: 13, fontWeight: 800, color: roiColor }}>
                    {pos.pnl >= 0 ? "+" : ""}${pos.pnl.toFixed(3)}
                  </div>
                )}
              </div>
            </div>
            {/* 하단행: 진입가 | 현재가 | 시그널 */}
            <div className="flex items-center gap-3 mt-0.5" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
              <span>
                진입:{" "}
                <span className="tabular-nums" style={{ color: "rgba(255,255,255,0.55)" }}>
                  ${fmt(Number(pos.entry_price))}
                </span>
              </span>
              {pos.hasCur && (
                <span>
                  현재:{" "}
                  <span className="tabular-nums" style={{ color: pos.roi >= 0 ? "rgba(34,197,94,0.8)" : "rgba(239,68,68,0.8)" }}>
                    ${fmt(pos.cur)}
                  </span>
                </span>
              )}
              {!pos.hasCur && (
                <span style={{ color: "rgba(255,255,255,0.2)" }}>가격 수신 대기중...</span>
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
  const [tradeMode,     setTradeMode]     = useState<"auto" | "mock">("auto")
  const [searchQ,       setSearchQ]       = useState("")

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

  // ── 주문 핸들러 — ref 사용으로 stale closure 완전 차단 ──────────
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
          {/* 검색바 */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "rgba(255,255,255,0.3)" }} />
            <input
              type="text"
              placeholder="심볼 검색... (예: BTC, ETH)"
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
          {/* 카테고리 탭 */}
          <div className="flex items-center gap-2 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
            {([
              { key: "auto", label: "자동매매", Icon: Bot },
              { key: "mock", label: "모의매매", Icon: LineChart },
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
        </div>
      </div>

      {/* ══════ 모바일 (lg 미만): 시세 목록 + 날짜/자동매매 ══════ */}
      <div className="lg:hidden flex flex-col" style={{ height: "calc(100dvh - 148px)" }}>
        {/* 시세 목록 */}
        <div style={{ flex: "0 0 50%", overflow: "hidden" }}>
          <LivePricesTab
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
        {/* 하단: 자동매매 or 모의매매 */}
        <div className="flex flex-col" style={{ flex: "1 1 0", overflow: "hidden", background: PANEL_BG, borderTop: `1px solid ${BORDER}` }}>
          {tradeMode === "auto" ? (
            <>
              <div style={{ flexShrink: 0 }}>
                <DateStrip selectedDate={selectedDate} onSelect={setSelectedDate} />
              </div>
              <div style={{ flex: "1 1 0", overflowY: "auto", scrollbarWidth: "none" }}>
                <AutoSignalPanel selectedDate={selectedDate} />
              </div>
            </>
          ) : (
            <div style={{ flex: "1 1 0", overflowY: "auto", scrollbarWidth: "none", padding: "16px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontSize: 11, color: "rgba(212,175,55,0.6)", fontWeight: 600, marginBottom: 4 }}>모의매매 포지션</div>
                {positions.length === 0 ? (
                  <div style={{ textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 12, paddingTop: 32 }}>
                    보유 포지션 없음
                  </div>
                ) : positions.map(pos => (
                  <div key={pos.id} className="rounded-xl p-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span style={{
                          padding: "1px 6px", borderRadius: 4, fontSize: 9, fontWeight: 800,
                          background: pos.direction === "long" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                          color: pos.direction === "long" ? UP_COLOR : DOWN_COLOR,
                        }}>{pos.direction === "long" ? "L" : "S"}</span>
                        <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>{pos.symbol.replace("USDT","")}/USDT</span>
                        <span style={{ fontSize: 10, color: GOLD, opacity: 0.7 }}>{pos.leverage}x</span>
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: pos.pnl >= 0 ? UP_COLOR : DOWN_COLOR }}>
                        {pos.pnl >= 0 ? "+" : ""}₩{Math.floor(pos.pnl).toLocaleString("ko-KR")}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1" style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                      <span>진입 <span style={{ color: "rgba(255,255,255,0.55)" }}>₩{Math.floor(pos.entryPrice ?? 0).toLocaleString("ko-KR")}</span></span>
                      <span style={{ color: pos.pnlPct >= 0 ? UP_COLOR : DOWN_COLOR }}>{pos.pnlPct >= 0 ? "+" : ""}{pos.pnlPct.toFixed(2)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ══════ PC (lg 이상): 시세 목록 | 날짜 + 자동매매/모의매매 ══════ */}
      <main className="hidden lg:block max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-3 gap-4" style={{ height: "calc(100vh - 172px)" }}>

          {/* 왼쪽 1/3: 실시간 시세 */}
          <div className="rounded-2xl overflow-hidden"
            style={{ background: "#0a0b0f", border: `1px solid rgba(212,175,55,0.15)`, height: "calc(100vh - 172px)" }}>
            <LivePricesTab
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

          {/* 오른쪽 2/3: tradeMode에 따라 자동매매 or 모의매매 */}
          <div className="col-span-2 rounded-2xl flex flex-col"
            style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, height: "calc(100vh - 172px)" }}>
            {tradeMode === "auto" ? (
              <>
                {/* 날짜 스트립 고정 */}
                <div style={{ flexShrink: 0 }}>
                  <DateStrip selectedDate={selectedDate} onSelect={setSelectedDate} />
                </div>
                {/* 자동매매 포지션 스크롤 영역 */}
                <div style={{ flex: "1 1 0", overflowY: "auto", scrollbarWidth: "none" }}>
              <AutoSignalPanel selectedDate={selectedDate} />
                </div>
              </>
            ) : (
              /* 모의매매 패널 */
              <div style={{ flex: "1 1 0", overflowY: "auto", scrollbarWidth: "none", padding: "20px" }}>
                <div style={{ fontSize: 12, color: "rgba(212,175,55,0.6)", fontWeight: 600, marginBottom: 12 }}>
                  모의매매 포지션 ({positions.length})
                </div>
                {positions.length === 0 ? (
                  <div style={{ textAlign: "center", color: "rgba(255,255,255,0.2)", fontSize: 13, paddingTop: 60 }}>
                    보유 포지션 없음
                  </div>
                ) : positions.map(pos => (
                  <div key={pos.id} className="rounded-xl p-4 mb-3" style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${BORDER}` }}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span style={{
                          padding: "1px 7px", borderRadius: 4, fontSize: 10, fontWeight: 800,
                          background: pos.direction === "long" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                          color: pos.direction === "long" ? UP_COLOR : DOWN_COLOR,
                        }}>{pos.direction === "long" ? "LONG" : "SHORT"}</span>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "rgba(255,255,255,0.9)" }}>
                          {pos.symbol.replace("USDT","")}/USDT
                        </span>
                        <span style={{ fontSize: 10, color: GOLD, opacity: 0.7 }}>{pos.leverage}x</span>
                      </div>
                      <span style={{ fontSize: 15, fontWeight: 800, color: pos.pnl >= 0 ? UP_COLOR : DOWN_COLOR }}>
                        {pos.pnl >= 0 ? "+" : ""}₩{Math.floor(pos.pnl).toLocaleString("ko-KR")}
                        <span style={{ fontSize: 10, marginLeft: 4, opacity: 0.7 }}>
                          ({pos.pnlPct >= 0 ? "+" : ""}{pos.pnlPct.toFixed(2)}%)
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center gap-4" style={{ fontSize: 11, color: "rgba(255,255,255,0.35)" }}>
                      <span>진입가 <span style={{ color: "rgba(255,255,255,0.6)" }}>₩{Math.floor(pos.entryPrice ?? 0).toLocaleString("ko-KR")}</span></span>
                      <span>증거금 <span style={{ color: GOLD, opacity: 0.8 }}>₩{Math.floor(pos.amount ?? 0).toLocaleString("ko-KR")}</span></span>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
