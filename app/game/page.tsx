"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { Check, X } from "lucide-react"
import { GameChart } from "@/components/game/game-chart"
import { usePriceWorker } from "@/hooks/use-price-worker"

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
  profit: number
  betAmount: number
}

const BET_AMOUNTS: { label: string; value: BetAmount }[] = [
  { label: "1만", value: 10000 },
  { label: "5만", value: 50000 },
  { label: "10만", value: 100000 },
  { label: "50만", value: 500000 },
  { label: "1백만", value: 1000000 },
]

const INITIAL_BALANCE = 1_000_000
const PAYOUT_RATIO = 0.95 // 이기면 배팅금의 95% 수익

function CircularTimer({ timeLeft, total = 30 }: { timeLeft: number; total?: number }) {
  const r = 34
  const circ = 2 * Math.PI * r
  const progress = timeLeft / total
  const offset = circ * (1 - progress)

  const color =
    timeLeft > 18 ? "#00e676"
    : timeLeft > 15 ? "#ff3d57"
    : timeLeft > 3 ? "#ff9800"
    : "#ff3d57"

  return (
    <div className="relative w-[76px] h-[76px] flex items-center justify-center">
      <svg className="absolute inset-0 -rotate-90" width="76" height="76">
        <circle cx="38" cy="38" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
        <circle
          cx="38" cy="38" r={r}
          fill="none"
          stroke={color}
          strokeWidth="4"
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.25s linear, stroke 0.3s" }}
        />
      </svg>
      {/* 가운데 어두운 원 */}
      <div className="absolute inset-[8px] rounded-full bg-[#0a0e1a] flex items-center justify-center flex-col">
        <span className="text-lg font-bold tabular-nums leading-none" style={{ color }}>
          {timeLeft}
        </span>
        <span className="text-[8px] text-white/30 mt-0.5">초</span>
      </div>
    </div>
  )
}

// 끝자리 배지 색상
function digitColor(d: number) {
  if (d <= 4) return { bg: "rgba(59,130,246,0.25)", color: "#60a5fa" }
  return { bg: "rgba(251,146,60,0.25)", color: "#fb923c" }
}

function formatAmount(n: number) {
  if (n >= 10000) return `${(n / 10000).toFixed(n % 10000 === 0 ? 0 : 1)}만`
  return n.toLocaleString()
}

function expectedReturn(betCount: number, amount: number) {
  // 배팅금 * 배팅수 넣고 모두 이기면 각각 PAYOUT_RATIO 수익
  return Math.floor(amount * betCount * PAYOUT_RATIO)
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
  const [balance, setBalance] = useState(INITIAL_BALANCE)
  const [roundCount, setRoundCount] = useState(0)
  const [recentDigits, setRecentDigits] = useState<number[]>([])
  const [showResult, setShowResult] = useState(false)

  const prevRoundRef = useRef<number | null>(null)
  const betRef = useRef<BetDirection>(null)
  const betDigitRef = useRef<BetDigit>(null)
  const betParityRef = useRef<BetParity>(null)
  const basePriceRef = useRef<number | null>(null)
  const betAmountRef = useRef<BetAmount>(10000)
  // closing prices를 ref로 관리 — window 폴링 불필요
  const closingPricesRef = useRef<Array<{ time: number; price: number }>>([])
  const currentPriceRef = useRef<number | null>(null)

  const getRoundNumber = useCallback(() => Math.floor(Date.now() / 1000 / 30), [])

  // usePriceWorker를 game page에서 직접 구독 — GameChart prop 콜백과 동일 소스
  usePriceWorker({
    onPrice: useCallback((price: number) => {
      setCurrentPrice(price)
      currentPriceRef.current = price
    }, []),
    onClosingPrice: useCallback((price: number, time: number) => {
      closingPricesRef.current = [...closingPricesRef.current, { time, price }].slice(-100)
      // 최근 끝자리 배지 업데이트
      setRecentDigits(closingPricesRef.current.slice(-8).map((p) => Math.floor(p.price * 10) % 10))
    }, []),
    onInitClosing: useCallback((prices: Array<{ time: number; price: number }>) => {
      closingPricesRef.current = prices
      setRecentDigits(prices.slice(-8).map((p) => Math.floor(p.price * 10) % 10))
    }, []),
  })

  // GameChart props — 차트 캔들 업데이트만 담당, 가격 소스는 위 usePriceWorker와 동일
  const handlePrice = useCallback((_price: number) => {}, [])
  const handleClosingPrice = useCallback((_price: number, _bucket: number) => {}, [])

  // 라운드 타이머 + 결산
  useEffect(() => {
    const tick = setInterval(() => {
      const now = Math.floor(Date.now() / 1000)
      const secondInPeriod = now % 30
      const remaining = 30 - secondInPeriod
      setTimeLeft(remaining)

      const round = getRoundNumber()

      if (prevRoundRef.current !== null && round !== prevRoundRef.current) {
        // ref에서 직접 읽음 — window 폴링 완전 제거
        const prices = closingPricesRef.current
        const latestClose =
          prices.length > 0
            ? prices[prices.length - 1].price
            : currentPriceRef.current

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

          const betCount = [betRef.current, betDigitRef.current, betParityRef.current].filter(Boolean).length
          const wonCount = [
            betRef.current && wonDirection,
            betDigitRef.current && wonDigit,
            betParityRef.current && wonParity,
          ].filter(Boolean).length
          const lostCount = betCount - wonCount

          // 정산: 이긴 배팅 +95%, 진 배팅 -100%
          const profit = Math.floor(wonCount * betAmountRef.current * PAYOUT_RATIO) - lostCount * betAmountRef.current
          const newBalance = Math.max(0, balance + profit)

          const result: RoundResult = {
            direction: betRef.current,
            digit: betDigitRef.current,
            parity: betParityRef.current,
            basePrice: basePriceRef.current,
            closePrice: latestClose,
            wonDirection,
            wonDigit,
            wonParity,
            profit,
            betAmount: betAmountRef.current,
          }
          setLastResult(result)
          setRoundCount((c) => c + 1)
          setBalance(newBalance)
          setPhase("result")
          setShowResult(true)

          // DB에 결과 저장 (비동기, 실패해도 UI는 진행)
          const token = typeof window !== "undefined" ? sessionStorage.getItem("supabase_token") : null
          if (token) {
            fetch("/api/user/game/play", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ profit, newBalance }),
            }).catch((err) => console.error("Game result save failed:", err))
          }

          setTimeout(() => {
            setShowResult(false)
            setPhase("betting")
          }, 4000)
        }

        betRef.current = null
        betDigitRef.current = null
        betParityRef.current = null
        setBetDirection(null)
        setBetDigit(null)
        setBetParity(null)
        setBasePrice(null)
        basePriceRef.current = null
      }

      prevRoundRef.current = round
    }, 200)
    return () => clearInterval(tick)
  }, [getRoundNumber])

  const canBet = timeLeft > 15 && phase !== "result"
  const isLocked = timeLeft <= 15

  const getBase = () => {
    const prices = closingPricesRef.current
    return prices.length > 0 ? prices[prices.length - 1].price : currentPriceRef.current
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
  const totalBet = selectedCount * betAmount
  const totalExpected = expectedReturn(selectedCount, betAmount)

  // 배팅 금액 포맷 (버튼 아래 표시)
  const amountLabel = `$${(betAmount / 1000).toFixed(2)}`

  // iPhone mini: 375×812. 하단 �� 56px, safe area 고려해 전체를 h-screen으로 고정
  return (
    <div className="flex flex-col h-screen bg-[#0a0e1a] overflow-hidden relative" style={{ maxHeight: 812 }}>

      {/* 상단 헤더: grid-cols-3으로 타이머를 정확히 가운데 고정 */}
      <div className="px-4 pt-3 pb-1 grid grid-cols-3 items-center shrink-0">
        {/* 왼쪽: 잔고 */}
        <div>
          <p className="text-[8px] text-white/30 uppercase tracking-widest">잔고 BALANCE</p>
          <p className="text-[13px] font-bold text-white tabular-nums leading-tight">
            {balance.toLocaleString()}원
          </p>
          <p className="text-[9px] text-white/30 mt-0.5">배팅 {roundCount}판</p>
          <p className="text-[9px] mt-0.5 text-white/30">
            예상 수익{" "}
            {selectedCount > 0
              ? <span className="text-[#00e676]">{formatAmount(totalExpected)}</span>
              : "—"}
          </p>
        </div>

        {/* 가운데: 원형 타이머 — 완전히 가운데 정렬 */}
        <div className="flex flex-col items-center gap-1">
          <CircularTimer timeLeft={timeLeft} />
          <div className="flex gap-1">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-1.5 h-1.5 rounded-full transition-all duration-300"
                style={{ background: i < selectedCount ? "#00e676" : "rgba(255,255,255,0.12)" }}
              />
            ))}
          </div>
        </div>

        {/* 오른쪽: 실시간가 / 배팅가 */}
        <div className="text-right">
          <p className="text-[8px] text-white/30">실시간가</p>
          <p className="text-[13px] font-bold tabular-nums leading-tight" style={{ color: isUp ? "#00e676" : "#ff3d57" }}>
            {currentPrice
              ? currentPrice.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
              : "—"}
          </p>
          <p className="text-[8px] text-white/20 my-0.5">VS</p>
          <p className="text-[8px] text-white/30">배팅가</p>
          <p className="text-[12px] font-semibold tabular-nums text-white/60">
            {(() => {
              const displayPrice = basePrice ?? closingPricesRef.current[closingPricesRef.current.length - 1]?.price ?? null
              return displayPrice
                ? displayPrice.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                : "—"
            })()}
          </p>
        </div>
      </div>

      {/* 최근 끝자리 배지 */}
      {recentDigits.length > 0 && (
        <div className="px-4 pb-1 flex gap-1 shrink-0">
          {recentDigits.map((d, i) => {
            const { bg, color } = digitColor(d)
            const isLast = i === recentDigits.length - 1
            return (
              <div
                key={i}
                className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold transition-all duration-300"
                style={{
                  background: bg,
                  color,
                  border: isLast ? `1.5px solid ${color}` : "1.5px solid transparent",
                  transform: isLast ? "scale(1.1)" : "scale(1)",
                }}
              >
                {d}
              </div>
            )
          })}
        </div>
      )}

      {/* 차트 */}
      <div className="relative mx-4 rounded-xl overflow-hidden border border-white/5 shrink-0" style={{ height: 148 }}>
        <GameChart onPrice={handlePrice} onClosingPrice={handleClosingPrice} />
      </div>

      {/* 타이머 상태 라벨 */}
      <div className="px-4 mt-1 mb-1 shrink-0">
        <p className="text-[9px] font-semibold" style={{ color: timerColor }}>
          {timerLabel}
        </p>
      </div>

      {/* 배팅 버튼 영역 */}
      <div className="mx-4 rounded-xl border border-white/8 bg-[#0f1527] p-2.5 shrink-0">
        <div className="grid grid-cols-3 gap-1.5 mb-1.5">
          {["롱 / 숏", "언더 / 오버", "홀 / 짝"].map((label) => (
            <p key={label} className="text-[9px] text-white/25 text-center">{label}</p>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {/* 그룹 1: 롱 / 숏 */}
          <div className="flex flex-col gap-1.5">
            {(["long", "short"] as const).map((dir) => {
              const isSelected = betDirection === dir
              const isWon = lastResult?.direction === dir && lastResult.wonDirection
              const isResult = phase === "result" && lastResult?.direction === dir
              const color = dir === "long" ? "#00e676" : "#ff3d57"
              return (
                <button
                  key={dir}
                  onClick={() => placeBet(dir)}
                  disabled={!canBet || betDirection !== null}
                  className="rounded-xl py-2.5 text-[11px] font-bold transition-all duration-200 flex flex-col items-center gap-0.5 border relative"
                  style={{
                    background: isResult
                      ? isWon ? "rgba(0,230,118,0.12)" : "rgba(255,61,87,0.12)"
                      : isSelected ? (dir === "long" ? "rgba(0,230,118,0.15)" : "rgba(255,61,87,0.15)") : "rgba(255,255,255,0.03)",
                    borderColor: isResult ? (isWon ? "#00e676" : "#ff3d57") : isSelected ? color : "rgba(255,255,255,0.08)",
                    color: isResult ? (isWon ? "#00e676" : "#ff3d57") : isSelected ? color : "rgba(255,255,255,0.4)",
                    boxShadow: isSelected ? `0 0 12px ${color}22` : "none",
                  }}
                >
                  {isResult && (
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ background: isWon ? "#00e676" : "#ff3d57" }}>
                      {isWon ? <Check className="w-2.5 h-2.5 text-black" /> : <X className="w-2.5 h-2.5 text-white" />}
                    </div>
                  )}
                  <span>{dir === "long" ? "롱" : "숏"}</span>
                  <span className="text-[8px] opacity-50">{dir === "long" ? "직전 대비 상승" : "직전 대비 하락"}</span>
                  {isSelected && <span className="text-[8px] opacity-60">{amountLabel}</span>}
                </button>
              )
            })}
            {isLocked && <p className="text-[8px] text-white/20 text-center tracking-widest">LOCKED</p>}
          </div>

          {/* 그룹 2: 언더 / 오버 */}
          <div className="flex flex-col gap-1.5">
            {(["under", "over"] as const).map((dig) => {
              const isSelected = betDigit === dig
              const isWon = lastResult?.digit === dig && lastResult.wonDigit
              const isResult = phase === "result" && lastResult?.digit === dig
              const color = dig === "under" ? "#60a5fa" : "#fb923c"
              return (
                <button
                  key={dig}
                  onClick={() => placeDigitBet(dig)}
                  disabled={!canBet || betDigit !== null}
                  className="rounded-xl py-2.5 text-[11px] font-bold transition-all duration-200 flex flex-col items-center gap-0.5 border relative"
                  style={{
                    background: isResult
                      ? isWon ? "rgba(0,230,118,0.12)" : "rgba(255,61,87,0.12)"
                      : isSelected ? `${color}22` : "rgba(255,255,255,0.03)",
                    borderColor: isResult ? (isWon ? "#00e676" : "#ff3d57") : isSelected ? color : "rgba(255,255,255,0.08)",
                    color: isResult ? (isWon ? "#00e676" : "#ff3d57") : isSelected ? color : "rgba(255,255,255,0.4)",
                    boxShadow: isSelected ? `0 0 12px ${color}22` : "none",
                  }}
                >
                  {isResult && (
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ background: isWon ? "#00e676" : "#ff3d57" }}>
                      {isWon ? <Check className="w-2.5 h-2.5 text-black" /> : <X className="w-2.5 h-2.5 text-white" />}
                    </div>
                  )}
                  <span>{dig === "under" ? "언더" : "오버"}</span>
                  <span className="text-[8px] opacity-50">{dig === "under" ? "0 ~ 4" : "5 ~ 9"}</span>
                  {isSelected && <span className="text-[8px] opacity-60">{amountLabel}</span>}
                </button>
              )
            })}
            {isLocked && <p className="text-[8px] text-white/20 text-center tracking-widest">LOCKED</p>}
          </div>

          {/* 그룹 3: 홀 / 짝 */}
          <div className="flex flex-col gap-1.5">
            {(["odd", "even"] as const).map((par) => {
              const isSelected = betParity === par
              const isWon = lastResult?.parity === par && lastResult.wonParity
              const isResult = phase === "result" && lastResult?.parity === par
              const color = par === "odd" ? "#a78bfa" : "#f472b6"
              return (
                <button
                  key={par}
                  onClick={() => placeParityBet(par)}
                  disabled={!canBet || betParity !== null}
                  className="rounded-xl py-2.5 text-[11px] font-bold transition-all duration-200 flex flex-col items-center gap-0.5 border relative"
                  style={{
                    background: isResult
                      ? isWon ? "rgba(0,230,118,0.12)" : "rgba(255,61,87,0.12)"
                      : isSelected ? `${color}22` : "rgba(255,255,255,0.03)",
                    borderColor: isResult ? (isWon ? "#00e676" : "#ff3d57") : isSelected ? color : "rgba(255,255,255,0.08)",
                    color: isResult ? (isWon ? "#00e676" : "#ff3d57") : isSelected ? color : "rgba(255,255,255,0.4)",
                    boxShadow: isSelected ? `0 0 12px ${color}22` : "none",
                  }}
                >
                  {isResult && (
                    <div className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ background: isWon ? "#00e676" : "#ff3d57" }}>
                      {isWon ? <Check className="w-2.5 h-2.5 text-black" /> : <X className="w-2.5 h-2.5 text-white" />}
                    </div>
                  )}
                  <span>{par === "odd" ? "홀" : "짝"}</span>
                  <span className="text-[8px] opacity-50">{par === "odd" ? "1·3·5·7·9" : "0·2·4·6·8"}</span>
                  {isSelected && <span className="text-[8px] opacity-60">{amountLabel}</span>}
                </button>
              )
            })}
            {isLocked && <p className="text-[8px] text-white/20 text-center tracking-widest">LOCKED</p>}
          </div>
        </div>
      </div>

      {/* 배팅 금액 선택 */}
      <div className="mx-4 mt-2 rounded-xl border border-white/8 bg-[#0f1527] px-3 py-2 shrink-0">
        <div className="flex items-center gap-1 mb-2">
          <span className="text-[9px] text-white/30">₩</span>
          <p className="text-[9px] text-white/30">배팅 가격</p>
        </div>
        <div className="flex gap-1.5">
          {BET_AMOUNTS.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => { setBetAmount(value); betAmountRef.current = value }}
              className="flex-1 py-1.5 rounded-full text-[10px] font-semibold transition-all duration-200 border"
              style={{
                background: betAmount === value ? "rgba(0,230,118,0.18)" : "rgba(255,255,255,0.04)",
                borderColor: betAmount === value ? "#00e676" : "rgba(255,255,255,0.08)",
                color: betAmount === value ? "#00e676" : "rgba(255,255,255,0.4)",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* CTA 버튼 */}
      <div className="mx-4 mt-2 mb-1 shrink-0">
        <button
          disabled={selectedCount === 0 || !canBet}
          className="w-full py-3.5 rounded-xl text-[13px] font-bold transition-all duration-200"
          style={{
            background: selectedCount > 0 && canBet
              ? "linear-gradient(135deg, #00e676, #00c853)"
              : "rgba(255,255,255,0.04)",
            color: selectedCount > 0 && canBet ? "#0a0e1a" : "rgba(255,255,255,0.2)",
            boxShadow: selectedCount > 0 && canBet ? "0 4px 20px rgba(0,230,118,0.25)" : "none",
            cursor: selectedCount === 0 || !canBet ? "not-allowed" : "pointer",
            border: selectedCount > 0 && canBet ? "none" : "1px solid rgba(255,255,255,0.06)",
          }}
        >
          {selectedCount === 0
            ? "최소 1개 이상 선택하세요"
            : !canBet
            ? "배팅 마감"
            : `${formatAmount(totalBet)}원 배팅 → ${formatAmount(totalExpected)}원 도전`}
        </button>
      </div>

      {/* 결과 오버레이 */}
      {showResult && lastResult && (
        <div
          className="absolute inset-x-4 bottom-16 rounded-2xl overflow-hidden z-50"
          style={{
            background: "rgba(10,14,26,0.97)",
            border: lastResult.profit >= 0 ? "1px solid rgba(0,230,118,0.3)" : "1px solid rgba(255,61,87,0.3)",
          }}
        >
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-start justify-between mb-1">
              <p
                className="text-[38px] font-black leading-none tracking-tight"
                style={{ color: lastResult.profit >= 0 ? "#00e676" : "#ff3d57" }}
              >
                {lastResult.profit >= 0 ? "WIN" : "LOSE"}
              </p>
              <div className="text-right">
                <p className="text-[9px] text-white/30">
                  {lastResult.profit >= 0 ? "배팅 성공" : "배팅 실패"}
                </p>
                <p
                  className="text-sm font-bold tabular-nums"
                  style={{ color: lastResult.profit >= 0 ? "#00e676" : "#ff3d57" }}
                >
                  {lastResult.profit >= 0 ? "+" : ""}{lastResult.profit.toLocaleString()}원
                </p>
              </div>
            </div>
            <p className="text-[9px] text-white/30 mb-2.5">
              끝자리 {Math.floor(lastResult.closePrice * 10) % 10}
              {lastResult.digit && ` · ${lastResult.digit === "under" ? "언더(0-4)" : "오버(5-9)"}`}
              {lastResult.parity && ` · ${lastResult.parity === "odd" ? "홀(1·3·5·7·9)" : "짝(0·2·4·6·8)"}`}
            </p>
            <div className="flex gap-1.5 flex-wrap">
              {lastResult.direction && (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border"
                  style={{
                    background: lastResult.wonDirection ? "rgba(0,230,118,0.12)" : "rgba(255,61,87,0.12)",
                    borderColor: lastResult.wonDirection ? "#00e676" : "#ff3d57",
                    color: lastResult.wonDirection ? "#00e676" : "#ff3d57",
                  }}>
                  {lastResult.direction === "long" ? "롱" : "숏"}
                  {lastResult.wonDirection ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                </div>
              )}
              {lastResult.digit && (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border"
                  style={{
                    background: lastResult.wonDigit ? "rgba(0,230,118,0.12)" : "rgba(255,61,87,0.12)",
                    borderColor: lastResult.wonDigit ? "#00e676" : "#ff3d57",
                    color: lastResult.wonDigit ? "#00e676" : "#ff3d57",
                  }}>
                  {lastResult.digit === "under" ? "언더" : "오버"}
                  {lastResult.wonDigit ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                </div>
              )}
              {lastResult.parity && (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border"
                  style={{
                    background: lastResult.wonParity ? "rgba(0,230,118,0.12)" : "rgba(255,61,87,0.12)",
                    borderColor: lastResult.wonParity ? "#00e676" : "#ff3d57",
                    color: lastResult.wonParity ? "#00e676" : "#ff3d57",
                  }}>
                  {lastResult.parity === "odd" ? "홀" : "짝"}
                  {lastResult.wonParity ? <Check className="w-2.5 h-2.5" /> : <X className="w-2.5 h-2.5" />}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 하단 고정 바 */}
      <div className="shrink-0 border-t border-white/6 bg-[#0a0e1a] px-6 py-2.5 flex items-center justify-between mt-auto">
        <button>
          <div className="w-7 h-7 rounded-lg bg-white/6 flex items-center justify-center">
            <span className="text-sm text-white/40">≡</span>
          </div>
        </button>
        <div className="flex items-center gap-1 text-xs">
          <span className="font-bold" style={{ color: selectedCount > 0 ? "#00e676" : "rgba(255,255,255,0.3)" }}>
            {selectedCount}
          </span>
          <span className="text-white/20">/3 선택됨</span>
        </div>
        <button>
          <div className="w-7 h-7 rounded-lg bg-white/6 flex items-center justify-center">
            <span className="text-sm text-white/40">?</span>
          </div>
        </button>
      </div>
    </div>
  )
}
