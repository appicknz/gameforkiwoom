"use client"

import { Suspense, useState, useEffect, useCallback, useRef } from "react"
import dynamic from "next/dynamic"
import { useRouter, useSearchParams } from "next/navigation"
import { ChevronDown, TrendingUp, TrendingDown, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { usePriceWorker } from "@/hooks/use-price-worker"
import SymbolSelectSheet from "@/components/trade/symbol-select-sheet"
import TradingBoardColumn from "@/components/trade/trading-board-column"

const SymbolChart = dynamic(() => import("@/components/trade/symbol-chart"), { ssr: false })

function normalizeSymbol(value: string | null): string {
  const symbol = (value ?? "BTCUSDT").toUpperCase().replace(/[^A-Z0-9]/g, "")
  return symbol.endsWith("USDT") ? symbol : `${symbol}USDT`
}

function getToken(): string | null {
  if (typeof window === "undefined") return null
  try { return localStorage.getItem("app_token") } catch { return null }
}

function fmtWon(n: number): string {
  const sign = n > 0 ? "+" : ""
  return sign + "₩" + Math.round(n).toLocaleString("ko-KR")
}

function fmtPrice(n: number): string {
  if (!n) return "0"
  return n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 4 : 2 })
}

type Direction = "long" | "short"

interface Position {
  id: string
  symbol: string
  direction: Direction
  entry_price: number
  margin: number
  leverage: number
  opened_at: string
}

interface ClosedLog {
  id: string
  direction: Direction
  entryPrice: number
  exitPrice: number
  pnl: number
  closedAt: number
}

const LEVERAGES = [2, 5, 10, 25, 50, 75, 100]
const PERCENTS = [10, 25, 50, 100]

function TradingPageContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [selectedSymbol, setSelectedSymbol] = useState(() => normalizeSymbol(searchParams.get("symbol")))
  const [isMounted, setIsMounted] = useState(false)
  const [symbolSheetOpen, setSymbolSheetOpen] = useState(false)
  const [balance, setBalance] = useState<number | null>(null)
  const [positions, setPositions] = useState<Position[]>([])
  const [logs, setLogs] = useState<ClosedLog[]>([])
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [direction, setDirection] = useState<Direction | null>(null)
  const [confirmDirection, setConfirmDirection] = useState<Direction | null>(null)
  const [leverage, setLeverage] = useState(10)
  const [amountInput, setAmountInput] = useState("")
  const [amountPercent, setAmountPercent] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loggedIn, setLoggedIn] = useState(false)
  const [tick, setTick] = useState(0)

  const priceRef = useRef<number | null>(null)
  const balanceRef = useRef<number | null>(null)
  const positionsRef = useRef<Position[]>([])

  useEffect(() => { priceRef.current = currentPrice }, [currentPrice])
  useEffect(() => { balanceRef.current = balance }, [balance])
  useEffect(() => { positionsRef.current = positions }, [positions])

  useEffect(() => {
    setIsMounted(true)
    setLoggedIn(Boolean(getToken()))
  }, [])

  useEffect(() => {
    const symbol = normalizeSymbol(searchParams.get("symbol"))
    setSelectedSymbol(symbol)
    setCurrentPrice(null)
    setPositions([])
  }, [searchParams])

  useEffect(() => {
    const selectSymbol = (event: Event) => {
      setSelectedSymbol(normalizeSymbol((event as CustomEvent<string>).detail))
      setCurrentPrice(null)
      setPositions([])
    }
    window.addEventListener("trading:symbol", selectSymbol)
    return () => window.removeEventListener("trading:symbol", selectSymbol)
  }, [])

  const handleSelectSymbol = useCallback((symbol: string) => {
    const normalized = normalizeSymbol(symbol)
    setSelectedSymbol(normalized)
    setCurrentPrice(null)
    setPositions([])
    setSymbolSheetOpen(false)
    router.replace(`/trading?symbol=${encodeURIComponent(normalized)}`, { scroll: false })
  }, [router])

  // 앱 전역 단일 가격 소스(Railway) — 차트 WS 연결과 무관하게 진입가/평가가는 항상 이 값으로 갱신
  const handleWorkerPrice = useCallback((price: number) => {
    if (selectedSymbol === "BTCUSDT") setCurrentPrice(price)
  }, [selectedSymbol])
  usePriceWorker({ onPrice: handleWorkerPrice })

  // 1초 tick — 오픈 포지션 실시간 PnL 갱신용
  useEffect(() => {
    if (positions.length === 0) return
    const t = setInterval(() => setTick((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [positions.length])

  const fetchBalance = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const res = await fetch("/api/user/trade", { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        const d = await res.json()
        if (d?.balance !== undefined) setBalance(d.balance)
      }
    } catch {}
  }, [])

  const fetchPositions = useCallback(async () => {
    const token = getToken()
    if (!token) return
    const priceParam = priceRef.current ? `?prices=${selectedSymbol}:${priceRef.current}` : ""
    try {
      const res = await fetch(`/api/user/trade/positions${priceParam}`, { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) return
      const d = await res.json()
      const rows: Position[] = (d.positions ?? []).filter((p: Position & { liquidated?: boolean }) => p.symbol === selectedSymbol && !("liquidated" in p && p.liquidated))
      setPositions(rows)
    } catch {}
  }, [selectedSymbol])

  useEffect(() => {
    if (!loggedIn) return
    fetchBalance()
    fetchPositions()
    const poll = setInterval(() => { fetchBalance(); fetchPositions() }, 15_000)
    return () => clearInterval(poll)
  }, [loggedIn, fetchBalance, fetchPositions])

  const handlePrice = useCallback((price: number) => {
    setCurrentPrice(price)
  }, [])

  const handleOpen = async (requestedDirection: Direction | null = direction) => {
    setError(null)
    if (!requestedDirection) { setError("롱 또는 숏을 선택해주세요."); return }
    const token = getToken()
    if (!token) { setError("로그인이 필요합니다."); return }
    const amount = Math.round(Number(amountInput))
    const bal = balanceRef.current
    if (!amount || amount <= 0) { setError("금액을 입력해주세요."); return }
    if (bal !== null && amount > bal) { setError("잔고가 부족합니다."); return }
    if (!priceRef.current) { setError("가격을 불러오는 중입니다."); return }

    setSubmitting(true)
    try {
      const res = await fetch("/api/user/trade/positions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ symbol: selectedSymbol, direction: requestedDirection, leverage, amount, current_price: priceRef.current }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? `진입 실패 (${res.status})`); return }
      setBalance(data.newBalance)
      setAmountInput("")
      setAmountPercent(null)
      setConfirmDirection(null)
      await fetchPositions()
    } finally {
      setSubmitting(false)
    }
  }

  const requestOpen = (nextDirection: Direction) => {
    setError(null)
    setDirection(nextDirection)
    setConfirmDirection(nextDirection)
  }

  const confirmOpen = async () => {
    if (!confirmDirection) return
    const selectedAmount = Math.round(Number(amountInput))
    if (!Number.isFinite(selectedAmount) || selectedAmount <= 0) {
      setError("증������을 선택하거나 입력해주세요.")
      return
    }
    await handleOpen(confirmDirection)
  }

  const handleClose = async (pos: Position) => {
    const token = getToken()
    if (!token) return
    setClosingId(pos.id)
    try {
      const res = await fetch("/api/user/trade/positions", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ position_id: pos.id, current_price: priceRef.current }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.error ?? `청산 실패 (${res.status})`); return }
      setBalance(Number(data.newBalance))
      balanceRef.current = Number(data.newBalance)
      setPositions((prev) => prev.filter((p) => p.id !== pos.id))
      await fetchBalance()
      setLogs((l) => [{
        id: Date.now().toString(),
        direction: pos.direction,
        entryPrice: Number(pos.entry_price),
        exitPrice: data.exit_price,
        pnl: data.pnl,
        closedAt: Date.now(),
      }, ...l].slice(0, 10))
    } finally {
      setClosingId(null)
    }
  }

  const applyPercent = (pct: number) => {
    const bal = balanceRef.current ?? 0
    setAmountPercent(pct)
    setAmountInput(String(Math.floor((bal * pct) / 100)))
  }

  function livePnl(pos: Position) {
    const cur = currentPrice ?? Number(pos.entry_price)
    const entry = Number(pos.entry_price)
    if (!cur || !entry) return { pnl: 0, pct: 0 }
    const delta = pos.direction === "long" ? (cur - entry) / entry : (entry - cur) / entry
    return { pnl: Math.round(Number(pos.margin) * delta * pos.leverage), pct: delta * pos.leverage * 100 }
  }

  const liqPrice = currentPrice
    ? direction === "long"
      ? currentPrice * (1 - 1 / leverage)
      : currentPrice * (1 + 1 / leverage)
    : null

  const totals = positions.reduce((sum, position) => {
    const result = livePnl(position)
    return { pnl: sum.pnl + result.pnl, margin: sum.margin + Number(position.margin) }
  }, { pnl: 0, margin: 0 })
  const totalPnl = totals.pnl
  const totalRoi = totals.margin > 0 ? (totalPnl / totals.margin) * 100 : 0

  return (
    <div className="min-h-screen bg-background pb-8">
      <div className="mx-auto w-full max-w-7xl p-3 md:p-5">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
          <main className="order-1 min-w-0 space-y-4 lg:col-span-2" aria-label="트레이딩">

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          {isMounted ? (
            <button
              type="button"
              onClick={() => setSymbolSheetOpen(true)}
              className="group flex h-[72px] items-center gap-2 rounded-xl bg-card px-3 py-1.5 text-left transition-colors hover:bg-accent"
            >
              <div>
                <div className="flex items-center gap-1 text-xs font-semibold text-foreground md:text-base">
                  종목 선택
                  <span className="text-sm font-semibold text-muted-foreground">{selectedSymbol.replace("USDT", "/USDT")}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-hover:text-foreground" />
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {currentPrice ? `현재가 $${fmtPrice(currentPrice)}` : "레버리지 매매"}
                </p>
              </div>
            </button>
          ) : (
            <div className="group flex h-[72px] items-center gap-3 rounded-xl bg-card px-3 py-2 text-left">
              <div>
                <div className="flex items-center gap-1 text-xs font-semibold text-foreground md:text-base">
                  종목 선택
                  <span className="text-sm font-semibold text-muted-foreground">{selectedSymbol.replace("USDT", "/USDT")}</span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">레버리지 매매</p>
              </div>
            </div>
          )}
          <div className="flex h-[72px] items-center gap-2 rounded-xl bg-card px-3 py-1">
            <div className="hidden text-right md:block">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Total ROI</p>
              <p className={cn("text-sm font-bold tabular-nums", totalPnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                {totalRoi >= 0 ? "+" : ""}{totalRoi.toFixed(2)}%
              </p>
            </div>
            <div className="hidden h-7 w-px bg-border md:block" />
            <div className="text-right">
              <p className="hidden text-[10px] font-medium uppercase tracking-wide text-muted-foreground md:block">Total PNL</p>
              <p className={cn("text-sm font-bold tabular-nums", totalPnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                {fmtWon(totalPnl)}
              </p>
              <p className={cn("text-[10px] font-bold tabular-nums md:hidden", totalPnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                TOTAL ROI {totalRoi >= 0 ? "+" : ""}{totalRoi.toFixed(2)}%
              </p>
            </div>
          </div>
        </div>

        {/* 차트 */}
        <div className="overflow-hidden rounded-xl bg-card">
          <SymbolChart
            symbol={selectedSymbol}
            height={320}
            onPrice={handlePrice}
            livePrice={currentPrice}
            positions={positions.map((p) => ({
              id: p.id,
              symbol: p.symbol,
              direction: p.direction,
              entryPrice: Number(p.entry_price),
              leverage: p.leverage,
            }))}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* 주문 패널 */}
            <div className="rounded-xl border border-border bg-card p-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => requestOpen("long")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-bold transition-colors",
                    direction === "long"
                      ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-500"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <TrendingUp className="w-4 h-4" /> 롱 (상승)
                </button>
                <button
                  onClick={() => requestOpen("short")}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg border py-2.5 text-sm font-bold transition-colors",
                    direction === "short"
                      ? "border-red-500/60 bg-red-500/10 text-red-500"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  <TrendingDown className="w-4 h-4" /> 숏 (하락)
                </button>
              </div>

              {/* 레버리지 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">레버리지</span>
                  <span className="text-sm font-bold text-primary tabular-nums">{leverage}x</span>
                </div>
                <div className="-mx-1 px-1 py-1 md:py-0">
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={leverage}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                  className="h-8 min-h-8 w-full touch-none accent-primary md:h-5 md:min-h-5"
                  aria-label="레버리지 배율"
                  />
                </div>
                <div className="flex gap-1">
                  {LEVERAGES.map((lv) => (
                    <button
                      key={lv}
                      onClick={() => setLeverage(lv)}
                      className={cn(
                        "flex-1 rounded-md border py-1 text-[10px] font-semibold transition-colors",
                        leverage === lv ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {lv}x
                    </button>
                  ))}
                </div>
              </div>

              {/* 금액 */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground">투자 금액 (증거금)</span>
                  {liqPrice && (
                    <span className="text-[10px] text-muted-foreground">
                      청산가 <span className="tabular-nums">${fmtPrice(liqPrice)}</span>
                    </span>
                  )}
                </div>
                <input
                  type="number"
                  min={0}
                  value={amountInput}
                  onChange={(e) => {
                    setAmountInput(e.target.value)
                    setAmountPercent(null)
                  }}
                  placeholder="금액 입력"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary tabular-nums"
                />
                <div className="-mx-1 px-1 py-1 md:py-0">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={amountPercent ?? 0}
                    onChange={(e) => applyPercent(Number(e.target.value))}
                    className="h-8 min-h-8 w-full touch-none accent-emerald-500 md:h-5 md:min-h-5"
                    aria-label="투자 금액 비율"
                  />
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>잔고 기준 투자 비율</span>
                  <span className="font-semibold text-emerald-500">{amountPercent ?? 0}%</span>
                </div>
                <div className="flex gap-1">
                  {PERCENTS.map((pct) => (
                    <button
                      key={pct}
                      onClick={() => applyPercent(pct)}
                      className={cn(
                        "flex-1 rounded-md border py-1 text-[10px] font-semibold transition-colors",
                        amountPercent === pct
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-500"
                          : "border-border text-muted-foreground hover:border-emerald-500/50 hover:text-emerald-500",
                      )}
                    >
                      {pct === 100 ? "MAX" : `${pct}%`}
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <p className="text-center text-[10px] text-muted-foreground">롱 또는 숏을 선택하면 주문 확인창이 열립니다.</p>
            </div>

            {/* 포지션 + 최근 청산 */}
            <div className="space-y-4">
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                  <span className="text-xs font-semibold text-foreground">오픈 포지션</span>

                </div>
                {positions.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-muted-foreground">보유 중인 포지션이 없습니다.</p>
                ) : (
                  <div className="divide-y divide-border">
                    {positions.map((pos) => {
                      const { pnl, pct } = livePnl(pos)
                      const isLong = pos.direction === "long"
                      return (
                        <div key={pos.id} className="flex items-center justify-between px-4 py-2.5 gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-foreground">
                              {isLong ? "롱" : "숏"} <span className="text-muted-foreground font-normal">{pos.leverage}x</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground tabular-nums">
                              진입 ${fmtPrice(Number(pos.entry_price))}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className={cn("text-xs font-bold tabular-nums", pnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                              {fmtWon(pnl)}
                            </p>
                            <p className={cn("text-[10px] tabular-nums", pnl >= 0 ? "text-emerald-500/70" : "text-red-500/70")}>
                              {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleClose(pos)}
                            disabled={closingId === pos.id}
                            className="h-7 w-7 p-0 shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {logs.length > 0 && (
                <div className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-border">
                    <span className="text-xs font-semibold text-foreground">최근 청산</span>
                  </div>
                  <div className="divide-y divide-border">
                    {logs.map((log) => (
                      <div key={log.id} className="flex items-center justify-between px-4 py-2 gap-3">
                        <p className="text-[11px] font-medium text-foreground">
                          {log.direction === "long" ? "롱" : "숏"}{" "}
                          <span className="text-muted-foreground tabular-nums">
                            ${fmtPrice(log.entryPrice)} → ${fmtPrice(log.exitPrice)}
                          </span>
                        </p>
                        <span className={cn("text-xs font-bold tabular-nums", log.pnl >= 0 ? "text-emerald-500" : "text-red-500")}>
                          {fmtWon(log.pnl)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
          </main>
          <aside className="order-2 min-w-0 lg:sticky lg:top-4" aria-label="트레이딩 피드">
            <TradingBoardColumn />
          </aside>
        </div>
      </div>

      <Dialog open={confirmDirection !== null} onOpenChange={(open) => !open && setConfirmDirection(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{confirmDirection === "long" ? "롱 주문 확인" : "숏 주문 확인"}</DialogTitle>
            <DialogDescription>선택한 레버리지와 금액으로 주문을 제출합니다.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 rounded-lg border border-border bg-card p-3 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">종목</span><strong>{selectedSymbol}</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">방향</span><strong className={confirmDirection === "long" ? "text-emerald-500" : "text-red-500"}>{confirmDirection === "long" ? "롱 (상승)" : "숏 (하락)"}</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">레버리지</span><strong>{leverage}x</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">증거금</span><strong>{Number(amountInput) > 0 ? `₩${Number(amountInput).toLocaleString("ko-KR")}` : "미입력"}</strong></div>
            <div className="flex justify-between"><span className="text-muted-foreground">현재가</span><strong>${currentPrice ? fmtPrice(currentPrice) : "-"}</strong></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDirection(null)}>취소</Button>
            <Button onClick={confirmOpen} disabled={submitting || !currentPrice || !amountInput} className={confirmDirection === "long" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}>
              {submitting ? "주문 중..." : "확인하고 주문"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <SymbolSelectSheet
        open={symbolSheetOpen}
        onOpenChange={setSymbolSheetOpen}
        selectedSymbol={selectedSymbol}
        onSelect={handleSelectSymbol}
      />
    </div>
  )
}

export default function TradingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" aria-label="트레이딩 로딩 중" />}>
      <TradingPageContent />
    </Suspense>
  )
}
