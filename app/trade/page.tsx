"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { usePriceWorker } from "@/hooks/use-price-worker"
import LivePricesTab from "@/components/trade/live-prices-tab"
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

// ─── 현재가 헤더 ─────────────────────────────────────────────────
function LivePriceHeader() {
  const priceRef = useRef<HTMLSpanElement>(null)
  const changeRef = useRef<HTMLSpanElement>(null)
  const prevRef = useRef<number | null>(null)

  useEffect(() => {
    const onPrice = (e: Event) => {
      const { price } = (e as CustomEvent<{ price: number }>).detail
      if (priceRef.current) {
        priceRef.current.textContent = `$${fmt(price)}`
        // 색상 변화
        if (prevRef.current !== null) {
          const color = price >= prevRef.current ? UP_COLOR : DOWN_COLOR
          priceRef.current.style.color = color
        }
        prevRef.current = price
      }
    }
    const onClosing = (e: Event) => {
      const { price } = (e as CustomEvent<{ price: number }>).detail
      if (changeRef.current) {
        const win = window as any
        const hist: Array<{ time: number; price: number }> = win.__bitcoinClosingPrices ?? []
        if (hist.length >= 2) {
          const first = hist[0].price
          const pct = ((price - first) / first) * 100
          const isUp = pct >= 0
          changeRef.current.textContent = `${isUp ? "+" : ""}${pct.toFixed(2)}%`
          changeRef.current.style.color = isUp ? UP_COLOR : DOWN_COLOR
        }
      }
    }
    window.addEventListener("baka:price", onPrice)
    window.addEventListener("baka:closing", onClosing)
    return () => {
      window.removeEventListener("baka:price", onPrice)
      window.removeEventListener("baka:closing", onClosing)
    }
  }, [])

  return (
    <div style={{
      background: "rgba(5,13,10,0.95)",
      border: "1px solid rgba(212,175,55,0.2)",
      borderRadius: 16,
      padding: "10px 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{
          width: 34, height: 34, borderRadius: "50%",
          background: "radial-gradient(circle at 35% 35%, #f7931a, #c06000)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 900, color: "#fff", flexShrink: 0,
        }}>₿</div>
        <div>
          <div style={{ fontSize: 9, color: "rgba(212,175,55,0.45)", letterSpacing: "0.06em", marginBottom: 2 }}>BTC / USDT</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <span ref={priceRef} style={{ fontSize: 18, fontWeight: 800, color: GOLD, fontVariantNumeric: "tabular-nums" }}>—</span>
            <span ref={changeRef} style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.3)" }}>—</span>
          </div>
        </div>
      </div>
      <div style={{ fontSize: 10, color: "rgba(212,175,55,0.4)", letterSpacing: "0.05em", fontWeight: 600 }}>
        모의 매매
      </div>
    </div>
  )
}

// ─── 메인 트레이딩 패널 ──────────────────────────────────────────
function TradingPanel({
  positions,
  balance,
  onOpen,
  onClose,
  isOpening,
}: {
  positions: Position[]
  balance: number | null
  onOpen: (dir: Direction, amount: number, leverage: number) => void
  onClose: (id: string) => void
  isOpening: boolean
}) {
  const [direction, setDirection] = useState<Direction>("long")
  const [amount, setAmount] = useState("100")
  const [leverage, setLeverage] = useState(10)
  const priceRef = useRef<number | null>(null)

  useEffect(() => {
    const onPrice = (e: Event) => {
      priceRef.current = (e as CustomEvent<{ price: number }>).detail.price
    }
    window.addEventListener("baka:price", onPrice)
    return () => window.removeEventListener("baka:price", onPrice)
  }, [])

  const handleOpen = () => {
    const amt = parseFloat(amount)
    if (!amt || amt <= 0) return
    if (balance !== null && amt > balance) return
    onOpen(direction, amt, leverage)
    setAmount("")
  }

  const panelBg = "rgba(5,13,10,0.95)"
  const borderColor = "rgba(212,175,55,0.18)"

  return (
    <div style={{ background: panelBg, border: `1px solid ${borderColor}`, borderRadius: 16, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
      {/* 잔고 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <Wallet style={{ width: 14, height: 14, color: GOLD, opacity: 0.7 }} />
          <span style={{ fontSize: 11, color: "rgba(212,175,55,0.55)", letterSpacing: "0.05em" }}>잔고</span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: GOLD, fontVariantNumeric: "tabular-nums" }}>
          {balance === null ? "—" : `₩${balance.toLocaleString("ko-KR")}`}
        </span>
      </div>

      {/* 방향 선택 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <button
          onClick={() => setDirection("long")}
          style={{
            padding: "10px 0",
            borderRadius: 10,
            border: `1.5px solid ${direction === "long" ? UP_COLOR : "rgba(255,255,255,0.08)"}`,
            background: direction === "long" ? "rgba(34,197,94,0.12)" : "rgba(255,255,255,0.03)",
            color: direction === "long" ? UP_COLOR : "rgba(255,255,255,0.35)",
            fontWeight: 700, fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            transition: "all 0.15s",
          }}
        >
          <TrendingUp style={{ width: 14, height: 14 }} /> 롱 (매수)
        </button>
        <button
          onClick={() => setDirection("short")}
          style={{
            padding: "10px 0",
            borderRadius: 10,
            border: `1.5px solid ${direction === "short" ? DOWN_COLOR : "rgba(255,255,255,0.08)"}`,
            background: direction === "short" ? "rgba(239,68,68,0.12)" : "rgba(255,255,255,0.03)",
            color: direction === "short" ? DOWN_COLOR : "rgba(255,255,255,0.35)",
            fontWeight: 700, fontSize: 13, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            transition: "all 0.15s",
          }}
        >
          <TrendingDown style={{ width: 14, height: 14 }} /> 숏 (매도)
        </button>
      </div>

      {/* 금액 입력 */}
      <div>
        <label style={{ fontSize: 10, color: "rgba(212,175,55,0.5)", letterSpacing: "0.05em", display: "block", marginBottom: 5 }}>투자 금액 (USDT)</label>
        <input
          type="number"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          style={{
            width: "100%", padding: "9px 12px",
            borderRadius: 10, border: "1px solid rgba(212,175,55,0.2)",
            background: "rgba(255,255,255,0.04)", color: "#fff",
            fontSize: 14, fontVariantNumeric: "tabular-nums",
            outline: "none", boxSizing: "border-box",
          }}
          placeholder="0"
        />
        {/* 빠른 선택 */}
        <div style={{ display: "flex", gap: 5, marginTop: 6 }}>
          {[10000, 50000, 100000, 500000].map(v => (
            <button key={v} onClick={() => setAmount(String(v))}
              style={{
                flex: 1, padding: "4px 0", borderRadius: 6,
                border: "1px solid rgba(212,175,55,0.15)",
                background: "rgba(212,175,55,0.06)",
                color: "rgba(212,175,55,0.6)", fontSize: 10, cursor: "pointer",
              }}>
              {v >= 10000 ? `${v / 10000}만` : v}
            </button>
          ))}
        </div>
      </div>

      {/* 레버리지 */}
      <div>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <label style={{ fontSize: 10, color: "rgba(212,175,55,0.5)", letterSpacing: "0.05em" }}>레버리지</label>
          <span style={{ fontSize: 12, fontWeight: 700, color: GOLD }}>{leverage}x</span>
        </div>
        <input
          type="range" min={1} max={50} value={leverage}
          onChange={e => setLeverage(Number(e.target.value))}
          style={{ width: "100%", accentColor: GOLD }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
          {[1, 5, 10, 25, 50].map(v => (
            <button key={v} onClick={() => setLeverage(v)}
              style={{
                padding: "2px 6px", borderRadius: 5,
                border: `1px solid ${leverage === v ? GOLD : "rgba(212,175,55,0.12)"}`,
                background: leverage === v ? "rgba(212,175,55,0.15)" : "transparent",
                color: leverage === v ? GOLD : "rgba(255,255,255,0.3)",
                fontSize: 10, cursor: "pointer",
              }}>{v}x</button>
          ))}
        </div>
      </div>

      {/* 예상 포지션 크기 */}
      <div style={{
        background: "rgba(212,175,55,0.05)", border: "1px solid rgba(212,175,55,0.1)",
        borderRadius: 10, padding: "8px 12px",
        display: "flex", justifyContent: "space-between", alignItems: "center",
      }}>
        <span style={{ fontSize: 10, color: "rgba(212,175,55,0.5)" }}>포지션 크기</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(212,175,55,0.8)", fontVariantNumeric: "tabular-nums" }}>
          ${fmt(parseFloat(amount || "0") * leverage)}
        </span>
      </div>

      {/* 진입 버튼 */}
      <button
        onClick={handleOpen}
        disabled={isOpening}
        style={{
          width: "100%", padding: "12px 0",
          borderRadius: 12,
          border: "none",
          background: isOpening
            ? "rgba(255,255,255,0.08)"
            : direction === "long"
              ? "linear-gradient(135deg, #16a34a, #22c55e)"
              : "linear-gradient(135deg, #dc2626, #ef4444)",
          color: isOpening ? "rgba(255,255,255,0.3)" : "#fff",
          fontWeight: 800, fontSize: 14,
          cursor: isOpening ? "not-allowed" : "pointer",
          boxShadow: isOpening ? "none" : direction === "long"
            ? "0 4px 16px rgba(34,197,94,0.25)"
            : "0 4px 16px rgba(239,68,68,0.25)",
          transition: "all 0.15s",
        }}
      >
        {isOpening ? "처리중..." : balance === null ? "잔고 로딩중..." : direction === "long" ? "롱 진입" : "숏 진입"}
      </button>
    </div>
  )
}

// ─── 포지션 목록 ─────────────────────────────────────────────────
function PositionList({ positions, onClose }: { positions: Position[]; onClose: (id: string) => void }) {
  const containerBg = "rgba(5,13,10,0.95)"
  const borderColor = "rgba(212,175,55,0.18)"

  if (positions.length === 0) {
    return (
      <div style={{
        background: containerBg, border: `1px solid ${borderColor}`, borderRadius: 16,
        padding: "24px 16px", textAlign: "center",
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
        <span style={{ fontSize: 11, color: "rgba(212,175,55,0.6)", fontWeight: 600, letterSpacing: "0.05em" }}>보유 포지션 ({positions.length})</span>
      </div>
      {positions.map(pos => (
        <div key={pos.id} style={{
          padding: "10px 16px",
          borderBottom: "1px solid rgba(212,175,55,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8,
        }}>
          <div style={{ display: "flex", flex: 1, alignItems: "center", gap: 8 }}>
            <div style={{
              padding: "2px 7px", borderRadius: 5,
              background: pos.direction === "long" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
              border: `1px solid ${pos.direction === "long" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`,
              color: pos.direction === "long" ? UP_COLOR : DOWN_COLOR,
              fontSize: 9, fontWeight: 800,
            }}>{pos.direction === "long" ? "L" : "S"}</div>
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.85)", marginBottom: 1 }}>BTC/USDT <span style={{ color: "rgba(212,175,55,0.5)", fontWeight: 400 }}>{pos.leverage}x</span></p>
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", fontVariantNumeric: "tabular-nums" }}>${fmt(pos.entryPrice)}</p>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <p style={{
              fontSize: 12, fontWeight: 700, fontVariantNumeric: "tabular-nums",
              color: pos.pnl >= 0 ? UP_COLOR : DOWN_COLOR,
            }}>{pos.pnl >= 0 ? "+" : ""}${fmt(pos.pnl)}</p>
            <p style={{
              fontSize: 10, fontVariantNumeric: "tabular-nums",
              color: pos.pnlPct >= 0 ? "rgba(34,197,94,0.7)" : "rgba(239,68,68,0.7)",
            }}>{pos.pnlPct >= 0 ? "+" : ""}{pos.pnlPct.toFixed(2)}%</p>
          </div>
          <button
            onClick={() => onClose(pos.id)}
            style={{
              padding: "5px 10px", borderRadius: 7,
              border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.04)",
              color: "rgba(255,255,255,0.4)", fontSize: 10, cursor: "pointer",
            }}>청산</button>
        </div>
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
  const currentPriceRef = useRef<number | null>(null)

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
    // WebSocket 연결 전이면 전역 캐시 fallback 사용
    const price = currentPriceRef.current ?? (typeof window !== "undefined" ? (window as any).__bitcoinCurrentPrice ?? null : null)
    if (balance === null) return
    if (amount > balance) return

    const tempId = Date.now().toString()
    setOpeningId(tempId)
    try {
      const token = getToken()
      const res = await fetch("/api/user/trade", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
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
    const price = currentPriceRef.current
    if (!price) return
    const pos = positions.find(p => p.id === id)
    if (!pos) return

    setClosingId(id)
    try {
      const priceDiff = pos.direction === "long"
        ? price - pos.entryPrice
        : pos.entryPrice - price
      const pnl = (priceDiff / pos.entryPrice) * pos.amount * pos.leverage
      const payout = pos.amount + pnl

      const token = getToken()
      const res = await fetch("/api/user/trade", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          payout,
          note: `모의매매 청산 (${pos.direction === "long" ? "롱" : "숏"} ${pos.leverage}x, PnL: ${pnl >= 0 ? "+" : ""}${fmt(pnl)})`,
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
        exitPrice: price,
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
          <div className="lg:col-span-2 space-y-4">
            {/* 헤더 */}
            <LivePriceHeader />

            {/* 트레이딩 입력 패널 */}
            <TradingPanel
              positions={positions}
              balance={balance}
              onOpen={handleOpen}
              onClose={handleClose}
              isOpening={openingId !== null}
            />

            {/* 포지션 목록 */}
            <PositionList positions={positions} onClose={handleClose} />

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

            {/* 라이브 시세 리스트 */}
            <div style={{
              background: "#0a0b0f",
              border: "1px solid rgba(212,175,55,0.15)",
              borderRadius: 16,
              overflow: "hidden",
              height: "calc(100vh - 160px)",
            }}>
              <LivePricesTab />
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
