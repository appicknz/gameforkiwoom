"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, Clock, X, RotateCcw } from "lucide-react"
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
}

function BetDialog({ open, betType, selectedValue, onClose, onConfirm, isLoading, balance }: BetDialogProps) {
  const [selectedChip, setSelectedChip] = useState<number | null>(null)
  const [amount, setAmount] = useState(0)

  // 다이얼로그 열릴 때마다 초기화
  useEffect(() => {
    if (open) {
      setSelectedChip(null)
      setAmount(0)
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

          {/* 초기화 + 배팅 버튼 */}
          <div className="flex gap-2 pb-safe">
            <button
              onClick={handleReset}
              className="flex items-center justify-center gap-1 px-4 py-3 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all text-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              초기화
            </button>
            <button
              onClick={() => amount > 0 && onConfirm(amount)}
              disabled={amount <= 0 || isLoading || (balance !== null && amount > balance)}
              className="flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-150 active:scale-[0.98] disabled:opacity-40"
              style={{
                background: amount > 0 ? meta?.color : "hsl(var(--muted))",
                color: amount > 0 ? "#fff" : "hsl(var(--muted-foreground))",
              }}
            >
              {isLoading ? "처리 중..." : `₩${amount.toLocaleString()} 배팅`}
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

  const lastDigit = Math.floor(Math.abs(result.closePrice * 10)) % 10
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
                {isUp ? "▲" : "▼"} ${(Math.floor(Math.abs(priceChange) * 10) / 10).toString()}
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
      closingPricesRef.current = [...closingPricesRef.current, { time, price }].slice(-100)
    }, []),
    onInitClosing: useCallback((prices: Array<{ time: number; price: number }>) => {
      closingPricesRef.current = prices
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
        const prices = closingPricesRef.current
        const latestClose = prices.length > 0 ? prices[prices.length - 1].price : currentPriceRef.current

        // 결산 시작 전 localStorage 초기화 (어떤 경우든)
        try { localStorage.removeItem("game_pending_bet") } catch {}

        if ((betRef.current || betDigitRef.current || betParityRef.current) && basePriceRef.current !== null && latestClose !== null) {
          // 클라이언트에서도 UI 표시용으로 계산 (신뢰 X, 서버가 최종 권한)
          const lastDigit = Math.floor(Math.abs(latestClose * 10)) % 10
          const wonDirection = betRef.current ? (betRef.current === "long" ? latestClose >= basePriceRef.current : latestClose < basePriceRef.current) : false
          const wonDigit = betDigitRef.current ? (betDigitRef.current === "under" ? lastDigit <= 4 : lastDigit >= 5) : false
          const wonParity = betParityRef.current ? (betParityRef.current === "odd" ? lastDigit % 2 !== 0 : lastDigit % 2 === 0) : false

          // 서버에 원본 데이터 전송 → 서버가 승패/수익 직접 계산 (위변조 방지)
          const token = getToken()
          if (token) {
            fetch("/api/user/game/play", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                basePrice: basePriceRef.current,
                closePrice: latestClose,
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
                // 서버가 계산한 최종 잔고로 UI 업데이트
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
            closePrice: latestClose,
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
        }

        // 새 라운드 초기화 (결과 시트�� 닫지 않음 - 유저가 직접 닫거나 배팅 시 닫힘)
        betRef.current = null
        betDigitRef.current = null
        betParityRef.current = null
        betDirectionAmountRef.current = 0
        betDigitAmountRef.current = 0
        betParityAmountRef.current = 0
        setBetDirection(null)
        setBetDigit(null)
        setBetParity(null)
        setBetDirectionAmount(0)
        setBetDigitAmount(0)
        setBetParityAmount(0)
        setBasePrice(null)
        basePriceRef.current = null
        setDialog(null)
        setTimeout(() => setPhase("betting"), 1500)
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

  // 네온 버튼 스타일 헬퍼
  const neonBtn = (
    color: string,
    isSelected: boolean,
    isResult: boolean,
    won: boolean | undefined,
  ) => {
    if (isResult) {
      const rc = won ? "#00ff88" : "#ff3355"
      return {
        background: won ? "rgba(0,255,136,0.08)" : "rgba(255,51,85,0.08)",
        border: `1.5px solid ${rc}`,
        color: rc,
        boxShadow: `0 0 10px ${rc}40`,
      }
    }
    if (isSelected) {
      return {
        background: `${color}15`,
        border: `1.5px solid ${color}`,
        color,
        boxShadow: `0 0 14px ${color}50`,
      }
    }
    return {
      background: "rgba(255,255,255,0.05)",
      border: "1.5px solid rgba(255,255,255,0.18)",
      color: "rgba(255,255,255,0.92)",
      boxShadow: "none",
    }
  }

  return (
    <>
      <div className="p-4" style={{ background: "transparent" }}>

        {/* 상단: 승패 + 타이머 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] tabular-nums" style={{ color: "rgba(0,255,200,0.5)" }}>
              #{roundNumber}
            </span>
            <span className="text-[11px]">
              <span style={{ color: "#00ff88" }}>{wins}승</span>
              <span style={{ color: "rgba(255,255,255,0.3)" }}> / </span>
              <span style={{ color: "#ff3355" }}>{losses}패</span>
            </span>
          </div>

          {/* 타이머 */}
          <div className="flex items-center gap-2">
            <div className="w-28 h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div
                className="h-full rounded-full transition-all duration-200"
                style={{
                  width: `${timerPercent}%`,
                  background: timerColor,
                  boxShadow: `0 0 6px ${timerColor}`,
                }}
              />
            </div>
            <span className="text-xs font-bold tabular-nums w-6 text-right" style={{ color: timerColor }}>
              {timeLeft}
            </span>
          </div>
        </div>

        {/* 기준가 / 현재가 */}
        {basePrice !== null && currentPrice !== null && phase !== "result" && (
          <div className="flex items-center justify-between mb-3 px-1 py-2 rounded-lg"
            style={{ background: "rgba(0,255,200,0.04)", border: "1px solid rgba(0,255,200,0.1)" }}>
            <div>
              <p className="text-[9px] mb-0.5" style={{ color: "rgba(0,255,200,0.4)" }}>배팅 기준가</p>
              <p className="text-xs font-bold tabular-nums" style={{ color: "rgba(180,220,255,0.9)" }}>
                ${(Math.floor(basePrice * 10) / 10).toString()}
              </p>
            </div>
            <div className="text-sm font-black tabular-nums" style={{ color: isUp ? "#00ff88" : "#ff3355" }}>
              {isUp ? "▲" : "▼"} {(Math.floor(Math.abs(priceDiff!) * 10) / 10).toString()}
            </div>
            <div className="text-right">
              <p className="text-[9px] mb-0.5" style={{ color: "rgba(0,255,200,0.4)" }}>현재가</p>
              <p className="text-xs font-bold tabular-nums" style={{ color: isUp ? "#00ff88" : "#ff3355" }}>
                ${(Math.floor(currentPrice * 10) / 10).toString()}
              </p>
            </div>
          </div>
        )}

        {/* 라운드 결과 */}
        {phase === "result" && lastResult && (
          <div className="flex items-center justify-between mb-3 px-2 py-2 rounded-lg"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <span className="text-[10px]" style={{ color: "rgba(0,255,200,0.6)" }}>
              ��자리 <span className="font-bold text-white">{Math.floor(lastResult.closePrice * 10) % 10}</span>
            </span>
            <div className="flex gap-1">
              {lastResult.direction && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: lastResult.wonDirection ? "rgba(0,255,136,0.12)" : "rgba(255,51,85,0.12)", color: lastResult.wonDirection ? "#00ff88" : "#ff3355" }}>
                  {lastResult.direction === "long" ? "롱" : "숏"} {lastResult.wonDirection ? "승" : "패"}
                </span>
              )}
              {lastResult.digit && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: lastResult.wonDigit ? "rgba(0,255,136,0.12)" : "rgba(255,51,85,0.12)", color: lastResult.wonDigit ? "#00ff88" : "#ff3355" }}>
                  {lastResult.digit === "over" ? "오버" : "언더"} {lastResult.wonDigit ? "승" : "패"}
                </span>
              )}
              {lastResult.parity && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{ background: lastResult.wonParity ? "rgba(0,255,136,0.12)" : "rgba(255,51,85,0.12)", color: lastResult.wonParity ? "#00ff88" : "#ff3355" }}>
                  {lastResult.parity === "odd" ? "홀" : "짝"} {lastResult.wonParity ? "승" : "패"}
                </span>
              )}
            </div>
          </div>
        )}

        {/* 3그룹 배팅 버튼 — 레퍼런스 이미지 스타일 */}
        <div className="grid grid-cols-3 gap-2">
          {/* 헤더 라벨 */}
          {(["롱 / 숏", "언더 / 오버", "홀 / 짝"] as const).map((label) => (
            <p key={label} className="text-center text-[10px] pb-1" style={{ color: "rgba(0,255,200,0.85)" }}>
              {label}
            </p>
          ))}

          {/* 롱 / 숏 */}
          <div className="flex flex-col gap-2">
            {(["long", "short"] as const).map((dir) => {
              const isSelected = betDirection === dir
              const isResult = phase === "result" && lastResult?.direction === dir
              const won = isResult ? (dir === "long" ? lastResult?.wonDirection : !lastResult?.wonDirection) : undefined
              const color = dir === "long" ? "#00ff88" : "#ff3355"
              const label = betAmountLabel(betDirectionAmount)
              return (
                <button
                  key={dir}
                  onClick={() => openDialog("direction", dir)}
                  disabled={!canBet || betDirection !== null}
                  className="h-16 rounded-xl text-sm font-bold flex flex-col items-center justify-center gap-0.5 transition-all duration-150 active:scale-95 disabled:opacity-40"
                  style={neonBtn(color, isSelected, isResult, won)}
                >
                  <div className="flex items-center gap-1">
                    {dir === "long" ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    <span>{dir === "long" ? "롱" : "숏"}</span>
                  </div>
                  <span className="text-[9px] opacity-80">{dir === "long" ? "직전 대비 상승" : "직전 대비 하락"}</span>
                  {isSelected && label && <span className="text-[9px] opacity-80">{label}</span>}
                  {isResult && <span className="text-[9px]">{won ? "승" : "패"}</span>}
                </button>
              )
            })}
          </div>

          {/* 언더 / 오버 */}
          <div className="flex flex-col gap-2">
            {(["under", "over"] as const).map((dig) => {
              const isSelected = betDigit === dig
              const isResult = phase === "result" && lastResult?.digit === dig
              const won = isResult ? (dig === "over" ? lastResult?.wonDigit : !lastResult?.wonDigit) : undefined
              const color = dig === "over" ? "#ff3355" : "#00aaff"
              const label = betAmountLabel(betDigitAmount)
              return (
                <button
                  key={dig}
                  onClick={() => openDialog("digit", dig)}
                  disabled={!canBet || betDigit !== null}
                  className="h-16 rounded-xl text-sm font-bold flex flex-col items-center justify-center gap-0.5 transition-all duration-150 active:scale-95 disabled:opacity-40"
                  style={neonBtn(color, isSelected, isResult, won)}
                >
                  <span>{dig === "over" ? "오버" : "언더"}</span>
                  <span className="text-[9px] opacity-80">{dig === "over" ? "5 ~ 9" : "0 ~ 4"}</span>
                  {isSelected && label && <span className="text-[9px] opacity-80">{label}</span>}
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
              const won = isResult ? (par === "odd" ? lastResult?.wonParity : !lastResult?.wonParity) : undefined
              const color = par === "odd" ? "#a78bfa" : "#f472b6"
              const label = betAmountLabel(betParityAmount)
              return (
                <button
                  key={par}
                  onClick={() => openDialog("parity", par)}
                  disabled={!canBet || betParity !== null}
                  className="h-16 rounded-xl text-sm font-bold flex flex-col items-center justify-center gap-0.5 transition-all duration-150 active:scale-95 disabled:opacity-40"
                  style={neonBtn(color, isSelected, isResult, won)}
                >
                  <span>{par === "odd" ? "홀" : "짝"}</span>
                  <span className="text-[9px] opacity-80">{par === "odd" ? "1·3·5·7·9" : "0·2·4·6·8"}</span>
                  {isSelected && label && <span className="text-[9px] opacity-80">{label}</span>}
                  {isResult && <span className="text-[9px]">{won ? "승" : "패"}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* 안내 텍스트 */}
        <p className="text-center text-[10px] mt-3" style={{ color: "rgba(0,255,200,0.35)" }}>
          {canBet && !betDirection && !betDigit && !betParity && "종목을 눌러 배팅하세요"}
          {canBet && (betDirection || betDigit || betParity) && "다른 종목 추가 배팅 가능"}
          {!canBet && phase !== "result" && (timeLeft > 3 ? "게임 중 — 배팅 불가" : "다음 게임까지 3초 전")}
          {phase === "result" && "새 라운드 준비 중..."}
        </p>
      </div>

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
