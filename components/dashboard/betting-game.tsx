"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, Clock } from "lucide-react"

type BetDirection = "long" | "short" | null

interface RoundResult {
  round: number
  direction: BetDirection
  basePrice: number
  closePrice: number
  won: boolean
}

export function BettingGame() {
  const [timeLeft, setTimeLeft] = useState(30)
  const [roundNumber, setRoundNumber] = useState(0)
  const [betDirection, setBetDirection] = useState<BetDirection>(null)
  const [basePrice, setBasePrice] = useState<number | null>(null)
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [phase, setPhase] = useState<"betting" | "waiting" | "result">("betting")
  const [lastResult, setLastResult] = useState<RoundResult | null>(null)
  const [results, setResults] = useState<RoundResult[]>([])
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)

  const prevRoundRef = useRef<number | null>(null)
  const betRef = useRef<BetDirection>(null)
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

        if (betRef.current && basePriceRef.current !== null && latestClose !== null) {
          const won =
            betRef.current === "long"
              ? latestClose > basePriceRef.current
              : latestClose < basePriceRef.current

          const result: RoundResult = {
            round: roundRef.current,
            direction: betRef.current,
            basePrice: basePriceRef.current,
            closePrice: latestClose,
            won,
          }
          setLastResult(result)
          setResults((prev) => [result, ...prev].slice(0, 20))
          if (won) setWins((w) => w + 1)
          else setLosses((l) => l + 1)
          setPhase("result")
        }

        // 새 라운드 초기화
        betRef.current = null
        setBetDirection(null)
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

  // 베팅 처리
  const placeBet = (direction: BetDirection) => {
    if (phase !== "betting" || betDirection !== null || timeLeft <= 2) return
    const closingPrices: Array<{ time: number; price: number }> =
      (window as any).__bitcoinClosingPrices ?? []
    const base =
      closingPrices.length > 0
        ? closingPrices[closingPrices.length - 1].price
        : currentPrice

    if (!base) return

    betRef.current = direction
    basePriceRef.current = base
    setBetDirection(direction)
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
        <div
          className={`mb-3 rounded-lg px-4 py-2.5 text-center text-sm font-bold border ${
            lastResult.won
              ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
              : "bg-red-500/10 border-red-500/30 text-red-500"
          }`}
        >
          {lastResult.won ? "승리!" : "패배"}{" "}
          <span className="font-normal text-[11px] opacity-80">
            {lastResult.direction === "long" ? "롱" : "숏"} |{" "}
            기준가 ${lastResult.basePrice.toFixed(1)} → ${lastResult.closePrice.toFixed(1)}
          </span>
        </div>
      )}

      {/* 롱 / 숏 버튼 */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          onClick={() => placeBet("long")}
          disabled={phase === "waiting" || phase === "result" || timeLeft <= 2}
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
          disabled={phase === "waiting" || phase === "result" || timeLeft <= 2}
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

      {/* 배팅 상태 안내 */}
      <p className="text-center text-[10px] text-muted-foreground mt-2">
        {phase === "betting" && timeLeft > 2 && "롱 또는 숏을 선택하세요"}
        {phase === "betting" && timeLeft <= 2 && "마감 임박 - 배팅 불가"}
        {phase === "waiting" && betDirection === "long" && "롱 배팅 중... 라운드 마감 대기"}
        {phase === "waiting" && betDirection === "short" && "숏 배팅 중... 라운드 마감 대기"}
        {phase === "result" && "새 라운드 준비 중..."}
      </p>
    </Card>
  )
}
