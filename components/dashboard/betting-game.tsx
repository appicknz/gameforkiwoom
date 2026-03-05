"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, Clock } from "lucide-react"

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

  const prevRoundRef = useRef<number | null>(null)
  const betRef = useRef<BetDirection>(null)
  const betDigitRef = useRef<BetDigit>(null)
  const betParityRef = useRef<BetParity>(null)
  const basePriceRef = useRef<number | null>(null)
  const roundRef = useRef<number>(0)

  // 서버 시간 기준 현재 라운드 번호 (00초 또는 30초 기준)
  const getRoundNumber = useCallback(() => {
    const now = Math.floor(Date.now() / 1000)
    return Math.floor(now / 30)
  }, [])

  // 현재가 polling
  useEffect(() => {
    const poll = setInterval(() => {
      if (typeof window !== "undefined" && (window as any).__bitcoinCurrentPrice) {
        setCurrentPrice((window as any).__bitcoinCurrentPrice)
      }
    }, 500)
    return () => clearInterval(poll)
  }, [])

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
        // 이전 라운드 결산
        const currentPriceNow = (window as any).__bitcoinCurrentPrice ?? null
        const closingPrices: Array<{ time: number; price: number }> =
          (window as any).__bitcoinClosingPrices ?? []
        const latestClose =
          closingPrices.length > 0
            ? closingPrices[closingPrices.length - 1].price
            : currentPriceNow

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

  // 공통 기준가 세팅
  const getBase = () => {
    const closingPrices: Array<{ time: number; price: number }> =
      (window as any).__bitcoinClosingPrices ?? []
    return closingPrices.length > 0
      ? closingPrices[closingPrices.length - 1].price
      : currentPrice
  }

  const canBet = (phase === "betting" || phase === "waiting") && timeLeft > 2

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

  const priceDiff =
    currentPrice !== null && basePrice !== null
      ? currentPrice - basePrice
      : null
  const isUp = priceDiff !== null && priceDiff >= 0
  const timerPercent = (timeLeft / 30) * 100
  const timerColor =
    timeLeft <= 5 ? "#ef4444" : timeLeft <= 10 ? "#f97316" : "#22c55e"

  return (
    <Card className="p-4 bg-background border border-border/60">
      {/* 타이틀 + 라운드 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">배팅 게임</h3>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            #{roundNumber}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground">
            <span className="text-emerald-500 font-semibold">{wins}승</span>
            {" / "}
            <span className="text-red-500 font-semibold">{losses}패</span>
          </span>
        </div>
      </div>

      {/* 타이머 바 */}
      <div className="relative mb-3">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="w-3 h-3" />
            <span>라운드 마감</span>
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

      {/* 기준가 vs 현재가 */}
      {basePrice !== null && currentPrice !== null && (
        <div className="flex items-center justify-between mb-3 text-[11px] bg-muted/40 rounded-lg px-3 py-2">
          <div>
            <p className="text-muted-foreground">배팅 기준가</p>
            <p className="font-semibold tabular-nums text-foreground">
              ${basePrice.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </p>
          </div>
          <div className={`text-xs font-bold ${isUp ? "text-emerald-500" : "text-red-500"}`}>
            {isUp ? "▲" : "▼"} {Math.abs(priceDiff!).toFixed(1)}
          </div>
          <div className="text-right">
            <p className="text-muted-foreground">현재가</p>
            <p className={`font-semibold tabular-nums ${isUp ? "text-emerald-500" : "text-red-500"}`}>
              ${currentPrice.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </p>
          </div>
        </div>
      )}

      {/* 결과 표시 */}
      {phase === "result" && lastResult && (
        <div className="mb-3 rounded-lg px-4 py-2.5 border border-border/40 bg-muted/30 space-y-1">
          <p className="text-[11px] text-muted-foreground text-center">
            마감가 ${lastResult.closePrice.toFixed(1)} (끝자리: {Math.floor(lastResult.closePrice * 10) % 10})
          </p>
          <div className="flex gap-2">
            {lastResult.direction && (
              <div className={`flex-1 text-center text-xs font-bold py-1 rounded-lg ${lastResult.wonDirection ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                {lastResult.direction === "long" ? "롱" : "숏"} {lastResult.wonDirection ? "승리" : "패배"}
              </div>
            )}
            {lastResult.digit && (
              <div className={`flex-1 text-center text-xs font-bold py-1 rounded-lg ${lastResult.wonDigit ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                {lastResult.digit === "under" ? "언더" : "오버"} {lastResult.wonDigit ? "승리" : "패배"}
              </div>
            )}
            {lastResult.parity && (
              <div className={`flex-1 text-center text-xs font-bold py-1 rounded-lg ${lastResult.wonParity ? "bg-emerald-500/10 text-emerald-500" : "bg-red-500/10 text-red-500"}`}>
                {lastResult.parity === "odd" ? "홀" : "짝"} {lastResult.wonParity ? "승리" : "패배"}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3그룹 버튼: 롱/숏 | 오버/언더 | 홀/짝 */}
      <div className="grid grid-cols-3 gap-2">
        {/* 그룹 1: 롱 / 숏 */}
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => placeBet("long")}
            disabled={!canBet || betDirection !== null}
            className={`h-11 text-xs font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-1 ${
              betDirection === "long"
                ? "bg-emerald-600 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 scale-[1.02]"
                : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            롱
          </Button>
          <Button
            onClick={() => placeBet("short")}
            disabled={!canBet || betDirection !== null}
            className={`h-11 text-xs font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-1 ${
              betDirection === "short"
                ? "bg-red-600 hover:bg-red-600 text-white shadow-lg shadow-red-500/30 scale-[1.02]"
                : "bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30"
            }`}
          >
            <TrendingDown className="w-3.5 h-3.5" />
            숏
          </Button>
        </div>

        {/* 그룹 2: 오버 / 언더 */}
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => placeDigitBet("over")}
            disabled={!canBet || betDigit !== null}
            className={`h-11 text-xs font-bold rounded-xl transition-all duration-200 flex flex-col items-center justify-center ${
              betDigit === "over"
                ? "bg-orange-600 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/30 scale-[1.02]"
                : "bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/30"
            }`}
          >
            <span>오버</span>
            <span className="text-[9px] opacity-70">5~9</span>
          </Button>
          <Button
            onClick={() => placeDigitBet("under")}
            disabled={!canBet || betDigit !== null}
            className={`h-11 text-xs font-bold rounded-xl transition-all duration-200 flex flex-col items-center justify-center ${
              betDigit === "under"
                ? "bg-blue-600 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-[1.02]"
                : "bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-500/30"
            }`}
          >
            <span>언더</span>
            <span className="text-[9px] opacity-70">0~4</span>
          </Button>
        </div>

        {/* 그룹 3: 홀 / 짝 */}
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => placeParityBet("odd")}
            disabled={!canBet || betParity !== null}
            className={`h-11 text-xs font-bold rounded-xl transition-all duration-200 flex flex-col items-center justify-center ${
              betParity === "odd"
                ? "bg-violet-600 hover:bg-violet-600 text-white shadow-lg shadow-violet-500/30 scale-[1.02]"
                : "bg-violet-500/10 hover:bg-violet-500/20 text-violet-500 border border-violet-500/30"
            }`}
          >
            <span>홀</span>
            <span className="text-[9px] opacity-70">1·3·5·7·9</span>
          </Button>
          <Button
            onClick={() => placeParityBet("even")}
            disabled={!canBet || betParity !== null}
            className={`h-11 text-xs font-bold rounded-xl transition-all duration-200 flex flex-col items-center justify-center ${
              betParity === "even"
                ? "bg-pink-600 hover:bg-pink-600 text-white shadow-lg shadow-pink-500/30 scale-[1.02]"
                : "bg-pink-500/10 hover:bg-pink-500/20 text-pink-500 border border-pink-500/30"
            }`}
          >
            <span>짝</span>
            <span className="text-[9px] opacity-70">0·2·4·6·8</span>
          </Button>
        </div>
      </div>

      {/* 배팅 상태 안내 */}
      <p className="text-center text-[10px] text-muted-foreground mt-2">
        {canBet && !betDirection && !betDigit && !betParity && "롱/숏, 언더/오버, 홀/짝 각각 독립 배팅 가능"}
        {canBet && (betDirection || betDigit || betParity) && "추가 배팅 가능"}
        {phase === "betting" && timeLeft <= 2 && "마감 임박 - 배팅 불가"}
        {phase === "waiting" && "배팅 완료 - 라운드 마감 대기 중"}
        {phase === "result" && "새 라운드 준비 중..."}
      </p>
    </Card>
  )
}
