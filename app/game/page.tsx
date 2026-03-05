"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { TrendingUp, TrendingDown } from "lucide-react"
import { GameChart } from "@/components/game/game-chart"

type BetDirection = "long" | "short" | null
type BetDigit = "under" | "over" | null
type BetParity = "odd" | "even" | null
type BetAmount = 10000 | 50000 | 100000 | 500000 | 1000000

interface RoundResult {
  direction: BetDirection
  digit: BetDigit
  parity: BetParity
  basePrice: number
  closePrice: number
  wonDirection: boolean
  wonDigit: boolean
  wonParity: boolean
}

const BET_AMOUNTS: { label: string; value: BetAmount }[] = [
  { label: "1만", value: 10000 },
  { label: "5만", value: 50000 },
  { label: "10만", value: 100000 },
  { label: "50만", value: 500000 },
  { label: "1백만", value: 1000000 },
]

const INITIAL_BALANCE = 1_000_000

function formatKRW(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억원`
  if (n >= 10_000) return `${Math.round(n / 10_000)}만원`
  return `${n.toLocaleString()}원`
}

// 원형 타이머 SVG
function CircularTimer({ timeLeft, total = 30 }: { timeLeft: number; total?: number }) {
  const r = 36
  const circ = 2 * Math.PI * r
  const progress = timeLeft / total
  const offset = circ * (1 - progress)

  const color =
    timeLeft > 18 ? "#00e676"
    : timeLeft > 15 ? "#ff3d57"
    : timeLeft > 3 ? "#ff9800"
    : "#ff3d57"

  return (
    <div className="relative w-20 h-20 flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="80" height="80">
        <circle cx="40" cy="40" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
        <circle
          cx="40" cy="40" r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.2s linear, stroke 0.3s" }}
        />
      </svg>
      <div className="flex flex-col items-center z-10">
        <span className="text-xl font-bold tabular-nums leading-none" style={{ color }}>
          {timeLeft}
        </span>
        <span className="text-[9px] text-white/40 mt-0.5">초</span>
      </div>
    </div>
  )
}

export default function GamePage() {
  const [timeLeft, setTimeLeft] = useState(30)
  const [betDirection, setBetDirection] = useState<BetDirection>(null)
  const [betDigit, setBetDigit] = useState<BetDigit>(null)
  const [betParity, setBetParity] = useState<BetParity>(null)
  const [betAmount, setBetAmount] = useState<BetAmount>(10000)
  const [basePrice, setBasePrice] = useState<number | null>(null)
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [phase, setPhase] = useState<"betting" | "waiting" | "result">("betting")
  const [lastResult, setLastResult] = useState<RoundResult | null>(null)
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [balance, setBalance] = useState(INITIAL_BALANCE)
  const [roundCount, setRoundCount] = useState(0)
  const [expectedProfit, setExpectedProfit] = useState<number | null>(null)

  const prevRoundRef = useRef<number | null>(null)
  const betRef = useRef<BetDirection>(null)
  const betDigitRef = useRef<BetDigit>(null)
  const betParityRef = useRef<BetParity>(null)
  const basePriceRef = useRef<number | null>(null)
  const betAmountRef = useRef<BetAmount>(10000)

  const getRoundNumber = useCallback(() => {
    return Math.floor(Date.now() / 1000 / 30)
  }, [])

  // 현재가 polling
  useEffect(() => {
    const id = setInterval(() => {
      const p = (window as any).__bitcoinCurrentPrice
      if (p) setCurrentPrice(p)
    }, 300)
    return () => clearInterval(id)
  }, [])

  // 라운드 타이머
  useEffect(() => {
    const tick = setInterval(() => {
      const now = Math.floor(Date.now() / 1000)
      const secondInPeriod = now % 30
      const remaining = 30 - secondInPeriod
      setTimeLeft(remaining)

      const round = getRoundNumber()

      if (prevRoundRef.current !== null && round !== prevRoundRef.current) {
        const prices: Array<{ time: number; price: number }> =
          (window as any).__bitcoinClosingPrices ?? []
        const latestClose =
          prices.length > 0
            ? prices[prices.length - 1].price
            : (window as any).__bitcoinCurrentPrice ?? null

        if (
          (betRef.current || betDigitRef.current || betParityRef.current) &&
          basePriceRef.current !== null &&
          latestClose !== null
        ) {
          const lastDigit = Math.floor(latestClose * 10) % 10
          const wonDirection = betRef.current
            ? betRef.current === "long"
              ? latestClose > basePriceRef.current
              : latestClose < basePriceRef.current
            : false
          const wonDigit = betDigitRef.current
            ? betDigitRef.current === "under" ? lastDigit <= 4 : lastDigit >= 5
            : false
          const wonParity = betParityRef.current
            ? betParityRef.current === "odd" ? lastDigit % 2 !== 0 : lastDigit % 2 === 0
            : false

          const result: RoundResult = {
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
          setRoundCount((c) => c + 1)

          // 배팅 횟수 계산
          const betCount = [betRef.current, betDigitRef.current, betParityRef.current].filter(Boolean).length
          const wonCount = [betRef.current && wonDirection, betDigitRef.current && wonDigit, betParityRef.current && wonParity].filter(Boolean).length
          const lostCount = betCount - wonCount

          if (wonCount > 0) setWins((w) => w + wonCount)
          if (lostCount > 0) setLosses((l) => l + lostCount)

          // 잔고 정산 (이긴 배팅 +배팅금액, 진 배팅 -배팅금액)
          const profit = (wonCount - lostCount) * betAmountRef.current
          setBalance((b) => Math.max(0, b + profit))
          setExpectedProfit(profit)
          setPhase("result")
        }

        // 초기화
        betRef.current = null
        betDigitRef.current = null
        betParityRef.current = null
        setBetDirection(null)
        setBetDigit(null)
        setBetParity(null)
        setBasePrice(null)
        basePriceRef.current = null

        setTimeout(() => {
          setPhase("betting")
          setExpectedProfit(null)
        }, 2000)
      }

      prevRoundRef.current = round
    }, 200)

    return () => clearInterval(tick)
  }, [getRoundNumber])

  const canBet = timeLeft > 15 && phase !== "result"

  const getBase = () => {
    const prices: Array<{ time: number; price: number }> =
      (window as any).__bitcoinClosingPrices ?? []
    return prices.length > 0 ? prices[prices.length - 1].price : currentPrice
  }

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

  const priceDiff = currentPrice !== null && basePrice !== null ? currentPrice - basePrice : null
  const isUp = priceDiff !== null && priceDiff >= 0

  const timerColor =
    timeLeft > 18 ? "#00e676"
    : timeLeft > 15 ? "#ff3d57"
    : timeLeft > 3 ? "#ff9800"
    : "#ff3d57"

  const timerLabel =
    timeLeft > 18 ? "배팅 가능"
    : timeLeft > 15 ? "배팅 마감 3초 전"
    : timeLeft > 3 ? "게임 중"
    : "다음 게임 3초 전"

  const selectedCount = [betDirection, betDigit, betParity].filter(Boolean).length
  const totalBetAmount = selectedCount * betAmount

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0e1a] pb-20">

      {/* 상단 헤더: 잔고 + 타이머 + 가격 */}
      <div className="px-4 pt-5 pb-3 flex items-start justify-between gap-3">
        {/* 왼쪽: 잔고 */}
        <div>
          <p className="text-[10px] text-white/40 uppercase tracking-wider">잔고 BALANCE</p>
          <p className="text-xl font-bold text-white mt-0.5 tabular-nums">
            {balance.toLocaleString()}원
          </p>
          <p className="text-[10px] text-white/40 mt-1">배팅 {roundCount}판</p>
          <p className="text-[10px] mt-0.5" style={{
            color: expectedProfit === null ? "rgba(255,255,255,0.4)"
              : expectedProfit > 0 ? "#00e676"
              : expectedProfit < 0 ? "#ff3d57"
              : "rgba(255,255,255,0.4)"
          }}>
            {expectedProfit === null
              ? "예상 수익 —"
              : expectedProfit > 0
              ? `+${expectedProfit.toLocaleString()}원`
              : expectedProfit < 0
              ? `${expectedProfit.toLocaleString()}원`
              : "±0원"}
          </p>
        </div>

        {/* 가운데: 원형 타이머 */}
        <CircularTimer timeLeft={timeLeft} />

        {/* 오른쪽: 실시간가 / 배팅가 */}
        <div className="text-right">
          <p className="text-[10px] text-white/40">실시간가</p>
          <p className="text-base font-bold tabular-nums" style={{ color: isUp ? "#00e676" : "#ff3d57" }}>
            {currentPrice
              ? currentPrice.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
              : "—"}
          </p>
          <p className="text-[10px] text-white/40 mt-1">배팅가</p>
          <p className="text-sm font-semibold tabular-nums text-white/70">
            {basePrice
              ? basePrice.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
              : (() => {
                  const prices: Array<{ time: number; price: number }> =
                    typeof window !== "undefined" ? ((window as any).__bitcoinClosingPrices ?? []) : []
                  return prices.length > 0
                    ? prices[prices.length - 1].price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                    : "—"
                })()}
          </p>
        </div>
      </div>

      {/* 타이머 상태 라벨 */}
      <div className="px-4 mb-1">
        <p className="text-[10px] font-semibold" style={{ color: timerColor }}>
          {timerLabel}
        </p>
      </div>

      {/* 차트 */}
      <div className="relative mx-4 rounded-xl overflow-hidden border border-white/5" style={{ height: 200 }}>
        <GameChart />
        {/* 현재가 / 배팅가 오버레이 */}
        {priceDiff !== null && (
          <div className="absolute top-2 right-2 flex flex-col items-end gap-0.5 pointer-events-none">
            <div className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: isUp ? "rgba(0,230,118,0.15)" : "rgba(255,61,87,0.15)", color: isUp ? "#00e676" : "#ff3d57" }}>
              {isUp ? "▲" : "▼"} {Math.abs(priceDiff).toFixed(1)}
            </div>
          </div>
        )}
      </div>

      {/* 결과 표시 */}
      {phase === "result" && lastResult && (
        <div className="mx-4 mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <p className="text-[10px] text-white/40 mb-2 text-center">
            마감가 {lastResult.closePrice.toFixed(1)} · 끝자리 {Math.floor(lastResult.closePrice * 10) % 10}
          </p>
          <div className="flex gap-2 justify-center">
            {lastResult.direction && (
              <div className={`text-xs font-bold px-3 py-1.5 rounded-lg ${lastResult.wonDirection ? "bg-[#00e676]/15 text-[#00e676]" : "bg-[#ff3d57]/15 text-[#ff3d57]"}`}>
                {lastResult.direction === "long" ? "롱" : "숏"} {lastResult.wonDirection ? "승리" : "패배"}
              </div>
            )}
            {lastResult.digit && (
              <div className={`text-xs font-bold px-3 py-1.5 rounded-lg ${lastResult.wonDigit ? "bg-[#00e676]/15 text-[#00e676]" : "bg-[#ff3d57]/15 text-[#ff3d57]"}`}>
                {lastResult.digit === "over" ? "오버" : "언더"} {lastResult.wonDigit ? "승리" : "패배"}
              </div>
            )}
            {lastResult.parity && (
              <div className={`text-xs font-bold px-3 py-1.5 rounded-lg ${lastResult.wonParity ? "bg-[#00e676]/15 text-[#00e676]" : "bg-[#ff3d57]/15 text-[#ff3d57]"}`}>
                {lastResult.parity === "odd" ? "홀" : "짝"} {lastResult.wonParity ? "승리" : "패배"}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 배팅 버튼 영역 */}
      <div className="mx-4 mt-3 rounded-xl border border-white/8 bg-[#0f1527] p-4">
        {/* 그룹 헤더 */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          <p className="text-[10px] text-white/30 text-center">롱 / 숏</p>
          <p className="text-[10px] text-white/30 text-center">언더 / 오버</p>
          <p className="text-[10px] text-white/30 text-center">홀 / 짝</p>
        </div>

        <div className="grid grid-cols-3 gap-2">
          {/* 롱 / 숏 */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => placeBet("long")}
              disabled={!canBet || betDirection !== null}
              className={`rounded-xl py-3.5 text-xs font-bold transition-all duration-200 flex flex-col items-center gap-0.5 border ${
                betDirection === "long"
                  ? "bg-[#00e676]/20 border-[#00e676]/50 text-[#00e676] shadow-lg shadow-[#00e676]/10"
                  : !canBet || betDirection !== null
                  ? "bg-white/3 border-white/5 text-white/20 cursor-not-allowed"
                  : "bg-white/5 border-white/10 text-white/70 hover:bg-[#00e676]/10 hover:border-[#00e676]/30 hover:text-[#00e676]"
              }`}
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>롱</span>
              <span className="text-[9px] opacity-60">직전 대비 상승</span>
            </button>
            <button
              onClick={() => placeBet("short")}
              disabled={!canBet || betDirection !== null}
              className={`rounded-xl py-3.5 text-xs font-bold transition-all duration-200 flex flex-col items-center gap-0.5 border ${
                betDirection === "short"
                  ? "bg-[#ff3d57]/20 border-[#ff3d57]/50 text-[#ff3d57] shadow-lg shadow-[#ff3d57]/10"
                  : !canBet || betDirection !== null
                  ? "bg-white/3 border-white/5 text-white/20 cursor-not-allowed"
                  : "bg-white/5 border-white/10 text-white/70 hover:bg-[#ff3d57]/10 hover:border-[#ff3d57]/30 hover:text-[#ff3d57]"
              }`}
            >
              <TrendingDown className="w-3.5 h-3.5" />
              <span>숏</span>
              <span className="text-[9px] opacity-60">직전 대비 하락</span>
            </button>
          </div>

          {/* 언더 / 오버 */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => placeDigitBet("under")}
              disabled={!canBet || betDigit !== null}
              className={`rounded-xl py-3.5 text-xs font-bold transition-all duration-200 flex flex-col items-center gap-0.5 border ${
                betDigit === "under"
                  ? "bg-blue-500/20 border-blue-500/50 text-blue-400 shadow-lg shadow-blue-500/10"
                  : !canBet || betDigit !== null
                  ? "bg-white/3 border-white/5 text-white/20 cursor-not-allowed"
                  : "bg-white/5 border-white/10 text-white/70 hover:bg-blue-500/10 hover:border-blue-500/30 hover:text-blue-400"
              }`}
            >
              <span>언더</span>
              <span className="text-[9px] opacity-60">0 ~ 4</span>
            </button>
            <button
              onClick={() => placeDigitBet("over")}
              disabled={!canBet || betDigit !== null}
              className={`rounded-xl py-3.5 text-xs font-bold transition-all duration-200 flex flex-col items-center gap-0.5 border ${
                betDigit === "over"
                  ? "bg-orange-500/20 border-orange-500/50 text-orange-400 shadow-lg shadow-orange-500/10"
                  : !canBet || betDigit !== null
                  ? "bg-white/3 border-white/5 text-white/20 cursor-not-allowed"
                  : "bg-white/5 border-white/10 text-white/70 hover:bg-orange-500/10 hover:border-orange-500/30 hover:text-orange-400"
              }`}
            >
              <span>오버</span>
              <span className="text-[9px] opacity-60">5 ~ 9</span>
            </button>
          </div>

          {/* 홀 / 짝 */}
          <div className="flex flex-col gap-2">
            <button
              onClick={() => placeParityBet("odd")}
              disabled={!canBet || betParity !== null}
              className={`rounded-xl py-3.5 text-xs font-bold transition-all duration-200 flex flex-col items-center gap-0.5 border ${
                betParity === "odd"
                  ? "bg-violet-500/20 border-violet-500/50 text-violet-400 shadow-lg shadow-violet-500/10"
                  : !canBet || betParity !== null
                  ? "bg-white/3 border-white/5 text-white/20 cursor-not-allowed"
                  : "bg-white/5 border-white/10 text-white/70 hover:bg-violet-500/10 hover:border-violet-500/30 hover:text-violet-400"
              }`}
            >
              <span>홀</span>
              <span className="text-[9px] opacity-60">1·3·5·7·9</span>
            </button>
            <button
              onClick={() => placeParityBet("even")}
              disabled={!canBet || betParity !== null}
              className={`rounded-xl py-3.5 text-xs font-bold transition-all duration-200 flex flex-col items-center gap-0.5 border ${
                betParity === "even"
                  ? "bg-pink-500/20 border-pink-500/50 text-pink-400 shadow-lg shadow-pink-500/10"
                  : !canBet || betParity !== null
                  ? "bg-white/3 border-white/5 text-white/20 cursor-not-allowed"
                  : "bg-white/5 border-white/10 text-white/70 hover:bg-pink-500/10 hover:border-pink-500/30 hover:text-pink-400"
              }`}
            >
              <span>짝</span>
              <span className="text-[9px] opacity-60">0·2·4·6·8</span>
            </button>
          </div>
        </div>
      </div>

      {/* 배팅 금액 선택 */}
      <div className="mx-4 mt-3 rounded-xl border border-white/8 bg-[#0f1527] p-4">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-4 rounded bg-white/10 flex items-center justify-center">
            <span className="text-[9px] text-white/50">₩</span>
          </div>
          <p className="text-xs text-white/40">배팅 가격</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {BET_AMOUNTS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => {
                setBetAmount(value)
                betAmountRef.current = value
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 border ${
                betAmount === value
                  ? "bg-[#00e676]/20 border-[#00e676]/50 text-[#00e676]"
                  : "bg-white/5 border-white/10 text-white/50 hover:bg-white/10"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* CTA 버튼 */}
      <div className="mx-4 mt-3">
        <button
          disabled={selectedCount === 0 || !canBet}
          className={`w-full py-4 rounded-xl text-sm font-bold transition-all duration-200 ${
            selectedCount > 0 && canBet
              ? "bg-[#00e676] text-[#0a0e1a] shadow-lg shadow-[#00e676]/20 active:scale-[0.98]"
              : "bg-white/5 text-white/20 cursor-not-allowed border border-white/8"
          }`}
        >
          {selectedCount === 0
            ? "최소 1개 이상 선택하세요"
            : `${selectedCount}개 선택 · ${totalBetAmount.toLocaleString()}원 배팅`}
        </button>
      </div>

      {/* 하단 고정 바 */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-sm border-t border-white/8 bg-[#0a0e1a]/95 backdrop-blur-md px-6 py-3 flex items-center justify-between">
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-5 h-5 rounded bg-white/10 flex items-center justify-center">
            <span className="text-[10px] text-white/50">≡</span>
          </div>
          <span className="text-[9px] text-white/30">메뉴</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-white/40">
          <span className="font-semibold text-white/60">{selectedCount}</span>
          <span>/</span>
          <span>3 선택됨</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <div className="w-5 h-5 rounded bg-white/10 flex items-center justify-center">
            <span className="text-[10px] text-white/50">?</span>
          </div>
          <span className="text-[9px] text-white/30">도움말</span>
        </div>
      </div>
    </div>
  )
}
