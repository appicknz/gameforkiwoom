"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, Clock, X, RotateCcw, Lock, Unlock, Bot, ChevronDown, ChevronUp, Shuffle } from "lucide-react"
import { usePriceWorker } from "@/hooks/use-price-worker"

type BetDirection = "long" | "short" | null
type BetDigit = "under" | "over" | null
type BetParity = "odd" | "even" | null
type BetType = "direction" | "digit" | "parity"

interface RoundResult {
  round: number
  direction: BetDirection
  digit: BetDigit
  parity: BetParity
  basePrice: number
  closePrice: number
  wonDirection: boolean
  wonDigit: boolean
  wonParity: boolean
  directionAmount: number
  digitAmount: number
  parityAmount: number
}

// 금액 칩
const CHIPS = [
  { label: "1만", value: 10_000 },
  { label: "5만", value: 50_000 },
  { label: "10만", value: 100_000 },
  { label: "50만", value: 500_000 },
  { label: "100만", value: 1_000_000 },
]

// PAYOUT_RATIO: 배팅 금액 × 1.95 지급
const PAYOUT_RATIO = 1.95

interface AutoBetConfig {
  enabled: boolean
  direction: "long" | "short" | "random" | null
  digit: "over" | "under" | "random" | null
  parity: "odd" | "even" | "random" | null
  amount: number
  maxRounds: number | null
  maxLoss: number | null
}

const DEFAULT_AUTO_BET: AutoBetConfig = {
  enabled: false,
  direction: "random",
  digit: null,
  parity: null,
  amount: 10_000,
  maxRounds: 10,
  maxLoss: 100_000,
}

// 토큰 읽기 - top-bar1.tsx와 동일한 키("app_token") 사용
function getToken(): string | null {
  if (typeof window === "undefined") return null
  try {
    return localStorage.getItem("app_token")
  } catch {
    return null
  }
}

interface BetDialogProps {
  open: boolean
  betType: BetType | null
  selectedValue: string | null
  onClose: () => void
  onConfirm: (amount: number) => void
  isLoading: boolean
  balance: number | null
  locked: boolean
  lockedAmount: number | null
  onLockChange: (locked: boolean, amount: number | null) => void
  canBet: boolean
}

function BetDialog({ open, betType, selectedValue, onClose, onConfirm, isLoading, balance, locked, lockedAmount, onLockChange, canBet }: BetDialogProps) {
  const [selectedChip, setSelectedChip] = useState<number | null>(null)
  const [amount, setAmount] = useState(0)

  useEffect(() => {
    if (open) {
      if (locked && lockedAmount !== null) {
        setSelectedChip(lockedAmount)
        setAmount(lockedAmount)
      } else {
        setSelectedChip(null)
        setAmount(0)
      }
    }
  }, [open])

  const handleChip = (value: number) => {
    if (selectedChip === value) {
      setAmount((prev) => prev + value)
    } else {
      setSelectedChip(value)
      setAmount(value)
    }
  }

  const handleReset = () => {
    setSelectedChip(null)
    setAmount(0)
  }

  const labelMap: Record<string, { text: string; color: string; bg: string; border: string }> = {
    long:  { text: "롱",   color: "#10b981", bg: "rgba(16,185,129,0.12)", border: "#10b981" },
    short: { text: "숏",   color: "#ef4444", bg: "rgba(239,68,68,0.12)",  border: "#ef4444" },
    over:  { text: "오버", color: "#f97316", bg: "rgba(249,115,22,0.12)", border: "#f97316" },
    under: { text: "언더", color: "#60a5fa", bg: "rgba(96,165,250,0.12)", border: "#60a5fa" },
    odd:   { text: "홀",   color: "#8b5cf6", bg: "rgba(139,92,246,0.12)", border: "#8b5cf6" },
    even:  { text: "짝",   color: "#ec4899", bg: "rgba(236,72,153,0.12)", border: "#ec4899" },
  }

  const meta = selectedValue ? labelMap[selectedValue] : null

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />
      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl shadow-2xl border-t border-border max-w-lg mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-border">
          <div className="flex items-center gap-2">
            <span
              className="px-3 py-1 rounded-full text-sm font-bold"
              style={{ background: meta?.bg, color: meta?.color, border: `1px solid ${meta?.border}` }}
            >
              {meta?.text}
            </span>
            <span className="text-sm font-semibold text-foreground">배팅</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 잔고 표시 */}
          {balance !== null && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>잔고</span>
              <span className="font-semibold tabular-nums">₩{balance.toLocaleString()}</span>
            </div>
          )}

          {/* 현재 배팅 금액 */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">배팅 금액</span>
            <div className="flex items-center gap-2">
              <span
                className="text-xl font-bold tabular-nums"
                style={{ color: balance !== null && amount > balance ? "#ef4444" : amount > 0 ? meta?.color : "hsl(var(--muted-foreground))" }}
              >
                ₩{amount.toLocaleString()}
              </span>
              {amount > 0 && balance !== null && amount <= balance && (
                <span className="text-[10px] text-muted-foreground">
                  → ₩{Math.floor(amount * PAYOUT_RATIO).toLocaleString()} 예상
                </span>
              )}
              {balance !== null && amount > balance && (
                <span className="text-[10px] text-red-500">잔고 부족</span>
              )}
            </div>
          </div>

          {/* 금액 칩 버튼 */}
          <div className="grid grid-cols-5 gap-2">
            {CHIPS.map(({ label, value }) => {
              const isActive = selectedChip === value
              return (
                <button
                  key={value}
                  onClick={() => handleChip(value)}
                  className="py-2.5 rounded-xl text-xs font-bold border transition-all duration-150 active:scale-95"
                  style={{
                    background: isActive ? "rgba(16,185,129,0.15)" : "hsl(var(--muted))",
                    borderColor: isActive ? "#10b981" : "transparent",
                    color: isActive ? "#10b981" : "hsl(var(--muted-foreground))",
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          {/* 고정 상태 배너 */}
          {locked && lockedAmount !== null && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-500/10 border border-emerald-500/30 text-emerald-600">
              <Lock className="w-3 h-3" />
              배팅 ₩{lockedAmount.toLocaleString()}으로 고정됨
            </div>
          )}

          {/* 초기화 + 고정 + 배팅 버튼 */}
          <div className="flex gap-2 pb-safe">
            <button
              onClick={handleReset}
              className="flex items-center justify-center gap-1 px-4 py-3 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all text-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              초기화
            </button>
            <button
              onClick={() => {
                if (locked) {
                  onLockChange(false, null)
                } else if (amount > 0) {
                  onLockChange(true, amount)
                }
              }}
              className="flex items-center justify-center gap-1 px-4 py-3 rounded-xl border transition-all text-sm font-semibold"
              style={
                locked
                  ? { background: "rgba(16,185,129,0.1)", borderColor: "rgba(16,185,129,0.4)", color: "#10b981" }
                  : { background: "hsl(var(--muted))", borderColor: "transparent", color: "hsl(var(--muted-foreground))" }
              }
            >
              {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              {locked ? "해제" : "고정"}
            </button>
            <button
              onClick={() => amount > 0 && canBet && onConfirm(amount)}
              disabled={amount <= 0 || isLoading || (balance !== null && amount > balance) || !canBet}
              className="flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-150 active:scale-[0.98] disabled:opacity-40"
              style={{
                background: amount > 0 && canBet ? meta?.color : "hsl(var(--muted))",
                color: amount > 0 && canBet ? "#fff" : "hsl(var(--muted-foreground))",
              }}
            >
              {isLoading ? "처리 중..." : !canBet ? "배팅 마감" : `₩${amount.toLocaleString()} 배팅`}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

interface ResultSheetProps {
  result: RoundResult | null
  open: boolean
  onClose: () => void
}

function ResultSheet({ result, open, onClose }: ResultSheetProps) {
  if (!open || !result) return null

  const lastDigit = Math.floor(Math.abs(result.closePrice * 100)) % 10
  const priceChange = result.closePrice - result.basePrice
  const isUp = priceChange >= 0

  const labelMap: Record<string, { text: string; color: string; bg: string }> = {
    long:  { text: "롱",   color: "#10b981", bg: "rgba(16,185,129,0.12)" },
    short: { text: "숏",   color: "#ef4444", bg: "rgba(239,68,68,0.12)"  },
    over:  { text: "오버", color: "#f97316", bg: "rgba(249,115,22,0.12)" },
    under: { text: "언더", color: "#60a5fa", bg: "rgba(96,165,250,0.12)" },
    odd:   { text: "홀",   color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
    even:  { text: "짝",   color: "#ec4899", bg: "rgba(236,72,153,0.12)" },
  }

  const bets = [
    result.direction && {
      key: result.direction,
      label: labelMap[result.direction],
      won: result.wonDirection,
      amount: result.directionAmount,
    },
    result.digit && {
      key: result.digit,
      label: labelMap[result.digit],
      won: result.wonDigit,
      amount: result.digitAmount,
    },
    result.parity && {
      key: result.parity,
      label: labelMap[result.parity],
      won: result.wonParity,
      amount: result.parityAmount,
    },
  ].filter(Boolean) as { key: string; label: { text: string; color: string; bg: string }; won: boolean; amount: number }[]

  const totalBet = bets.reduce((s, b) => s + b.amount, 0)
  const totalPayout = bets.filter(b => b.won).reduce((s, b) => s + Math.floor(b.amount * PAYOUT_RATIO), 0)
  const netProfit = totalPayout - totalBet
  const allWon = bets.every(b => b.won)
  const allLost = bets.every(b => !b.won)

  return (
    <>
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto">
        <div className="bg-background rounded-t-2xl shadow-2xl border-t border-border overflow-hidden">
          {/* 상단 결과 헤더 */}
          <div
            className="px-5 pt-5 pb-4 flex items-center justify-between"
            style={{
              background: allWon
                ? "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(16,185,129,0.05))"
                : allLost
                ? "linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))"
                : "linear-gradient(135deg, rgba(249,115,22,0.12), rgba(249,115,22,0.04))",
            }}
          >
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">라운드 #{result.round} 결과</p>
              <p
                className="text-2xl font-black tracking-tight"
                style={{ color: allWon ? "#10b981" : allLost ? "#ef4444" : "#f97316" }}
              >
                {allWon ? "전체 승리!" : allLost ? "전체 패배" : "부분 승리"}
              </p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                끝자리 <span className="font-bold text-foreground">{lastDigit}</span>
                {"  "}
                {isUp ? "▲" : "▼"} ${Math.abs(priceChange).toFixed(1)}
              </p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1.5 rounded-full hover:bg-muted">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-3">
            {/* 종목별 결과 */}
            {bets.map((bet) => {
              const payout = bet.won ? Math.floor(bet.amount * PAYOUT_RATIO) : 0
              const net = payout - bet.amount
              return (
                <div
                  key={bet.key}
                  className="flex items-center gap-3 p-3 rounded-xl border"
                  style={{
                    background: bet.won ? "rgba(16,185,129,0.06)" : "rgba(239,68,68,0.06)",
                    borderColor: bet.won ? "rgba(16,185,129,0.2)" : "rgba(239,68,68,0.2)",
                  }}
                >
                  {/* 종목 배지 */}
                  <span
                    className="text-sm font-bold px-2.5 py-1 rounded-lg shrink-0"
                    style={{ background: bet.label.bg, color: bet.label.color }}
                  >
                    {bet.label.text}
                  </span>

                  {/* 배팅 정보 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">배팅</p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      ₩{bet.amount.toLocaleString()}
                    </p>
                  </div>

                  {/* 결과 */}
                  <div className="text-right shrink-0">
                    <p className="text-[10px] text-muted-foreground mb-0.5">
                      {bet.won ? "수익" : "손실"}
                    </p>
                    <p
                      className="text-sm font-bold tabular-nums"
                      style={{ color: bet.won ? "#10b981" : "#ef4444" }}
                    >
                      {bet.won
                        ? `+₩${payout.toLocaleString()}`
                        : `-₩${bet.amount.toLocaleString()}`}
                    </p>
                    {bet.won && (
                      <p className="text-[9px] text-muted-foreground">
                        순수익 +₩{net.toLocaleString()}
                      </p>
                    )}
                  </div>

                  {/* 승패 아이콘 */}
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-black"
                    style={{
                      background: bet.won ? "#10b981" : "#ef4444",
                      color: "#fff",
                    }}
                  >
                    {bet.won ? "승" : "패"}
                  </div>
                </div>
              )
            })}

            {/* 총 합계 */}
            <div className="border-t border-border pt-3 flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">총 배팅</p>
                <p className="text-sm font-semibold tabular-nums text-foreground">₩{totalBet.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">순손익</p>
                <p
                  className="text-lg font-black tabular-nums"
                  style={{ color: netProfit >= 0 ? "#10b981" : "#ef4444" }}
                >
                  {netProfit >= 0 ? "+" : ""}₩{netProfit.toLocaleString()}
                </p>
              </div>
            </div>

            {/* 닫기 버튼 */}
            <button
              onClick={onClose}
              className="w-full py-3 rounded-xl bg-muted text-muted-foreground font-semibold text-sm hover:bg-muted/80 transition-colors mb-safe"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

export function BettingGame() {
  const [timeLeft, setTimeLeft] = useState(30)
  const [roundNumber, setRoundNumber] = useState(0)
  const [betDirection, setBetDirection] = useState<BetDirection>(null)
  const [betDigit, setBetDigit] = useState<BetDigit>(null)
  const [betParity, setBetParity] = useState<BetParity>(null)
  const [betDirectionAmount, setBetDirectionAmount] = useState(0)
  const [betDigitAmount, setBetDigitAmount] = useState(0)
  const [betParityAmount, setBetParityAmount] = useState(0)
  const [basePrice, setBasePrice] = useState<number | null>(null)
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [phase, setPhase] = useState<"betting" | "waiting" | "result">("betting")
  const [lastResult, setLastResult] = useState<RoundResult | null>(null)
  const [results, setResults] = useState<RoundResult[]>([])
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [balance, setBalance] = useState<number | null>(null)
  const [showResultSheet, setShowResultSheet] = useState(false)

  // 로그인 시 잔고 로드 (supabase.auth 사용 안 함 - lock 경합 방지)
  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetch("/api/user/balance", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((d) => setBalance(d.balance ?? 0))
      .catch(console.error)
  }, [])

  // 다이얼로그 상태
  const [dialog, setDialog] = useState<{ open: boolean; type: BetType; value: string } | null>(null)
  const [isPlacingBet, setIsPlacingBet] = useState(false)
  const [locked, setLocked] = useState(false)
  const [lockedAmount, setLockedAmount] = useState<number | null>(null)

  // 자동 배팅
  const [autoBet, setAutoBet] = useState<AutoBetConfig>(DEFAULT_AUTO_BET)
  const [autoBetOpen, setAutoBetOpen] = useState(false)
  const [autoBetRounds, setAutoBetRounds] = useState(0)
  const [autoBetPnl, setAutoBetPnl] = useState(0)
  const autoBetRef = useRef<AutoBetConfig>(DEFAULT_AUTO_BET)
  const autoBetRoundsRef = useRef(0)
  const autoBetPnlRef = useRef(0)
  const autoBetFiredRef = useRef(false)

  const prevRoundRef = useRef<number | null>(null)
  const betRef = useRef<BetDirection>(null)
  const betDigitRef = useRef<BetDigit>(null)
  const betParityRef = useRef<BetParity>(null)
  const betDirectionAmountRef = useRef(0)
  const betDigitAmountRef = useRef(0)
  const betParityAmountRef = useRef(0)
  const basePriceRef = useRef<number | null>(null)
  const roundRef = useRef<number>(0)
  const closingPricesRef = useRef<Array<{ time: number; price: number }>>([])
  const currentPriceRef = useRef<number | null>(null)

  const getRoundNumber = useCallback(() => {
    const now = Math.floor(Date.now() / 1000)
    return Math.floor(now / 30)
  }, [])

  // 새로고침 대비: localStorage에서 이전 배팅 복원 (getRoundNumber 이후에 위치해야 함)
  useEffect(() => {
    try {
      const raw = localStorage.getItem("game_pending_bet")
      if (!raw) return
      const saved = JSON.parse(raw) as {
        round: number
        direction: BetDirection
        digit: BetDigit
        parity: BetParity
        basePrice: number
        directionAmount: number
        digitAmount: number
        parityAmount: number
      }
      const currentRound = getRoundNumber()
      if (saved.round !== currentRound) {
        localStorage.removeItem("game_pending_bet")
        return
      }
      betRef.current = saved.direction
      betDigitRef.current = saved.digit
      betParityRef.current = saved.parity
      basePriceRef.current = saved.basePrice
      betDirectionAmountRef.current = saved.directionAmount
      betDigitAmountRef.current = saved.digitAmount
      betParityAmountRef.current = saved.parityAmount
      if (saved.direction) setBetDirection(saved.direction)
      if (saved.digit) setBetDigit(saved.digit)
      if (saved.parity) setBetParity(saved.parity)
      setBasePrice(saved.basePrice)
      if (saved.directionAmount) setBetDirectionAmount(saved.directionAmount)
      if (saved.digitAmount) setBetDigitAmount(saved.digitAmount)
      if (saved.parityAmount) setBetParityAmount(saved.parityAmount)
      setPhase("waiting")
    } catch {}
  }, [getRoundNumber])

  // 잔고 동기화: SSE는 top-bar1.tsx에서 담당, balance:update 이벤트로 수신
  useEffect(() => {
    const handler = (e: Event) => {
      const v = (e as CustomEvent<number>).detail
      if (typeof v === "number") setBalance(v)
    }
    window.addEventListener("balance:update", handler)
    return () => window.removeEventListener("balance:update", handler)
  }, [])

  usePriceWorker({
    onPrice: useCallback((price: number) => {
      setCurrentPrice(price)
      currentPriceRef.current = price
    }, []),
    onClosingPrice: useCallback((price: number, time: number) => {
      // 새 30초봉 마감가 도착 — 배열에 추가
      closingPricesRef.current = [...closingPricesRef.current, { time, price }].slice(-100)

      // 배팅이 없으면 이 가격이 새 배팅 기준가
      if (!betRef.current && !betDigitRef.current && !betParityRef.current) {
        setBasePrice(price)
        basePriceRef.current = price
        return
      }

      // 배팅이 있으면 이 가격으로 즉시 정산 (타이머 기반 아님 — 정확한 타이밍 보장)
      if (!(betRef.current || betDigitRef.current || betParityRef.current)) return
      if (basePriceRef.current === null) return

      const closePrice = price
      const lastDigit = Math.floor(Math.abs(closePrice * 100)) % 10
      const wonDirection = betRef.current ? (betRef.current === "long" ? closePrice >= basePriceRef.current : closePrice < basePriceRef.current) : false
      const wonDigit = betDigitRef.current ? (betDigitRef.current === "under" ? lastDigit <= 4 : lastDigit >= 5) : false
      const wonParity = betParityRef.current ? (betParityRef.current === "odd" ? lastDigit % 2 !== 0 : lastDigit % 2 === 0) : false

      const token = getToken()
      if (token) {
        fetch("/api/user/game/play", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            basePrice: basePriceRef.current,
            closePrice,
            bets: {
              direction: betRef.current ?? undefined,
              directionAmount: betRef.current ? betDirectionAmountRef.current : undefined,
              digit: betDigitRef.current ?? undefined,
              digitAmount: betDigitRef.current ? betDigitAmountRef.current : undefined,
              parity: betParityRef.current ?? undefined,
              parityAmount: betParityRef.current ? betParityAmountRef.current : undefined,
            },
          }),
        })
          .then(r => r.json())
          .then(data => {
            if (typeof data.newBalance === "number") {
              setBalance(data.newBalance)
              window.dispatchEvent(new CustomEvent("balance:update", { detail: data.newBalance }))
            }
          })
          .catch(console.error)
      }

      const result: RoundResult = {
        round: roundRef.current,
        direction: betRef.current,
        digit: betDigitRef.current,
        parity: betParityRef.current,
        basePrice: basePriceRef.current,
        closePrice,
        wonDirection,
        wonDigit,
        wonParity,
        directionAmount: betDirectionAmountRef.current,
        digitAmount: betDigitAmountRef.current,
        parityAmount: betParityAmountRef.current,
      }
      setLastResult(result)
      setShowResultSheet(true)
      setResults((prev) => [result, ...prev].slice(0, 20))
      const anyWon = (betRef.current && wonDirection) || (betDigitRef.current && wonDigit) || (betParityRef.current && wonParity)
      const anyLost = (betRef.current && !wonDirection) || (betDigitRef.current && !wonDigit) || (betParityRef.current && !wonParity)
      if (anyWon) setWins((w) => w + 1)
      if (anyLost) setLosses((l) => l + 1)
      setPhase("result")

      // 배팅 초기화 및 다음 라운드 준비
      betRef.current = null; betDigitRef.current = null; betParityRef.current = null
      betDirectionAmountRef.current = 0; betDigitAmountRef.current = 0; betParityAmountRef.current = 0
      setBetDirection(null); setBetDigit(null); setBetParity(null)
      setBetDirectionAmount(0); setBetDigitAmount(0); setBetParityAmount(0)
      // 정산 완료 후 새 배팅가 설정 (onClosingPrice가 전달한 price가 새 라운드 배팅가)
      setBasePrice(price)
      basePriceRef.current = price
      setDialog(null)
      setTimeout(() => setPhase("betting"), 1500)
      try { localStorage.removeItem("game_pending_bet") } catch {}
    }, []),
    onInitClosing: useCallback((prices: Array<{ time: number; price: number }>) => {
      closingPricesRef.current = prices
      // 초기 로딩 시 가장 최신 마감가를 배팅 기준가로 설정
      if (prices.length > 0) {
        const latest = prices[prices.length - 1].price
        setBasePrice(latest)
        basePriceRef.current = latest
      }
    }, []),
  })

  // 라운드 타이머 + 결산
  useEffect(() => {
    const tick = setInterval(() => {
      const now = Math.floor(Date.now() / 1000)
      const secondInPeriod = now % 30
      const remaining = 30 - secondInPeriod
      setTimeLeft(remaining)

      const round = getRoundNumber()
      setRoundNumber(round)

      if (prevRoundRef.current !== null && round !== prevRoundRef.current) {
        // 결산과 basePrice 업데이트는 onClosingPrice 콜백에서 처리
        // 타이머에서는 basePrice를 절대 건드리지 않음
        setDialog(null)
      }

      prevRoundRef.current = round
      roundRef.current = round
    }, 200)

    return () => clearInterval(tick)
  }, [getRoundNumber])

  const getBase = () => {
    const prices = closingPricesRef.current
    return prices.length > 0 ? prices[prices.length - 1].price : currentPriceRef.current
  }

  const canBet = timeLeft > 15 && phase !== "result"

  // autoBet state → ref 동기화
  useEffect(() => { autoBetRef.current = autoBet }, [autoBet])

  // canBet false→true 전환 시 fired 플래그 초기화
  const prevCanBetRef = useRef(false)
  useEffect(() => {
    const was = prevCanBetRef.current
    prevCanBetRef.current = canBet
    if (!canBet || was) return
    autoBetFiredRef.current = false
  }, [canBet])

  // 자동 배팅 실행
  useEffect(() => {
    if (!canBet) return
    if (autoBetFiredRef.current) return
    const cfg = autoBetRef.current
    if (!cfg.enabled) return
    if (cfg.amount <= 0) return
    if (balance !== null && balance < cfg.amount) return
    if (cfg.maxRounds !== null && autoBetRoundsRef.current >= cfg.maxRounds) { setAutoBet(prev => ({ ...prev, enabled: false })); return }
    if (cfg.maxLoss !== null && autoBetPnlRef.current <= -cfg.maxLoss) { setAutoBet(prev => ({ ...prev, enabled: false })); return }

    autoBetFiredRef.current = true

    const pick = <T extends string>(val: T | "random" | null, opts: T[]): T | null => {
      if (val === null) return null
      if (val === "random") return opts[Math.floor(Math.random() * opts.length)]
      return val
    }
    const dir = pick(cfg.direction, ["long", "short"])
    const dig = pick(cfg.digit, ["over", "under"])
    const par = pick(cfg.parity, ["odd", "even"])
    if (!dir && !dig && !par) return

    const token = getToken()
    if (!token) return

    const placeSingle = async (type: BetType, value: string) => {
      const res = await fetch("/api/user/game/bet", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ betAmount: cfg.amount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (typeof data.newBalance === "number") { setBalance(data.newBalance); window.dispatchEvent(new CustomEvent("balance:update", { detail: data.newBalance })) }
      const base = getBase()
      if (!base) throw new Error("No base price")
      if (type === "direction") { betRef.current = value as BetDirection; betDirectionAmountRef.current = cfg.amount; setBetDirection(value as BetDirection); setBetDirectionAmount(cfg.amount) }
      else if (type === "digit") { betDigitRef.current = value as BetDigit; betDigitAmountRef.current = cfg.amount; setBetDigit(value as BetDigit); setBetDigitAmount(cfg.amount) }
      else { betParityRef.current = value as BetParity; betParityAmountRef.current = cfg.amount; setBetParity(value as BetParity); setBetParityAmount(cfg.amount) }
      if (!basePriceRef.current) { basePriceRef.current = base; setBasePrice(base) }
    }

    ;(async () => {
      try {
        if (dir) await placeSingle("direction", dir)
        if (dig) await placeSingle("digit", dig)
        if (par) await placeSingle("parity", par)
        setPhase("waiting")
        try {
          localStorage.setItem("game_pending_bet", JSON.stringify({
            round: getRoundNumber(), direction: betRef.current, digit: betDigitRef.current, parity: betParityRef.current,
            basePrice: basePriceRef.current, directionAmount: betDirectionAmountRef.current, digitAmount: betDigitAmountRef.current, parityAmount: betParityAmountRef.current,
          }))
        } catch {}
      } catch (e) { console.error("[autoBet]", e) }
    })()
  }, [canBet, balance])

  // 자동 배팅 결과 트래킹
  useEffect(() => {
    if (!lastResult || !autoBetRef.current.enabled) return
    const cfg = autoBetRef.current
    let pnl = 0
    if (lastResult.direction && lastResult.directionAmount > 0) pnl += lastResult.wonDirection ? Math.floor(lastResult.directionAmount * (PAYOUT_RATIO - 1)) : -lastResult.directionAmount
    if (lastResult.digit && lastResult.digitAmount > 0) pnl += lastResult.wonDigit ? Math.floor(lastResult.digitAmount * (PAYOUT_RATIO - 1)) : -lastResult.digitAmount
    if (lastResult.parity && lastResult.parityAmount > 0) pnl += lastResult.wonParity ? Math.floor(lastResult.parityAmount * (PAYOUT_RATIO - 1)) : -lastResult.parityAmount
    autoBetRoundsRef.current += 1
    autoBetPnlRef.current += pnl
    setAutoBetRounds(autoBetRoundsRef.current)
    setAutoBetPnl(autoBetPnlRef.current)
    if (cfg.maxRounds !== null && autoBetRoundsRef.current >= cfg.maxRounds) setAutoBet(prev => ({ ...prev, enabled: false }))
    else if (cfg.maxLoss !== null && autoBetPnlRef.current <= -cfg.maxLoss) setAutoBet(prev => ({ ...prev, enabled: false }))
  }, [lastResult])

  // 배팅 가능 시간이 끝나면 열려있는 다이얼로그 강제 닫기
  useEffect(() => {
    if (!canBet && dialog?.open) {
      setDialog(null)
    }
  }, [canBet])

  // 종목 버튼 클릭 → 다이얼로그 열기 (결과 시트가 열려있으면 닫기)
  const openDialog = (type: BetType, value: string) => {
    if (!canBet) return
    if (type === "direction" && betDirection !== null) return
    if (type === "digit" && betDigit !== null) return
    if (type === "parity" && betParity !== null) return
    setShowResultSheet(false)
    setDialog({ open: true, type, value })
  }

  // 배팅 확정 → 즉시 잔고 차감 → DB 반영
  const handleConfirmBet = async (amount: number) => {
    if (!dialog) return
    setIsPlacingBet(true)

    try {
      const token = getToken()
      if (!token) throw new Error("로그인이 필요합니다")

      const res = await fetch("/api/user/game/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ betAmount: amount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Bet failed")

      // DB에서 반환된 실제 잔고로 즉시 동기화 + top-bar에 알림
      if (typeof data.newBalance === "number") {
        setBalance(data.newBalance)
        window.dispatchEvent(new CustomEvent("balance:update", { detail: data.newBalance }))
      }

      // 배팅 성공 → 상태 업데이트
      const base = getBase()
      if (!base) throw new Error("No base price")

      if (dialog.type === "direction") {
        betRef.current = dialog.value as BetDirection
        betDirectionAmountRef.current = amount
        setBetDirection(dialog.value as BetDirection)
        setBetDirectionAmount(amount)
      } else if (dialog.type === "digit") {
        betDigitRef.current = dialog.value as BetDigit
        betDigitAmountRef.current = amount
        setBetDigit(dialog.value as BetDigit)
        setBetDigitAmount(amount)
      } else {
        betParityRef.current = dialog.value as BetParity
        betParityAmountRef.current = amount
        setBetParity(dialog.value as BetParity)
        setBetParityAmount(amount)
      }

      if (!basePriceRef.current) {
        basePriceRef.current = base
        setBasePrice(base)
      }

      // localStorage에 배팅 상태 저장 (새로고침 대비)
      try {
        localStorage.setItem("game_pending_bet", JSON.stringify({
          round: getRoundNumber(),
          direction: betRef.current,
          digit: betDigitRef.current,
          parity: betParityRef.current,
          basePrice: basePriceRef.current,
          directionAmount: betDirectionAmountRef.current,
          digitAmount: betDigitAmountRef.current,
          parityAmount: betParityAmountRef.current,
        }))
      } catch {}

      setPhase("waiting")
      setDialog(null)
    } catch (err) {
      console.error("[v0] Bet error:", err)
    } finally {
      setIsPlacingBet(false)
    }
  }

  const priceDiff = currentPrice !== null && basePrice !== null ? currentPrice - basePrice : null
  const isUp = priceDiff !== null && priceDiff >= 0
  const timerPercent = (timeLeft / 30) * 100

  const timerColor =
    timeLeft > 18 ? "#22c55e"
    : timeLeft > 15 ? "#ef4444"
    : timeLeft > 3  ? "#f97316"
    : "#ef4444"

  const timerLabel =
    timeLeft > 18 ? "배팅 가능"
    : timeLeft > 15 ? "배팅 마감 3초 전"
    : timeLeft > 3  ? "게임 중"
    : "다음 게임까지 3초 전"

  const betAmountLabel = (amount: number) =>
    amount > 0 ? `₩${amount >= 10000 ? `${amount / 10000}만` : amount.toLocaleString()}` : null

  return (
    <>
      <Card className="p-4 bg-background border border-border/60">
        {/* 타이틀 + 승패 */}
        <div className="relative mb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-foreground">배팅 게임</h3>
              <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                #{roundNumber}
              </span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              <span className="text-emerald-500 font-semibold">{wins}승</span>
              {" / "}
              <span className="text-red-500 font-semibold">{losses}패</span>
            </span>
          </div>

          {/* 기준가 / 현재가 */}
          {basePrice !== null && currentPrice !== null && phase !== "result" && (
            <div className="absolute inset-0 flex items-center justify-between bg-background/95 rounded-lg px-1">
              <div>
                <p className="text-[9px] text-muted-foreground">배팅 기준가</p>
                <p className="text-xs font-semibold tabular-nums text-foreground">
                  ${basePrice.toFixed(1)}
                </p>
              </div>
              <div className={`text-xs font-bold ${isUp ? "text-emerald-500" : "text-red-500"}`}>
                {isUp ? "▲" : "▼"} {Math.abs(priceDiff!).toFixed(1)}
              </div>
              <div className="text-right">
                <p className="text-[9px] text-muted-foreground">현재가</p>
                <p className={`text-xs font-semibold tabular-nums ${isUp ? "text-emerald-500" : "text-red-500"}`}>
                  ${currentPrice.toFixed(1)}
                </p>
              </div>
            </div>
          )}

          {/* 라운드 결과 */}
          {phase === "result" && lastResult && (
            <div className="absolute inset-0 flex items-center justify-between bg-background/95 rounded-lg px-1 gap-1">
              <p className="text-[10px] text-muted-foreground shrink-0">
                끝자리 {Math.floor(lastResult.closePrice * 100) % 10}
              </p>
              <div className="flex gap-1">
                {lastResult.direction && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${lastResult.wonDirection ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                    {lastResult.direction === "long" ? "롱" : "숏"} {lastResult.wonDirection ? "승" : "패"}
                  </span>
                )}
                {lastResult.digit && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${lastResult.wonDigit ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                    {lastResult.digit === "over" ? "오버" : "언더"} {lastResult.wonDigit ? "승" : "패"}
                  </span>
                )}
                {lastResult.parity && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${lastResult.wonParity ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                    {lastResult.parity === "odd" ? "홀" : "짝"} {lastResult.wonParity ? "승" : "패"}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 타이머 바 */}
        <div className="relative mb-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1 text-[11px]" style={{ color: timerColor }}>
              <Clock className="w-3 h-3" />
              <span className="font-medium">{timerLabel}</span>
            </div>
            <span className="text-sm font-bold tabular-nums" style={{ color: timerColor }}>
              {timeLeft}초
            </span>
          </div>
          <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{ width: `${timerPercent}%`, backgroundColor: timerColor }}
            />
          </div>
        </div>

        {/* 자동 배팅 패널 */}
        <div className="mb-3">
          <button
            onClick={() => setAutoBetOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl border transition-all"
            style={autoBet.enabled
              ? { background: "rgba(16,185,129,0.08)", borderColor: "rgba(16,185,129,0.3)" }
              : { background: "hsl(var(--muted))", borderColor: "transparent" }}
          >
            <div className="flex items-center gap-2">
              <Bot className="w-3.5 h-3.5" style={{ color: autoBet.enabled ? "#10b981" : "hsl(var(--muted-foreground))" }} />
              <span className="text-xs font-bold" style={{ color: autoBet.enabled ? "#10b981" : "hsl(var(--muted-foreground))" }}>자동 배팅</span>
              {autoBet.enabled && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold bg-emerald-500 text-white">ON</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {autoBet.enabled && (
                <span className="text-[10px] font-semibold" style={{ color: autoBetPnl >= 0 ? "#10b981" : "#ef4444" }}>
                  {autoBetRounds}R / {autoBetPnl >= 0 ? "+" : ""}₩{Math.abs(autoBetPnl).toLocaleString()}
                </span>
              )}
              {autoBetOpen ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
            </div>
          </button>

          {autoBetOpen && (
            <div className="mt-2 rounded-xl p-3 space-y-3 border border-border/60 bg-muted/30">
              {/* 종목 설정 */}
              {(["direction", "digit", "parity"] as const).map((type) => {
                const labels: Record<typeof type, { opts: string[], labels: string[], nullLabel: string }> = {
                  direction: { opts: ["long", "short", "random"], labels: ["롱", "숏", "랜덤"], nullLabel: "방향" },
                  digit: { opts: ["over", "under", "random"], labels: ["오버", "언더", "랜덤"], nullLabel: "크기" },
                  parity: { opts: ["odd", "even", "random"], labels: ["홀", "짝", "랜덤"], nullLabel: "홀짝" },
                }
                const meta = labels[type]
                const current = autoBet[type]
                return (
                  <div key={type} className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground w-8 shrink-0">{meta.nullLabel}</span>
                    <div className="flex gap-1 flex-1">
                      <button
                        onClick={() => setAutoBet(prev => ({ ...prev, [type]: null }))}
                        className={`px-2 py-1 rounded text-[10px] font-semibold transition-all border ${current === null ? "bg-foreground/10 text-foreground border-foreground/20" : "bg-muted text-muted-foreground border-transparent"}`}
                      >없음</button>
                      {meta.opts.map((opt, i) => (
                        <button
                          key={opt}
                          onClick={() => setAutoBet(prev => ({ ...prev, [type]: opt as any }))}
                          className={`flex-1 px-2 py-1 rounded text-[10px] font-semibold transition-all border flex items-center justify-center gap-0.5 ${current === opt ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" : "bg-muted text-muted-foreground border-transparent"}`}
                        >
                          {opt === "random" && <Shuffle className="w-2.5 h-2.5" />}
                          {meta.labels[i]}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* 금액 */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground w-8 shrink-0">금액</span>
                <div className="flex gap-1 flex-wrap">
                  {CHIPS.map(c => (
                    <button
                      key={c.value}
                      onClick={() => setAutoBet(prev => ({ ...prev, amount: c.value }))}
                      className={`px-2 py-1 rounded text-[10px] font-semibold transition-all border ${autoBet.amount === c.value ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30" : "bg-muted text-muted-foreground border-transparent"}`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 종료 조건 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">최대 라운드 (빈 칸=무제한)</p>
                  <input
                    type="number" min={1} max={100}
                    value={autoBet.maxRounds ?? ""}
                    onChange={e => setAutoBet(prev => ({ ...prev, maxRounds: e.target.value === "" ? null : Number(e.target.value) }))}
                    placeholder="무제한"
                    className="w-full px-2 py-1.5 rounded text-[11px] font-semibold bg-background border border-border outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1">손실 한도 ₩</p>
                  <input
                    type="number" min={0}
                    value={autoBet.maxLoss ?? ""}
                    onChange={e => setAutoBet(prev => ({ ...prev, maxLoss: e.target.value === "" ? null : Number(e.target.value) }))}
                    placeholder="무제한"
                    className="w-full px-2 py-1.5 rounded text-[11px] font-semibold bg-background border border-border outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* 시작/중단 버튼 */}
              <button
                onClick={() => {
                  if (autoBet.enabled) {
                    setAutoBet(prev => ({ ...prev, enabled: false }))
                  } else {
                    autoBetRoundsRef.current = 0; autoBetPnlRef.current = 0
                    setAutoBetRounds(0); setAutoBetPnl(0)
                    autoBetFiredRef.current = true  // 현재 라운드 차단, 다음 라운드 시작 시 false로 리셋됨
                    setAutoBet(prev => ({ ...prev, enabled: true }))
                  }
                }}
                className={`w-full py-2 rounded-xl text-sm font-bold transition-all border ${autoBet.enabled ? "bg-red-500/10 border-red-500/30 text-red-500 hover:bg-red-500/15" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/15"}`}
              >
                {autoBet.enabled ? "자동 배팅 중단" : "자동 배팅 시작"}
              </button>
            </div>
          )}
        </div>

        {/* 3그룹 배팅 버튼 */}
        <div className="grid grid-cols-3 gap-2">
          {/* 롱 / 숏 */}
          <div className="flex flex-col gap-2">
            {(["long", "short"] as const).map((dir) => {
              const isSelected = betDirection === dir
              const isResult = phase === "result" && lastResult?.direction === dir
              const won = isResult && (dir === "long" ? lastResult?.wonDirection : !lastResult?.wonDirection)
              const color = dir === "long" ? "#10b981" : "#ef4444"
              const label = betAmountLabel(betDirectionAmount)
              return (
                <button
                  key={dir}
                  onClick={() => openDialog("direction", dir)}
                  disabled={!canBet || betDirection !== null}
                  className="h-14 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all duration-200 active:scale-95 disabled:opacity-50"
                  style={{
                    background: isSelected ? `${color}20` : isResult ? (won ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)") : "hsl(var(--muted))",
                    borderColor: isSelected ? color : isResult ? (won ? "#10b981" : "#ef4444") : "transparent",
                    color: isSelected ? color : isResult ? (won ? "#10b981" : "#ef4444") : "hsl(var(--muted-foreground))",
                  }}
                >
                  <div className="flex items-center gap-1">
                    {dir === "long" ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    <span>{dir === "long" ? "롱" : "숏"}</span>
                  </div>
                  {isSelected && label && <span className="text-[9px] opacity-70">{label}</span>}
                  {isResult && <span className="text-[9px]">{won ? "승" : "패"}</span>}
                </button>
              )
            })}
          </div>

          {/* 오버 / 언더 */}
          <div className="flex flex-col gap-2">
            {(["over", "under"] as const).map((dig) => {
              const isSelected = betDigit === dig
              const isResult = phase === "result" && lastResult?.digit === dig
              const won = isResult && (dig === "over" ? lastResult?.wonDigit : !lastResult?.wonDigit)
              const color = dig === "over" ? "#f97316" : "#60a5fa"
              const label = betAmountLabel(betDigitAmount)
              return (
                <button
                  key={dig}
                  onClick={() => openDialog("digit", dig)}
                  disabled={!canBet || betDigit !== null}
                  className="h-14 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all duration-200 active:scale-95 disabled:opacity-50"
                  style={{
                    background: isSelected ? `${color}20` : isResult ? (won ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)") : "hsl(var(--muted))",
                    borderColor: isSelected ? color : isResult ? (won ? "#10b981" : "#ef4444") : "transparent",
                    color: isSelected ? color : isResult ? (won ? "#10b981" : "#ef4444") : "hsl(var(--muted-foreground))",
                  }}
                >
                  <span>{dig === "over" ? "오버" : "언더"}</span>
                  <span className="text-[9px] opacity-60">{dig === "over" ? "5~9" : "0~4"}</span>
                  {isSelected && label && <span className="text-[9px] opacity-70">{label}</span>}
                  {isResult && <span className="text-[9px]">{won ? "승" : "패"}</span>}
                </button>
              )
            })}
          </div>

          {/* 홀 / 짝 */}
          <div className="flex flex-col gap-2">
            {(["odd", "even"] as const).map((par) => {
              const isSelected = betParity === par
              const isResult = phase === "result" && lastResult?.parity === par
              const won = isResult && (par === "odd" ? lastResult?.wonParity : !lastResult?.wonParity)
              const color = par === "odd" ? "#8b5cf6" : "#ec4899"
              const label = betAmountLabel(betParityAmount)
              return (
                <button
                  key={par}
                  onClick={() => openDialog("parity", par)}
                  disabled={!canBet || betParity !== null}
                  className="h-14 rounded-xl border text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all duration-200 active:scale-95 disabled:opacity-50"
                  style={{
                    background: isSelected ? `${color}20` : isResult ? (won ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)") : "hsl(var(--muted))",
                    borderColor: isSelected ? color : isResult ? (won ? "#10b981" : "#ef4444") : "transparent",
                    color: isSelected ? color : isResult ? (won ? "#10b981" : "#ef4444") : "hsl(var(--muted-foreground))",
                  }}
                >
                  <span>{par === "odd" ? "홀" : "짝"}</span>
                  <span className="text-[9px] opacity-60">{par === "odd" ? "1·3·5·7·9" : "0·2·4·6·8"}</span>
                  {isSelected && label && <span className="text-[9px] opacity-70">{label}</span>}
                  {isResult && <span className="text-[9px]">{won ? "승" : "패"}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* 안내 텍스트 */}
        <p className="text-center text-[10px] text-muted-foreground mt-3">
          {canBet && !betDirection && !betDigit && !betParity && "종목을 눌러 배팅하세요"}
          {canBet && (betDirection || betDigit || betParity) && "다른 종목 추가 배팅 가능"}
          {!canBet && phase !== "result" && (timeLeft > 3 ? "게임 중 — 배팅 불가" : "다음 게임까지 3초 전")}
          {phase === "result" && "새 라운드 준비 중..."}
        </p>
      </Card>

      {/* 배팅 다이얼로그 */}
      {dialog && (
        <BetDialog
          open={dialog.open}
          betType={dialog.type}
          selectedValue={dialog.value}
          onClose={() => setDialog(null)}
          onConfirm={handleConfirmBet}
          isLoading={isPlacingBet}
          balance={balance}
          locked={locked}
          lockedAmount={lockedAmount}
          onLockChange={(l, a) => { setLocked(l); setLockedAmount(a) }}
          canBet={canBet}
        />
      )}

      {/* 결과 시트 */}
      <ResultSheet
        result={lastResult}
        open={showResultSheet}
        onClose={() => setShowResultSheet(false)}
      />
    </>
  )
}
