"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { usePriceWorker } from "@/hooks/use-price-worker"
import LivePricesTab from "@/components/trade/live-prices-tab"
import SymbolChart from "@/components/trade/symbol-chart"
import { TrendingUp, TrendingDown, ArrowUpDown, BarChart2, Clock, Wallet } from "lucide-react"

const GOLD = "#d4af37"
const UP_COLOR = "#22c55e"
const DOWN_COLOR = "#ef4444"

// ─── 포지션 타입 ─────────────────────────────────────────────────
type Direction = "long" | "short"
interface Position {
  id: string
  symbol: string
  direction: Direction
  entryPrice: number
  amount: number       // USDT 투자금
  leverage: number
  openedAt: number
  pnl: number
  pnlPct: number
}

// ─── 숫자 포맷 ───────────────────────────────────────────────────
function fmt(n: number, d = 2) {
  return n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })
}

// ─── 심볼 현재가 헤더 ────────────────────────────────────────────
function SymbolHeader({ symbol, livePrice }: { symbol: string; livePrice: number | null }) {
  const base = symbol.replace("USDT", "")
  const isBTC = symbol === "BTCUSDT"

  return (
    <div style={{
      background: "rgba(5,13,10,0.95)",
      border: "1px solid rgba(212,175,55,0.2)",
      borderRadius: 16, padding: "10px 16px",
      display: "flex", alignItems: "center", justifyContent: "space-between",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: "50%",
          background: isBTC
            ? "radial-gradient(circle at 35% 35%, #f7931a, #c06000)"
            : "radial-gradient(circle at 35% 35%, #627EEA, #3a4fc7)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 11, fontWeight: 900, color: "#fff", flexShrink: 0,
        }}>{base.slice(0, 3)}</div>
        <div>
          <div style={{ fontSize: 9, color: "rgba(212,175,55,0.45)", letterSpacing: "0.06em", marginBottom: 2 }}>{base} / USDT · 영구계약</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 800, color: GOLD, fontVariantNumeric: "tabular-nums" }}>
              {livePrice !== null ? `$${livePrice.toLocaleString("en-US", { maximumFractionDigits: 4 })}` : "—"}
            </span>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 10, color: "rgba(212,175,55,0.4)", letterSpacing: "0.05em", fontWeight: 600 }}>모의 매매</div>
    </div>
  )
}

// ─── 메인 트레이딩 패널 ──────────────────────────────────────────
function TradingPanel({
  symbol,
  balance,
  onOpen,
  isOpening,
}: {
  symbol: string
  balance: number | null
  onOpen: (dir: Direction, amount: number, leverage: number) => void
  isOpening: boolean
}) {
  const [amountPct, setAmountPct] = useState(10)
  const [leverage, setLeverage] = useState(10)

  const base = symbol.replace("USDT", "")
  const maxBalance = balance ?? 0
  const amount = Math.floor(maxBalance * amountPct / 100)

  const panelBg = "rgba(5,13,10,0.95)"
  const borderColor = "rgba(212,175,55,0.18)"
  const liqPct = leverage > 1 ? (100 / leverage).toFixed(1) : null

  return (
    <div style={{ background: panelBg, border: `1px solid ${borderColor}`, borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
      {/* 투자 금액 슬라이더 */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <label style={{ fontSize: 10, color: "rgba(212,175,55,0.5)", letterSpacing: "0.05em" }}>투자 금액</label>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", fontVariantNumeric: "tabular-nums" }}>
              ₩{amount.toLocaleString("ko-KR")}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>{amountPct}%</span>
          </div>
        </div>
        <input type="range" min={1} max={100} step={1} value={amountPct}
          onChange={e => setAmountPct(Number(e.target.value))}
          style={{ width: "100%", accentColor: GOLD, cursor: "pointer" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
          {[10, 25, 50, 75, 100].map(v => (
            <button key={v} onClick={() => setAmountPct(v)} style={{
              padding: "2px 7px", borderRadius: 5,
              border: `1px solid ${amountPct === v ? GOLD : "rgba(212,175,55,0.12)"}`,
              background: amountPct === v ? "rgba(212,175,55,0.15)" : "transparent",
              color: amountPct === v ? GOLD : "rgba(255,255,255,0.3)",
              fontSize: 10, cursor: "pointer",
            }}>{v}%</button>
          ))}
        </div>
      </div>

      {/* 레버리지 슬라이더 */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <label style={{ fontSize: 10, color: "rgba(212,175,55,0.5)", letterSpacing: "0.05em" }}>레버리지</label>
          <span style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>{leverage}x</span>
        </div>
        <input type="range" min={1} max={100} step={1} value={leverage}
          onChange={e => setLeverage(Number(e.target.value))}
          style={{ width: "100%", accentColor: GOLD, cursor: "pointer" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 5 }}>
          {[1, 10, 25, 50, 100].map(v => (
            <button key={v} onClick={() => setLeverage(v)} style={{
              padding: "2px 6px", borderRadius: 5,
              border: `1px solid ${leverage === v ? GOLD : "rgba(212,175,55,0.12)"}`,
              background: leverage === v ? "rgba(212,175,55,0.15)" : "transparent",
              color: leverage === v ? GOLD : "rgba(255,255,255,0.3)",
              fontSize: 10, cursor: "pointer",
            }}>{v}x</button>
          ))}
        </div>
      </div>

      {/* 주문 요약 */}
      <div style={{
        background: "rgba(212,175,55,0.04)", border: "1px solid rgba(212,175,55,0.1)",
        borderRadius: 10, padding: "8px 12px",
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 12px",
      }}>
        {[
          { label: "투자금", value: `₩${amount.toLocaleString("ko-KR")}`, color: "rgba(212,175,55,0.75)" },
          { label: "포지션 크기", value: `₩${(amount * leverage).toLocaleString("ko-KR")}`, color: "rgba(212,175,55,0.75)" },
          { label: "롱 청산 기준", value: liqPct ? `-${liqPct}%` : "없음", color: DOWN_COLOR },
          { label: "1% 수익 예상", value: `₩${Math.floor(amount * leverage * 0.01).toLocaleString("ko-KR")}`, color: UP_COLOR },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, color: "rgba(212,175,55,0.4)" }}>{label}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{value}</span>
          </div>
        ))}
      </div>

      {/* 롱/숏 진입 버튼 — 50:50 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        {(["long", "short"] as Direction[]).map(dir => (
          <button
            key={dir}
            onClick={() => { if (!isOpening && amount > 0) onOpen(dir, amount, leverage) }}
            disabled={isOpening || !amount || balance === null}
            style={{
              padding: "13px 0", borderRadius: 12, border: "none",
              background: isOpening || !amount || balance === null
                ? "rgba(255,255,255,0.06)"
                : dir === "long"
                  ? "linear-gradient(135deg, #16a34a, #22c55e)"
                  : "linear-gradient(135deg, #dc2626, #ef4444)",
              color: isOpening || !amount || balance === null ? "rgba(255,255,255,0.25)" : "#fff",
              fontWeight: 800, fontSize: 13,
              cursor: isOpening || !amount || balance === null ? "not-allowed" : "pointer",
              boxShadow: isOpening || !amount || balance === null ? "none"
                : dir === "long" ? "0 4px 14px rgba(34,197,94,0.3)" : "0 4px 14px rgba(239,68,68,0.3)",
              transition: "all 0.15s",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            }}
          >
            {dir === "long"
              ? <><TrendingUp style={{ width: 14, height: 14 }} />{isOpening ? "처리중..." : `롱 진입 · ${base}`}</>
              : <><TrendingDown style={{ width: 14, height: 14 }} />{isOpening ? "처리중..." : `숏 진입 · ${base}`}</>
            }
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── 포지션 카드 ─────────────────────────────────────────────────
function PositionCard({ pos, onClose, closingId }: { pos: Position; onClose: (id: string) => void; closingId: string | null }) {
  const isLong = pos.direction === "long"
  const dirColor = isLong ? UP_COLOR : DOWN_COLOR
  const pnlColor = pos.pnl >= 0 ? UP_COLOR : DOWN_COLOR

  // 위험도: pnlPct 기준 청산까지 얼마나 왔는지 (0~100%)
  const liqThreshold = 100 / pos.leverage  // 청산 기준 %
  const riskPct = Math.min(100, Math.abs(pos.pnlPct) / liqThreshold * 100)
  const riskColor = riskPct < 40 ? UP_COLOR : riskPct < 70 ? GOLD : DOWN_COLOR

  // 진입 후 경과 시간
  const elapsed = Math.floor((Date.now() - pos.openedAt) / 1000)
  const elapsedStr = elapsed < 60 ? `${elapsed}초` : elapsed < 3600 ? `${Math.floor(elapsed / 60)}분` : `${Math.floor(elapsed / 3600)}시간`

  const liquidationPrice = isLong
    ? pos.entryPrice * (1 - 1 / pos.leverage)
    : pos.entryPrice * (1 + 1 / pos.leverage)

  const isClosing = closingId === pos.id

  return (
    <div style={{
      padding: "12px 16px",
      borderBottom: "1px solid rgba(212,175,55,0.06)",
      display: "flex", flexDirection: "column", gap: 8,
    }}>
      {/* 상단: 방향 배지 + 심볼 + PnL */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            padding: "3px 8px", borderRadius: 6,
            background: isLong ? "rgba(34,197,94,0.13)" : "rgba(239,68,68,0.13)",
            border: `1px solid ${isLong ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)"}`,
            color: dirColor, fontSize: 10, fontWeight: 800, letterSpacing: "0.05em",
          }}>{isLong ? "LONG" : "SHORT"}</div>
          <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.85)" }}>
            BTC/USDT <span style={{ color: "rgba(212,175,55,0.55)", fontWeight: 500 }}>{pos.leverage}x</span>
          </span>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: pnlColor, fontVariantNumeric: "tabular-nums" }}>
            {pos.pnl >= 0 ? "+" : ""}₩{Math.floor(pos.pnl).toLocaleString("ko-KR")}
          </div>
          <div style={{ fontSize: 10, color: pnlColor, opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>
            {pos.pnlPct >= 0 ? "+" : ""}{pos.pnlPct.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* 중단: 진입가 / 청산가 / 경과시간 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
        {[
          { label: "진입가", value: `$${fmt(pos.entryPrice)}` },
          { label: "청산가", value: `$${fmt(liquidationPrice)}`, color: DOWN_COLOR },
          { label: "경과", value: elapsedStr },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background: "rgba(255,255,255,0.03)", borderRadius: 7, padding: "5px 8px" }}>
            <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)", marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: color ?? "rgba(255,255,255,0.7)", fontVariantNumeric: "tabular-nums" }}>{value}</div>
          </div>
        ))}
      </div>

      {/* 위험도 바 */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.3)" }}>위험도</span>
          <span style={{ fontSize: 9, fontWeight: 700, color: riskColor }}>{riskPct.toFixed(0)}%</span>
        </div>
        <div style={{ height: 4, borderRadius: 2, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div style={{
            height: "100%", borderRadius: 2,
            width: `${riskPct}%`,
            background: riskColor,
            transition: "width 0.3s ease",
          }} />
        </div>
      </div>

      {/* 청산 버튼 */}
      <button
        onClick={() => onClose(pos.id)}
        disabled={isClosing}
        style={{
          width: "100%", padding: "8px 0", borderRadius: 8,
          border: `1px solid ${isClosing ? "rgba(255,255,255,0.06)" : "rgba(255,255,255,0.15)"}`,
          background: isClosing ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.06)",
          color: isClosing ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.55)",
          fontSize: 11, fontWeight: 600, cursor: isClosing ? "not-allowed" : "pointer",
          transition: "all 0.15s",
        }}
      >
        {isClosing ? "청산 중..." : "포지션 청산"}
      </button>
    </div>
  )
}

// ─── 포지션 목록 ─────────────────────────────────────────────────
function PositionList({ positions, onClose, closingId }: { positions: Position[]; onClose: (id: string) => void; closingId: string | null }) {
  const containerBg = "rgba(5,13,10,0.95)"
  const borderColor = "rgba(212,175,55,0.18)"

  if (positions.length === 0) {
    return (
      <div style={{
        background: containerBg, border: `1px solid ${borderColor}`, borderRadius: 16,
        padding: "28px 16px", textAlign: "center",
      }}>
        <ArrowUpDown style={{ width: 28, height: 28, color: "rgba(212,175,55,0.2)", margin: "0 auto 8px" }} />
        <p style={{ color: "rgba(255,255,255,0.25)", fontSize: 12 }}>보유 포지션 없음</p>
      </div>
    )
  }

  return (
    <div style={{ background: containerBg, border: `1px solid ${borderColor}`, borderRadius: 16, overflow: "hidden" }}>
      <div style={{ padding: "10px 16px", borderBottom: `1px solid ${borderColor}`, display: "flex", alignItems: "center", gap: 6 }}>
        <BarChart2 style={{ width: 13, height: 13, color: GOLD, opacity: 0.7 }} />
        <span style={{ fontSize: 11, color: "rgba(212,175,55,0.6)", fontWeight: 600, letterSpacing: "0.05em" }}>
          보유 포지션 ({positions.length})
        </span>
      </div>
      {positions.map(pos => (
        <PositionCard key={pos.id} pos={pos} onClose={onClose} closingId={closingId} />
      ))}
    </div>
  )
}

// ─── 거래 내역 ───────────────────────────────────────────────────
interface TradeLog { id: string; direction: Direction; pnl: number; closedAt: number; entryPrice: number; exitPrice: number }

function TradeHistory({ logs }: { logs: TradeLog[] }) {
  if (logs.length === 0) return null
  return (
    <div style={{
      background: "rgba(5,13,10,0.95)", border: "1px solid rgba(212,175,55,0.18)",
      borderRadius: 16, overflow: "hidden",
    }}>
      <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(212,175,55,0.12)", display: "flex", alignItems: "center", gap: 6 }}>
        <Clock style={{ width: 13, height: 13, color: GOLD, opacity: 0.7 }} />
        <span style={{ fontSize: 11, color: "rgba(212,175,55,0.6)", fontWeight: 600, letterSpacing: "0.05em" }}>거래 내역</span>
      </div>
      {logs.slice(0, 10).map(log => (
        <div key={log.id} style={{
          padding: "8px 16px",
          borderBottom: "1px solid rgba(212,175,55,0.05)",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{
              padding: "1px 5px", borderRadius: 4,
              background: log.direction === "long" ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)",
              color: log.direction === "long" ? UP_COLOR : DOWN_COLOR,
              fontSize: 9, fontWeight: 800,
            }}>{log.direction === "long" ? "L" : "S"}</div>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontVariantNumeric: "tabular-nums" }}>
              {new Date(log.closedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          </div>
          <div style={{ textAlign: "right" }}>
            <span style={{
              fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums",
              color: log.pnl >= 0 ? UP_COLOR : DOWN_COLOR,
            }}>{log.pnl >= 0 ? "+" : ""}${fmt(log.pnl)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function getToken(): string | null {
  if (typeof window === "undefined") return null
  try { return localStorage.getItem("app_token") } catch { return null }
}

// ─── 메인 페이지 ─────────────────────────────────────────────────
export default function TradePage() {
  const [balance, setBalance] = useState<number | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [logs, setLogs] = useState<TradeLog[]>([])
  const [openingId, setOpeningId] = useState<string | null>(null)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT")
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null)
  const currentPriceRef = useRef<number | null>(null)

  const handleSelectSymbol = useCallback((symbol: string, price: number) => {
    setSelectedSymbol(symbol)
    setSelectedPrice(price)
  }, [])

  // 실시간 표시 잔고 = DB 잔고 + 열린 포지션 PnL 합산
  const totalPnl = positions.reduce((sum, p) => sum + p.pnl, 0)
  const displayBalance = balance === null ? null : Math.floor(balance + totalPnl)

  usePriceWorker({})

  // 실제 잔고 조회
  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetch("/api/user/trade", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.balance !== undefined) setBalance(d.balance) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const onPrice = (e: Event) => {
      const price = (e as CustomEvent<{ price: number }>).detail.price
      currentPriceRef.current = price
      setPositions(prev => prev.map(pos => {
        const priceDiff = pos.direction === "long"
          ? price - pos.entryPrice
          : pos.entryPrice - price
        const pnl = (priceDiff / pos.entryPrice) * pos.amount * pos.leverage
        const pnlPct = (priceDiff / pos.entryPrice) * pos.leverage * 100
        return { ...pos, pnl, pnlPct }
      }))
    }
    window.addEventListener("baka:price", onPrice)
    return () => window.removeEventListener("baka:price", onPrice)
  }, [])

  const handleOpen = useCallback(async (dir: Direction, amount: number, leverage: number) => {
    if (balance === null) return
    if (amount <= 0 || amount > balance) { alert("잔고가 부족합니다."); return }

    const price = currentPriceRef.current ?? 0
    const tempId = Date.now().toString()
    setOpeningId(tempId)
    try {
      const token = getToken()
      const res = await fetch("/api/user/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? "진입 실패"); return }

      setBalance(data.newBalance)
      setPositions(prev => [{
        id: tempId,
        symbol: "BTCUSDT",
        direction: dir,
        entryPrice: price,
        amount,
        leverage,
        openedAt: Date.now(),
        pnl: 0,
        pnlPct: 0,
      }, ...prev])
    } finally {
      setOpeningId(null)
    }
  }, [balance])

  const handleClose = useCallback(async (id: string) => {
    const pos = positions.find(p => p.id === id)
    if (!pos) return

    // pos.pnl / pos.pnlPct 는 baka:price 이벤트로 이미 최신 상태
    const pnl = pos.pnl
    const exitPrice = currentPriceRef.current ?? pos.entryPrice
    // 청산 시 받을 금액: 투자금 + 손익 (최소 0, 즉 전액 손실)
    const payout = Math.max(0, pos.amount + pnl)

    setClosingId(id)
    try {
      const token = getToken()
      const res = await fetch("/api/user/trade", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          payout,
          note: `모의매매 청산 (${pos.direction === "long" ? "롱" : "숏"} ${pos.leverage}x, PnL: ${pnl >= 0 ? "+" : ""}${Math.floor(pnl).toLocaleString("ko-KR")}원)`,
        }),
      })
      const data = await res.json()
      if (!res.ok) { alert(data.error ?? "청산 실패"); return }

      setBalance(data.newBalance)
      setPositions(prev => prev.filter(p => p.id !== id))
      setLogs(l => [{
        id: Date.now().toString(),
        direction: pos.direction,
        pnl,
        closedAt: Date.now(),
        entryPrice: pos.entryPrice,
        exitPrice,
      }, ...l])
    } finally {
      setClosingId(null)
    }
  }, [positions])

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "radial-gradient(ellipse at 50% 30%, #0a1a10 0%, #060d09 60%, #040a06 100%)" }}
    >
      <main className="max-w-7xl mx-auto p-3 md:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* 왼쪽: 트레이딩 패널 */}
          <div className="lg:col-span-2 space-y-3">
            {/* 심볼 헤더 */}
            <SymbolHeader symbol={selectedSymbol} livePrice={selectedPrice} />

            {/* 실시간 차트 */}
            <div style={{
              background: "rgba(5,13,10,0.95)",
              border: "1px solid rgba(212,175,55,0.15)",
              borderRadius: 16, overflow: "hidden",
            }}>
              <SymbolChart
                symbol={selectedSymbol}
                height={260}
                positions={positions.filter(p => p.symbol === selectedSymbol)}
              />
            </div>

            {/* 평가 잔고 */}
            <div style={{
              background: "rgba(5,13,10,0.9)",
              border: "1px solid rgba(212,175,55,0.15)",
              borderRadius: 12, padding: "8px 16px",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Wallet style={{ width: 13, height: 13, color: GOLD, opacity: 0.6 }} />
                <span style={{ fontSize: 11, color: "rgba(212,175,55,0.5)", letterSpacing: "0.05em" }}>평가 잔고</span>
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

            {/* 트레이딩 입력 패널 */}
            <TradingPanel
              symbol={selectedSymbol}
              balance={balance}
              onOpen={handleOpen}
              isOpening={openingId !== null}
            />

            {/* 포지션 목록 */}
            <PositionList positions={positions} onClose={handleClose} closingId={closingId} />

            {/* 거래 내역 */}
            <TradeHistory logs={logs} />
          </div>

          {/* 오른쪽: 라이브 시세 탭 */}
          <div className="space-y-4">
            {/* 타이틀 */}
            <div style={{
              background: "rgba(5,13,10,0.95)",
              border: "1px solid rgba(212,175,55,0.2)",
              borderRadius: 16,
              padding: "10px 16px",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: UP_COLOR,
                boxShadow: `0 0 6px ${UP_COLOR}`,
                animation: "pulseDot 2s ease-in-out infinite",
              }} />
              <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(212,175,55,0.7)", letterSpacing: "0.08em" }}>
                LIVE 시세
              </span>
            </div>

            {/* 라이브 시세 리스트 — 클릭 시 차트/거래 종목 변경 */}
            <div style={{
              background: "#0a0b0f",
              border: "1px solid rgba(212,175,55,0.15)",
              borderRadius: 16,
              overflow: "hidden",
              height: "calc(100vh - 160px)",
            }}>
              <LivePricesTab
              onSelect={handleSelectSymbol}
              selectedSymbol={selectedSymbol}
            />
            </div>
          </div>

        </div>
      </main>

      <style>{`
        @keyframes pulseDot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.4; transform: scale(0.6); }
        }
      `}</style>
    </div>
  )
}
