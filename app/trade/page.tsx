"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { usePriceWorker } from "@/hooks/use-price-worker"
import LivePricesTab from "@/components/trade/live-prices-tab"
import SymbolChart from "@/components/trade/symbol-chart"
import { TrendingUp, TrendingDown, ArrowUpDown, BarChart2, Clock, Wallet, X, Star } from "lucide-react"

const GOLD       = "#d4af37"
const UP_COLOR   = "#22c55e"
const DOWN_COLOR = "#ef4444"
const PANEL_BG   = "rgba(5,13,10,0.97)"
const BORDER     = "rgba(212,175,55,0.18)"

type Direction = "long" | "short"

interface Position {
  id:         string
  symbol:     string
  direction:  Direction
  entryPrice: number
  amount:     number
  leverage:   number
  openedAt:   number
  pnl:        number
  pnlPct:     number
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

function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })
}

function getToken(): string | null {
  if (typeof window === "undefined") return null
  try { return localStorage.getItem("app_token") } catch { return null }
}

// ─── 진입 다이얼로그 ─────────────────────────────────────────────
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
  const [amountPct, setAmountPct] = useState(10)
  const [leverage,  setLeverage]  = useState(10)

  const base      = symbol.replace("USDT", "")
  const maxBal    = balance ?? 0
  const amount    = Math.floor(maxBal * amountPct / 100)
  const posSize   = amount * leverage
  const liqPct    = leverage > 1 ? (100 / leverage).toFixed(1) : null
  const profit1pct = Math.floor(posSize * 0.01)

  // ESC 닫기
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full sm:w-[420px] rounded-t-2xl sm:rounded-2xl overflow-hidden"
        style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, maxHeight: "90vh", overflowY: "auto" }}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: BORDER }}>
          <div className="flex items-center gap-3">
            <div style={{
              width: 36, height: 36, borderRadius: "50%",
              background: "radial-gradient(circle at 35% 35%, #627EEA, #3a4fc7)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 11, fontWeight: 900, color: "#fff",
            }}>{base.slice(0, 3)}</div>
            <div>
              <div className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>{base}/USDT</div>
              <div className="text-xs" style={{ color: GOLD }}>
                {price ? `$${price.toLocaleString("en-US", { maximumFractionDigits: 4 })}` : "—"}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ color: "rgba(255,255,255,0.4)" }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* 잔고 표시 */}
          <div className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: "rgba(212,175,55,0.06)", border: `1px solid ${BORDER}` }}>
            <div className="flex items-center gap-2">
              <Wallet className="w-3.5 h-3.5" style={{ color: GOLD }} />
              <span className="text-xs" style={{ color: "rgba(212,175,55,0.6)" }}>사용 가능 잔고</span>
            </div>
            <span className="text-sm font-bold tabular-nums" style={{ color: GOLD }}>
              {balance === null ? "—" : `₩${maxBal.toLocaleString("ko-KR")}`}
            </span>
          </div>

          {/* 투자 금액 슬라이더 */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs" style={{ color: "rgba(212,175,55,0.5)" }}>투자 금액</label>
              <div className="flex items-center gap-2">
                <span className="text-xs tabular-nums" style={{ color: "rgba(255,255,255,0.4)" }}>
                  ₩{amount.toLocaleString("ko-KR")}
                </span>
                <span className="text-sm font-bold" style={{ color: GOLD }}>{amountPct}%</span>
              </div>
            </div>
            <input type="range" min={1} max={100} step={1} value={amountPct}
              onChange={e => setAmountPct(Number(e.target.value))}
              className="w-full" style={{ accentColor: GOLD }}
            />
            <div className="flex justify-between">
              {[10, 25, 50, 75, 100].map(v => (
                <button key={v} onClick={() => setAmountPct(v)} className="text-xs px-2 py-1 rounded-md transition-colors" style={{
                  border: `1px solid ${amountPct === v ? GOLD : "rgba(212,175,55,0.12)"}`,
                  background: amountPct === v ? "rgba(212,175,55,0.15)" : "transparent",
                  color: amountPct === v ? GOLD : "rgba(255,255,255,0.3)",
                }}>{v}%</button>
              ))}
            </div>
          </div>

          {/* 레버리지 슬라이더 */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-xs" style={{ color: "rgba(212,175,55,0.5)" }}>레버리지</label>
              <span className="text-sm font-bold" style={{ color: GOLD }}>{leverage}x</span>
            </div>
            <input type="range" min={1} max={100} step={1} value={leverage}
              onChange={e => setLeverage(Number(e.target.value))}
              className="w-full" style={{ accentColor: GOLD }}
            />
            <div className="flex justify-between">
              {[1, 5, 10, 25, 50, 100].map(v => (
                <button key={v} onClick={() => setLeverage(v)} className="text-xs px-1.5 py-1 rounded-md transition-colors" style={{
                  border: `1px solid ${leverage === v ? GOLD : "rgba(212,175,55,0.12)"}`,
                  background: leverage === v ? "rgba(212,175,55,0.15)" : "transparent",
                  color: leverage === v ? GOLD : "rgba(255,255,255,0.3)",
                }}>{v}x</button>
              ))}
            </div>
          </div>

          {/* 주문 요약 */}
          <div className="grid grid-cols-2 gap-2 px-3 py-3 rounded-lg" style={{ background: "rgba(212,175,55,0.04)", border: `1px solid rgba(212,175,55,0.1)` }}>
            {[
              { label: "투자금",       value: `₩${amount.toLocaleString("ko-KR")}`,    color: "rgba(212,175,55,0.8)" },
              { label: "포지션 크기",  value: `₩${posSize.toLocaleString("ko-KR")}`,   color: "rgba(212,175,55,0.8)" },
              { label: "롱 청산 기준", value: liqPct ? `-${liqPct}%` : "없음",          color: DOWN_COLOR },
              { label: "1% 수익 예상", value: `₩${profit1pct.toLocaleString("ko-KR")}`, color: UP_COLOR },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex justify-between">
                <span className="text-xs" style={{ color: "rgba(212,175,55,0.4)" }}>{label}</span>
                <span className="text-xs font-bold tabular-nums" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>

          {/* 롱/숏 버튼 */}
          <div className="grid grid-cols-2 gap-3">
            {(["long", "short"] as Direction[]).map(dir => {
              const disabled = isOpening || !amount || balance === null
              return (
                <button
                  key={dir}
                  onClick={() => { if (!disabled) onOpen(dir, amount, leverage) }}
                  disabled={disabled}
                  className="py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                  style={{
                    background: disabled
                      ? "rgba(255,255,255,0.06)"
                      : dir === "long"
                        ? "linear-gradient(135deg,#16a34a,#22c55e)"
                        : "linear-gradient(135deg,#dc2626,#ef4444)",
                    color: disabled ? "rgba(255,255,255,0.25)" : "#fff",
                    cursor: disabled ? "not-allowed" : "pointer",
                    boxShadow: disabled ? "none"
                      : dir === "long" ? "0 4px 14px rgba(34,197,94,0.3)" : "0 4px 14px rgba(239,68,68,0.3)",
                  }}
                >
                  {dir === "long"
                    ? <><TrendingUp className="w-4 h-4" />{isOpening ? "처리중..." : "롱 진입"}</>
                    : <><TrendingDown className="w-4 h-4" />{isOpening ? "처리중..." : "숏 진입"}</>
                  }
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 포지션 미니 카드 (시세 리스트 하단) ────────────────────────
function PositionMiniCard({
  pos, livePrice, onClose, isClosing,
}: {
  pos:       Position
  livePrice: number | null
  onClose:   (id: string) => void
  isClosing: boolean
}) {
  const isLong    = pos.direction === "long"
  const pnlColor  = pos.pnl >= 0 ? UP_COLOR : DOWN_COLOR
  const base      = pos.symbol.replace("USDT", "")
  const elapsed   = Math.floor((Date.now() - pos.openedAt) / 1000)
  const hh        = Math.floor(elapsed / 3600).toString().padStart(2, "0")
  const mm        = Math.floor((elapsed % 3600) / 60).toString().padStart(2, "0")
  const ss        = (elapsed % 60).toString().padStart(2, "0")
  const elapsedStr = `IN:${hh}:${mm}:${ss}`

  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-t" style={{ borderColor: "rgba(212,175,55,0.08)", background: "rgba(5,13,10,0.6)" }}>
      {/* 왼쪽 */}
      <div className="flex items-center gap-2.5">
        <div className="w-0.5 h-8 rounded-full" style={{ background: isLong ? UP_COLOR : DOWN_COLOR }} />
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold" style={{ color: "rgba(255,255,255,0.85)" }}>{base}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
              style={{
                background: isLong ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)",
                color: isLong ? UP_COLOR : DOWN_COLOR,
              }}>{isLong ? "L" : "S"}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold"
              style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }}>
              {pos.leverage}X
            </span>
            <span className="text-[10px] font-bold tabular-nums" style={{ color: pnlColor }}>
              {pos.pnlPct >= 0 ? "+" : ""}{pos.pnlPct.toFixed(2)}%
            </span>
          </div>
          <div className="text-[10px] tabular-nums mt-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
            ENTRY: ${fmt(pos.entryPrice)} | MARGIN: {pos.amount.toLocaleString("ko-KR")} KRW
          </div>
        </div>
      </div>

      {/* 오른쪽 */}
      <div className="text-right">
        <div className="text-[10px] tabular-nums" style={{ color: "rgba(255,255,255,0.3)" }}>{elapsedStr}</div>
        <div className="text-sm font-bold tabular-nums" style={{ color: "rgba(255,255,255,0.85)" }}>
          {livePrice ? livePrice.toLocaleString("en-US", { maximumFractionDigits: 6 }) : "—"}
        </div>
        <button
          onClick={() => onClose(pos.id)}
          disabled={isClosing}
          className="text-[9px] px-2 py-0.5 rounded mt-0.5 transition-colors"
          style={{
            border: "1px solid rgba(255,255,255,0.12)",
            color: "rgba(255,255,255,0.35)",
            background: "transparent",
            cursor: isClosing ? "not-allowed" : "pointer",
          }}
        >
          {isClosing ? "청산중" : "청산"}
        </button>
      </div>
    </div>
  )
}

// ─── 메인 페이지 ─────────────────────────────────────────────────
export default function TradePage() {
  const [balance,      setBalance]      = useState<number | null>(null)
  const [positions,    setPositions]    = useState<Position[]>([])
  const [logs,         setLogs]         = useState<TradeLog[]>([])
  const [openingId,    setOpeningId]    = useState<string | null>(null)
  const [closingId,    setClosingId]    = useState<string | null>(null)
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT")
  const [selectedPrice,  setSelectedPrice]  = useState<number | null>(null)
  const [dialogOpen,   setDialogOpen]   = useState(false)
  const [dialogSymbol, setDialogSymbol] = useState("BTCUSDT")
  const [dialogPrice,  setDialogPrice]  = useState<number | null>(null)

  const priceMapRef = useRef<Map<string, number>>(new Map())
  const [, ticker]  = useState(0)  // 경과시간 강제 업데이트용

  // 1초마다 경과시간 업데이트
  useEffect(() => {
    if (positions.length === 0) return
    const t = setInterval(() => ticker(n => n + 1), 1000)
    return () => clearInterval(t)
  }, [positions.length])

  usePriceWorker({})

  // 잔고 조회
  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetch("/api/user/trade", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.balance !== undefined) setBalance(d.balance) })
      .catch(() => {})
  }, [])

  // BTC 가격 이벤트 → 포지션 PnL 업데이트
  useEffect(() => {
    const onPrice = (e: Event) => {
      const price = (e as CustomEvent<{ price: number }>).detail.price
      priceMapRef.current.set("BTCUSDT", price)
      setPositions(prev => prev.map(pos => {
        if (pos.symbol !== "BTCUSDT") return pos
        const diff   = pos.direction === "long" ? price - pos.entryPrice : pos.entryPrice - price
        const pnl    = (diff / pos.entryPrice) * pos.amount * pos.leverage
        const pnlPct = (diff / pos.entryPrice) * pos.leverage * 100
        return { ...pos, pnl, pnlPct }
      }))
    }
    window.addEventListener("baka:price", onPrice)
    return () => window.removeEventListener("baka:price", onPrice)
  }, [])

  // 종목 클릭 → 데스크탑은 차트 변경, 모바일은 다이얼로그
  const handleSelectSymbol = useCallback((symbol: string, price: number) => {
    priceMapRef.current.set(symbol, price)
    setSelectedSymbol(symbol)
    setSelectedPrice(price)
    setDialogSymbol(symbol)
    setDialogPrice(price)
    setDialogOpen(true)
  }, [])

  const totalPnl      = positions.reduce((sum, p) => sum + p.pnl, 0)
  const displayBalance = balance === null ? null : Math.floor(balance + totalPnl)

  const handleOpen = useCallback(async (dir: Direction, amount: number, leverage: number) => {
    if (balance === null) return
    if (amount <= 0 || amount > balance) { alert("잔고가 부족합니다."); return }
    const price  = priceMapRef.current.get(dialogSymbol) ?? 0
    const tempId = Date.now().toString()
    setOpeningId(tempId)
    try {
      const token = getToken()
      const res   = await fetch("/api/user/trade", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ amount }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? "진입 실패"); return }
      setBalance(data.newBalance)
      setPositions(prev => [{
        id:         tempId,
        symbol:     dialogSymbol,
        direction:  dir,
        entryPrice: price,
        amount,
        leverage,
        openedAt:   Date.now(),
        pnl:        0,
        pnlPct:     0,
      }, ...prev])
      setDialogOpen(false)
    } finally {
      setOpeningId(null)
    }
  }, [balance, dialogSymbol])

  const handleClose = useCallback(async (id: string) => {
    const pos = positions.find(p => p.id === id)
    if (!pos) return
    const pnl       = pos.pnl
    const exitPrice = priceMapRef.current.get(pos.symbol) ?? pos.entryPrice
    const payout    = Math.max(0, pos.amount + pnl)
    setClosingId(id)
    try {
      const token = getToken()
      const res   = await fetch("/api/user/trade", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          payout,
          note:        `모의매매 청산 (${pos.direction === "long" ? "롱" : "숏"} ${pos.leverage}x)`,
          symbol:      pos.symbol,
          direction:   pos.direction,
          leverage:    pos.leverage,
          entry_price: pos.entryPrice,
          exit_price:  exitPrice,
          bet_amount:  pos.amount,
        }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? "청산 실패"); return }
      setBalance(data.newBalance)
      setPositions(prev => prev.filter(p => p.id !== id))
      setLogs(l => [{ id: Date.now().toString(), symbol: pos.symbol, direction: pos.direction, pnl, closedAt: Date.now(), entryPrice: pos.entryPrice, exitPrice }, ...l])
    } finally {
      setClosingId(null)
    }
  }, [positions])

  return (
    <div className="min-h-screen font-sans" style={{ background: "radial-gradient(ellipse at 50% 30%,#0a1a10 0%,#060d09 60%,#040a06 100%)" }}>
      <main className="max-w-7xl mx-auto p-3 md:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* 데스크탑 왼쪽 패널 — 모바일에서는 숨김 */}
          <div className="hidden lg:block lg:col-span-2 space-y-3">
            {/* 심볼 헤더 */}
            <div style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 16, padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "radial-gradient(circle at 35% 35%,#627EEA,#3a4fc7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 900, color: "#fff" }}>
                  {selectedSymbol.replace("USDT", "").slice(0, 3)}
                </div>
                <div>
                  <div style={{ fontSize: 9, color: "rgba(212,175,55,0.45)", letterSpacing: "0.06em", marginBottom: 2 }}>
                    {selectedSymbol.replace("USDT", "")} / USDT · 영구계약
                  </div>
                  <span style={{ fontSize: 18, fontWeight: 800, color: GOLD, fontVariantNumeric: "tabular-nums" }}>
                    {selectedPrice ? `$${selectedPrice.toLocaleString("en-US", { maximumFractionDigits: 4 })}` : "—"}
                  </span>
                </div>
              </div>
              <span style={{ fontSize: 10, color: "rgba(212,175,55,0.4)", letterSpacing: "0.05em" }}>모의 매매</span>
            </div>

            {/* 차트 */}
            <div style={{ background: PANEL_BG, border: `1px solid rgba(212,175,55,0.15)`, borderRadius: 16, overflow: "hidden" }}>
              <SymbolChart
                symbol={selectedSymbol}
                height={260}
                positions={positions.filter(p => p.symbol === selectedSymbol)}
                onPrice={(p) => {
                  priceMapRef.current.set(selectedSymbol, p)
                  setSelectedPrice(p)
                  setPositions(prev => prev.map(pos => {
                    if (pos.symbol !== selectedSymbol) return pos
                    const diff   = pos.direction === "long" ? p - pos.entryPrice : pos.entryPrice - p
                    const pnl    = (diff / pos.entryPrice) * pos.amount * pos.leverage
                    const pnlPct = (diff / pos.entryPrice) * pos.leverage * 100
                    return { ...pos, pnl, pnlPct }
                  }))
                }}
              />
            </div>

            {/* 평가 잔고 */}
            <div style={{ background: "rgba(5,13,10,0.9)", border: `1px solid rgba(212,175,55,0.15)`, borderRadius: 12, padding: "8px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Wallet style={{ width: 13, height: 13, color: GOLD, opacity: 0.6 }} />
                <span style={{ fontSize: 11, color: "rgba(212,175,55,0.5)" }}>평가 잔고</span>
                {positions.length > 0 && (
                  <span style={{ fontSize: 10, color: totalPnl >= 0 ? UP_COLOR : DOWN_COLOR, fontVariantNumeric: "tabular-nums" }}>
                    ({totalPnl >= 0 ? "+" : ""}₩{Math.floor(totalPnl).toLocaleString("ko-KR")} 미실현)
                  </span>
                )}
              </div>
              <span style={{ fontSize: 15, fontWeight: 800, color: GOLD, fontVariantNumeric: "tabular-nums" }}>
                {displayBalance === null ? "—" : `₩${displayBalance.toLocaleString("ko-KR")}`}
              </span>
            </div>

            {/* 포지션 목록 (데스크탑용 상세카드) */}
            {positions.length > 0 && (
              <div style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 6 }}>
                  <BarChart2 style={{ width: 13, height: 13, color: GOLD, opacity: 0.7 }} />
                  <span style={{ fontSize: 11, color: "rgba(212,175,55,0.6)", fontWeight: 600 }}>보유 포지션 ({positions.length})</span>
                </div>
                {positions.map(pos => {
                  const isLong = pos.direction === "long"
                  const pnlColor = pos.pnl >= 0 ? UP_COLOR : DOWN_COLOR
                  const liqPrice = isLong ? pos.entryPrice * (1 - 1 / pos.leverage) : pos.entryPrice * (1 + 1 / pos.leverage)
                  return (
                    <div key={pos.id} style={{ padding: "12px 16px", borderBottom: `1px solid rgba(212,175,55,0.06)` }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ padding: "3px 8px", borderRadius: 6, background: isLong ? "rgba(34,197,94,0.13)" : "rgba(239,68,68,0.13)", border: `1px solid ${isLong ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}`, color: isLong ? UP_COLOR : DOWN_COLOR, fontSize: 10, fontWeight: 800 }}>
                            {isLong ? "LONG" : "SHORT"}
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
                            {pos.symbol.replace("USDT", "")}/USDT <span style={{ color: "rgba(212,175,55,0.55)" }}>{pos.leverage}x</span>
                          </span>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 13, fontWeight: 800, color: pnlColor, fontVariantNumeric: "tabular-nums" }}>
                            {pos.pnl >= 0 ? "+" : ""}₩{Math.floor(pos.pnl).toLocaleString("ko-KR")}
                          </div>
                          <div style={{ fontSize: 10, color: pnlColor, opacity: 0.75 }}>{pos.pnlPct >= 0 ? "+" : ""}{pos.pnlPct.toFixed(2)}%</div>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4, marginBottom: 8 }}>
                        {[
                          { label: "진입가",  value: `$${fmt(pos.entryPrice)}` },
                          { label: "청산가",  value: `$${fmt(liqPrice)}`, color: DOWN_COLOR },
                          { label: "경과",    value: (() => { const s = Math.floor((Date.now() - pos.openedAt) / 1000); return s < 60 ? `${s}초` : s < 3600 ? `${Math.floor(s/60)}분` : `${Math.floor(s/3600)}시간` })() },
                        ].map(({ label, value, color }) => (
                          <div key={label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 7, padding: "5px 8px" }}>
                            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>{label}</div>
                            <div style={{ fontSize: 10, fontWeight: 700, color: color ?? "rgba(255,255,255,0.7)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
                          </div>
                        ))}
                      </div>
                      <button onClick={() => handleClose(pos.id)} disabled={closingId === pos.id}
                        style={{ width: "100%", padding: "8px 0", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)", background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.5)", fontSize: 11, fontWeight: 600, cursor: closingId === pos.id ? "not-allowed" : "pointer" }}>
                        {closingId === pos.id ? "청산 중..." : "포지션 청산"}
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* 거래 내역 */}
            {logs.length > 0 && (
              <div style={{ background: PANEL_BG, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 6 }}>
                  <Clock style={{ width: 13, height: 13, color: GOLD, opacity: 0.7 }} />
                  <span style={{ fontSize: 11, color: "rgba(212,175,55,0.6)", fontWeight: 600 }}>거래 내역</span>
                </div>
                {logs.slice(0, 10).map(log => (
                  <div key={log.id} style={{ padding: "8px 16px", borderBottom: "1px solid rgba(212,175,55,0.05)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ padding: "1px 5px", borderRadius: 4, background: log.direction === "long" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", color: log.direction === "long" ? UP_COLOR : DOWN_COLOR, fontSize: 9, fontWeight: 800 }}>
                        {log.direction === "long" ? "L" : "S"}
                      </div>
                      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontVariantNumeric: "tabular-nums" }}>
                        {new Date(log.closedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: log.pnl >= 0 ? UP_COLOR : DOWN_COLOR }}>
                      {log.pnl >= 0 ? "+" : ""}₩{Math.floor(log.pnl).toLocaleString("ko-KR")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 라이브 시세 — 모바일 전체 / 데스크탑 우측 */}
          <div className="space-y-0">
            <div style={{
              background: "#0a0b0f",
              border: `1px solid rgba(212,175,55,0.15)`,
              borderRadius: 16,
              overflow: "hidden",
              height: "calc(100vh - 80px)",
              display: "flex",
              flexDirection: "column",
            }}>
              {/* 시세 리스트 */}
              <div className="flex-1 overflow-hidden">
                <LivePricesTab
                  onSelect={handleSelectSymbol}
                  selectedSymbol={selectedSymbol}
                />
              </div>

              {/* 보유 포지션 미니카드 (모바일/데스크탑 공통) */}
              {positions.length > 0 && (
                <div className="border-t shrink-0" style={{ borderColor: "rgba(212,175,55,0.12)", maxHeight: "35%" , overflowY: "auto" }}>
                  <div className="flex items-center gap-2 px-4 py-2" style={{ borderBottom: "1px solid rgba(212,175,55,0.08)" }}>
                    <div style={{ width: 6, height: 6, borderRadius: "50%", background: UP_COLOR }} />
                    <span className="text-xs font-semibold" style={{ color: "rgba(212,175,55,0.6)" }}>
                      보유 포지션 ({positions.length})
                    </span>
                  </div>
                  {positions.map(pos => (
                    <PositionMiniCard
                      key={pos.id}
                      pos={pos}
                      livePrice={priceMapRef.current.get(pos.symbol) ?? null}
                      onClose={handleClose}
                      isClosing={closingId === pos.id}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      </main>

      {/* 진입 다이얼로그 */}
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
        @keyframes pulseDot {
          0%,100% { opacity:1; transform:scale(1); }
          50% { opacity:0.4; transform:scale(0.6); }
        }
      `}</style>
    </div>
  )
}
