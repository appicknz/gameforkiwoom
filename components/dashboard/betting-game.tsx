"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, Clock } from "lucide-react"

type BetDirection = "long" | "short" | null
type BetDigit = "under" | "over" | null

interface RoundResult {
  round: number
  direction: BetDirection
  digit: BetDigit
  basePrice: number
  closePrice: number
  wonDirection: boolean
  wonDigit: boolean
}

export function BettingGame() {
  const [timeLeft, setTimeLeft] = useState(30)
  const [roundNumber, setRoundNumber] = useState(0)
  const [betDirection, setBetDirection] = useState<BetDirection>(null)
  const [betDigit, setBetDigit] = useState<BetDigit>(null)
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

        if ((betRef.current || betDigitRef.current) && basePriceRef.current !== null && latestClose !== null) {
          const lastDigit = Math.floor(latestClose * 10) % 10
          const wonDirection = betRef.current
            ? betRef.current === "long"
              ? latestClose > basePriceRef.current
              : latestClose < basePriceRef.current
            : false
          const wonDigit = betDigitRef.current
            ? betDigitRef.current === "under"
              ? lastDigit >= 0 && lastDigit <= 4
              : lastDigit >= 5 && lastDigit <= 9
            : false

          const result: RoundResult = {
            round: roundRef.current,
            direction: betRef.current,
            digit: betDigitRef.current,
            basePrice: basePriceRef.current,
            closePrice: latestClose,
            wonDirection,
            wonDigit,
          }
          setLastResult(result)
          setResults((prev) => [result, ...prev].slice(0, 20))
          const anyWon = (betRef.current && wonDirection) || (betDigitRef.current && wonDigit)
          const anyLost = (betRef.current && !wonDirection) || (betDigitRef.current && !wonDigit)
          if (anyWon) setWins((w) => w + 1)
          if (anyLost) setLosses((l) => l + 1)
          setPhase("result")
        }

        // 새 라운드 초기화
        betRef.current = null
        betDigitRef.current = null
        setBetDirection(null)
        setBetDigit(null)
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

  const canBet = phase === "betting" && timeLeft > 2

  // 롱/숏 배팅 처리
  const placeBet = (direction: BetDirection) => {
    if (!canBet || betDirection !== null) return
    const base = getBase()
    if (!base) return
    betRef.current = direction
    basePriceRef.current = base
    setBetDirection(direction)
    setBasePrice(base)
    if (betDigit !== null) setPhase("waiting")
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
    if (betDirection !== null) setPhase("waiting")
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
          </div>
        </div>
      )}

      {/* 롱 / 숏 버튼 */}
      <div className="grid grid-cols-2 gap-2 mb-2">
        <Button
          onClick={() => placeBet("long")}
          disabled={!canBet || betDirection !== null}
          className={`h-12 text-sm font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 ${
            betDirection === "long"
              ? "bg-emerald-600 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 scale-[1.02]"
              : "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          롱
        </Button>
        <Button
          onClick={() => placeBet("short")}
          disabled={!canBet || betDirection !== null}
          className={`h-12 text-sm font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 ${
            betDirection === "short"
              ? "bg-red-600 hover:bg-red-600 text-white shadow-lg shadow-red-500/30 scale-[1.02]"
              : "bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/30"
          }`}
        >
          <TrendingDown className="w-4 h-4" />
          숏
        </Button>
      </div>

      {/* 언더 / 오버 버튼 */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={() => placeDigitBet("under")}
          disabled={!canBet || betDigit !== null}
          className={`h-10 text-sm font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 ${
            betDigit === "under"
              ? "bg-blue-600 hover:bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-[1.02]"
              : "bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 border border-blue-500/30"
          }`}
        >
          언더 (0~4)
        </Button>
        <Button
          onClick={() => placeDigitBet("over")}
          disabled={!canBet || betDigit !== null}
          className={`h-10 text-sm font-bold rounded-xl transition-all duration-200 flex items-center justify-center gap-1.5 ${
            betDigit === "over"
              ? "bg-orange-600 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/30 scale-[1.02]"
              : "bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 border border-orange-500/30"
          }`}
        >
          오버 (5~9)
        </Button>
      </div>

      {/* 배팅 상태 안내 */}
      <p className="text-center text-[10px] text-muted-foreground mt-2">
        {canBet && !betDirection && !betDigit && "롱/숏 또는 언더/오버를 선택하세요 (각각 독립 배팅)"}
        {canBet && (betDirection || betDigit) && "추가 배팅 가능"}
        {phase === "betting" && timeLeft <= 2 && "마감 임박 - 배팅 불가"}
        {phase === "waiting" && "배팅 완료 - 라운드 마감 대기 중"}
        {phase === "result" && "새 라운드 준비 중..."}
      </p>
    </Card>
  )
}
