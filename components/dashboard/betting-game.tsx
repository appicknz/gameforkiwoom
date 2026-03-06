"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, Clock } from "lucide-react"
import { usePriceWorker } from "@/hooks/use-price-worker"

type BetDirection = "long" | "short" | null
type BetDigit = "under" | "over" | null
type BetParity = "odd" | "even" | null

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
}

export function BettingGame() {
  const [timeLeft, setTimeLeft] = useState(30)
  const [roundNumber, setRoundNumber] = useState(0)
  const [betDirection, setBetDirection] = useState<BetDirection>(null)
  const [betDigit, setBetDigit] = useState<BetDigit>(null)
  const [betParity, setBetParity] = useState<BetParity>(null)
  const [basePrice, setBasePrice] = useState<number | null>(null)
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [phase, setPhase] = useState<"betting" | "waiting" | "result">("betting")
  const [lastResult, setLastResult] = useState<RoundResult | null>(null)
  const [results, setResults] = useState<RoundResult[]>([])
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  // 각 타입별 독립 배팅 금액
  const [betDirectionAmount, setBetDirectionAmount] = useState(10000)
  const [betDigitAmount, setBetDigitAmount] = useState(10000)
  const [betParityAmount, setBetParityAmount] = useState(10000)
  // 누적식 금액 선택
  const [selectedChip, setSelectedChip] = useState<number | null>(null)

  const prevRoundRef = useRef<number | null>(null)
  const betRef = useRef<BetDirection>(null)
  const betDigitRef = useRef<BetDigit>(null)
  const betParityRef = useRef<BetParity>(null)
  const basePriceRef = useRef<number | null>(null)
  const roundRef = useRef<number>(0)
  const closingPricesRef = useRef<Array<{ time: number; price: number }>>([])
  const currentPriceRef = useRef<number | null>(null)

  // 서버 시간 기준 현재 라운드 번호 (00초 또는 30초 기준)
  const getRoundNumber = useCallback(() => {
    const now = Math.floor(Date.now() / 1000)
    return Math.floor(now / 30)
  }, [])

  // usePriceWorker로 현재가 직접 수신 (window 폴링 완전 제거)
  usePriceWorker({
    onPrice: useCallback((price: number) => {
      setCurrentPrice(price)
      currentPriceRef.current = price
    }, []),
    onClosingPrice: useCallback((price: number, time: number) => {
      // closingPrices를 ref로 관리해 라운드 정산에 사용
      closingPricesRef.current = [...closingPricesRef.current, { time, price }].slice(-100)
    }, []),
    onInitClosing: useCallback((prices: Array<{ time: number; price: number }>) => {
      closingPricesRef.current = prices
    }, []),
  })

  // 라운드 관리 타이머
  useEffect(() => {
    const tick = setInterval(() => {
      const now = Math.floor(Date.now() / 1000)
      const secondInPeriod = now % 30
      const remaining = 30 - secondInPeriod
      setTimeLeft(remaining)

      const round = getRoundNumber()
      setRoundNumber(round)

      // 새 라운드 시작 시
      if (prevRoundRef.current !== null && round !== prevRoundRef.current) {
        // 이전 라운드 결산 — window 폴링 없이 ref에서 직접 읽음
        const prices = closingPricesRef.current
        const latestClose =
          prices.length > 0
            ? prices[prices.length - 1].price
            : currentPriceRef.current

        if ((betRef.current || betDigitRef.current || betParityRef.current) && basePriceRef.current !== null && latestClose !== null) {
          const lastDigit = Math.floor(latestClose * 10) % 10
          const wonDirection = betRef.current
            ? betRef.current === "long"
              ? latestClose > basePriceRef.current
              : latestClose < basePriceRef.current
            : false
          const wonDigit = betDigitRef.current
            ? betDigitRef.current === "under"
              ? lastDigit <= 4
              : lastDigit >= 5
            : false
          const wonParity = betParityRef.current
            ? betParityRef.current === "odd"
              ? lastDigit % 2 !== 0
              : lastDigit % 2 === 0
            : false

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
          }
          setLastResult(result)
          setResults((prev) => [result, ...prev].slice(0, 20))
          const anyWon = (betRef.current && wonDirection) || (betDigitRef.current && wonDigit) || (betParityRef.current && wonParity)
          const anyLost = (betRef.current && !wonDirection) || (betDigitRef.current && !wonDigit) || (betParityRef.current && !wonParity)
          if (anyWon) setWins((w) => w + 1)
          if (anyLost) setLosses((l) => l + 1)
          setPhase("result")
        }

        // 새 라운드 초기화
        betRef.current = null
        betDigitRef.current = null
        betParityRef.current = null
        setBetDirection(null)
        setBetDigit(null)
        setBetParity(null)
        setBasePrice(null)
        basePriceRef.current = null

        // 1.5초 후 배팅 단계로 전환
        setTimeout(() => setPhase("betting"), 1500)
      }

      prevRoundRef.current = round
      roundRef.current = round
    }, 200)

    return () => clearInterval(tick)
  }, [getRoundNumber])

  // 공통 기준가 세팅 — ref에서 직접 읽음, window 불필요
  const getBase = () => {
    const prices = closingPricesRef.current
    return prices.length > 0 ? prices[prices.length - 1].price : currentPriceRef.current
  }

  // 배팅 가능: 30~18초 구간 (timeLeft > 15 && timeLeft > 18 즉 18초 초과)
  // 배팅 마감 3초 전(18~15초)에도 이미 한 배팅 외 추가 배팅 불가
  // 15초 이하는 게임 중 - 절대 배팅 불가
  const canBet = timeLeft > 15 && phase !== "result"

  // 롱/숏 배팅 처리
  const placeBet = (direction: BetDirection) => {
    if (!canBet || betDirection !== null) return
    const base = getBase()
    if (!base) return
    betRef.current = direction
    basePriceRef.current = base
    setBetDirection(direction)
    setBasePrice(base)
    setPhase("waiting")
  }

  // 언더/오버 배팅 처리
  const placeDigitBet = (digit: BetDigit) => {
    if (!canBet || betDigit !== null) return
    const base = getBase()
    if (!base) return
    betDigitRef.current = digit
    basePriceRef.current = base
    setBetDigit(digit)
    setBasePrice(base)
    setPhase("waiting")
  }

  // 홀/짝 배팅 처리
  const placeParityBet = (parity: BetParity) => {
    if (!canBet || betParity !== null) return
    const base = getBase()
    if (!base) return
    betParityRef.current = parity
    basePriceRef.current = base
    setBetParity(parity)
    setBasePrice(base)
    setPhase("waiting")
  }

  const CHIPS = [
    { label: "1만", value: 10000 },
    { label: "5만", value: 50000 },
    { label: "10만", value: 100000 },
    { label: "50만", value: 500000 },
    { label: "100만", value: 1000000 },
  ]

  // 칩 클릭: 같은 칩 반복 클릭 시 누적, 다른 칩은 초기화
  const handleChip = (value: number) => {
    if (!canBet) return
    if (selectedChip === value) {
      // 누적
      if (!betDirection) setBetDirectionAmount((p) => p + value)
      if (!betDigit) setBetDigitAmount((p) => p + value)
      if (!betParity) setBetParityAmount((p) => p + value)
    } else {
      // 초기화 후 새 금액 설정
      setSelectedChip(value)
      if (!betDirection) setBetDirectionAmount(value)
      if (!betDigit) setBetDigitAmount(value)
      if (!betParity) setBetParityAmount(value)
    }
  }

  const priceDiff =
    currentPrice !== null && basePrice !== null
      ? currentPrice - basePrice
      : null
  const isUp = priceDiff !== null && priceDiff >= 0
  const timerPercent = (timeLeft / 30) * 100

  // 색상 로직
  // 30~18초: 초록 (배팅 가능)
  // 18~15초: 빨강 (배팅 마감 3초 전)
  // 15~3초: 주황 (게임 중)
  // 3~0초: 빨강 (다음 게임까지 3초 전)
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

  return (
    <Card className="p-4 bg-background border border-border/60">
      {/* 타이틀 + 라운드 — 배팅/결과 정보는 이 영역에 오버레이 */}
      <div className="relative mb-3">
        {/* 기본: 타이틀 + 승패 */}
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

        {/* 오버레이: 배팅 기준가 / 현재가 */}
        {basePrice !== null && currentPrice !== null && phase !== "result" && (
          <div className="absolute inset-0 flex items-center justify-between bg-background/95 rounded-lg px-1">
            <div>
              <p className="text-[9px] text-muted-foreground">배팅 기준가</p>
              <p className="text-xs font-semibold tabular-nums text-foreground">
                ${basePrice.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </p>
            </div>
            <div className={`text-xs font-bold ${isUp ? "text-emerald-500" : "text-red-500"}`}>
              {isUp ? "▲" : "▼"} {Math.abs(priceDiff!).toFixed(1)}
            </div>
            <div className="text-right">
              <p className="text-[9px] text-muted-foreground">현재가</p>
              <p className={`text-xs font-semibold tabular-nums ${isUp ? "text-emerald-500" : "text-red-500"}`}>
                ${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </p>
            </div>
          </div>
        )}

        {/* 오버레이: 라운드 결과 */}
        {phase === "result" && lastResult && (
          <div className="absolute inset-0 flex items-center justify-between bg-background/95 rounded-lg px-1 gap-1">
            <p className="text-[10px] text-muted-foreground shrink-0">
              끝자리 {Math.floor(lastResult.closePrice * 10) % 10}
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
      <div className="relative mb-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1 text-[11px]" style={{ color: timerColor }}>
            <Clock className="w-3 h-3" />
            <span className="font-medium">{timerLabel}</span>
          </div>
          <span
            className="text-sm font-bold tabular-nums"
            style={{ color: timerColor }}
          >
            {timeLeft}초
          </span>
        </div>
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{
              width: `${timerPercent}%`,
              backgroundColor: timerColor,
            }}
          />
        </div>
      </div>

      {/* 금액 선택 칩 버튼 */}
      <div className="flex gap-1.5 mb-3">
        {CHIPS.map(({ label, value }) => {
          const isActive = selectedChip === value
          return (
            <button
              key={value}
              onClick={() => handleChip(value)}
              disabled={!canBet}
              className="flex-1 py-1.5 rounded-xl text-[11px] font-bold border transition-all duration-150 disabled:opacity-30"
              style={{
                background: isActive ? "rgba(16,185,129,0.12)" : "transparent",
                borderColor: isActive ? "#10b981" : "hsl(var(--border))",
                color: isActive ? "#10b981" : "hsl(var(--muted-foreground))",
              }}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* 3그룹 버튼: 롱/숏 | 오버/언더 | 홀/짝 */}
      <div className="grid grid-cols-3 gap-2">
        {/* 그룹 1: 롱 / 숏 */}
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => placeBet("long")}
            disabled={!canBet || betDirection !== null}
            className={`h-14 text-xs font-bold rounded-xl transition-all duration-200 flex flex-col items-center justify-center gap-0.5 ${
              betDirection === "long"
                ? "bg-emerald-600 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 scale-[1.02]"
                : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
            }`}
          >
            <div className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" />롱</div>
            <span className="text-[9px] opacity-60">₩{betDirectionAmount.toLocaleString()}</span>
          </Button>
          <Button
            onClick={() => placeBet("short")}
            disabled={!canBet || betDirection !== null}
            className={`h-14 text-xs font-bold rounded-xl transition-all duration-200 flex flex-col items-center justify-center gap-0.5 ${
              betDirection === "short"
                ? "bg-red-600 hover:bg-red-600 text-white shadow-lg shadow-red-500/30 scale-[1.02]"
                : "bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30"
            }`}
          >
            <div className="flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5" />숏</div>
            <span className="text-[9px] opacity-60">₩{betDirectionAmount.toLocaleString()}</span>
          </Button>
        </div>

        {/* 그룹 2: 오버 / 언더 */}
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => placeDigitBet("over")}
            disabled={!canBet || betDigit !== null}
            className={`h-14 text-xs font-bold rounded-xl transition-all duration-200 flex flex-col items-center justify-center ${
              betDigit === "over"
                ? "bg-orange-600 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/30 scale-[1.02]"
                : "bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/30"
            }`}
          >
            <span>오버</span>
            <span className="text-[9px] opacity-70">5~9</span>
            <span className="text-[9px] opacity-50">₩{betDigitAmount.toLocaleString()}</span>
          </Button>
          <Button
            onClick={() => placeDigitBet("under")}
            disabled={!canBet || betDigit !== null}
            className={`h-14 text-xs font-bold rounded-xl transition-all duration-200 flex flex-col items-center justify-center ${
              betDigit === "under"
                ? "bg-blue-600 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-[1.02]"
                : "bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-500/30"
            }`}
          >
            <span>언더</span>
            <span className="text-[9px] opacity-70">0~4</span>
            <span className="text-[9px] opacity-50">₩{betDigitAmount.toLocaleString()}</span>
          </Button>
        </div>

        {/* 그룹 3: 홀 / 짝 */}
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => placeParityBet("odd")}
            disabled={!canBet || betParity !== null}
            className={`h-14 text-xs font-bold rounded-xl transition-all duration-200 flex flex-col items-center justify-center ${
              betParity === "odd"
                ? "bg-violet-600 hover:bg-violet-600 text-white shadow-lg shadow-violet-500/30 scale-[1.02]"
                : "bg-violet-500/10 hover:bg-violet-500/20 text-violet-500 border border-violet-500/30"
            }`}
          >
            <span>홀</span>
            <span className="text-[9px] opacity-70">1·3·5·7·9</span>
            <span className="text-[9px] opacity-50">₩{betParityAmount.toLocaleString()}</span>
          </Button>
          <Button
            onClick={() => placeParityBet("even")}
            disabled={!canBet || betParity !== null}
            className={`h-14 text-xs font-bold rounded-xl transition-all duration-200 flex flex-col items-center justify-center ${
              betParity === "even"
                ? "bg-pink-600 hover:bg-pink-600 text-white shadow-lg shadow-pink-500/30 scale-[1.02]"
                : "bg-pink-500/10 hover:bg-pink-500/20 text-pink-500 border border-pink-500/30"
            }`}
          >
            <span>짝</span>
            <span className="text-[9px] opacity-70">0·2·4·6·8</span>
            <span className="text-[9px] opacity-50">₩{betParityAmount.toLocaleString()}</span>
          </Button>
        </div>
      </div>

      {/* 배팅 상태 안내 */}
      <p className="text-center text-[10px] text-muted-foreground mt-2">
        {canBet && !betDirection && !betDigit && !betParity && "롱/숏, 언더/오버, 홀/짝 각각 독립 배팅 가능"}
        {canBet && (betDirection || betDigit || betParity) && "추가 배팅 가능"}
        {timeLeft <= 15 && timeLeft > 3 && phase !== "result" && "게임 중 - 배팅 불가"}
        {timeLeft <= 3 && phase !== "result" && "다음 게임까지 3초 전"}
        {phase === "result" && "새 라운드 준비 중..."}
      </p>
    </Card>
  )
}
