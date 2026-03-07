"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { TrendingUp, TrendingDown, X, RotateCcw } from "lucide-react"
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

const CHIPS = [
  { label: "1만", value: 10_000 },
  { label: "5만", value: 50_000 },
  { label: "10만", value: 100_000 },
  { label: "50만", value: 500_000 },
  { label: "100만", value: 1_000_000 },
]

const PAYOUT_RATIO = 1.95

function getToken(): string | null {
  if (typeof window === "undefined") return null
  try { return localStorage.getItem("app_token") } catch { return null }
}

// ── 원형 타이머 ────────────────────────────────────────────────────────────
function CircularTimer({ timeLeft, statusLabel }: { timeLeft: number; statusLabel: string }) {
  const r = 44
  const circ = 2 * Math.PI * r
  const progress = (timeLeft / 30) * circ
  const color = timeLeft > 18 ? "#00ff88" : timeLeft > 15 ? "#ff4444" : timeLeft > 3 ? "#ff8800" : "#ff4444"

  return (
    <div className="relative flex items-center justify-center" style={{ width: 110, height: 110 }}>
      <svg width="110" height="110" style={{ transform: "rotate(-90deg)", position: "absolute" }}>
        {/* 배경 트랙 */}
        <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        {/* 진행 */}
        <circle
          cx="55" cy="55" r={r}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${progress} ${circ}`}
          style={{ transition: "stroke-dasharray 0.2s linear, stroke 0.3s", filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="flex flex-col items-center z-10">
        {/* 카운트다운 숫자 (30초부터 감소) */}
        <span className="font-black text-3xl leading-none tabular-nums" style={{ color, fontFamily: "var(--font-orbitron, monospace)" }}>
          {timeLeft}
        </span>
        {/* 상태 레이블 */}
        <span className="text-[8px] font-semibold mt-0.5 tracking-tight" style={{ color }}>
          {statusLabel}
        </span>
      </div>
    </div>
  )
}

// ── 배팅 바텀시트 ────────────────────────────────────────────────────────────
interface BetDialogProps {
  open: boolean
  betType: BetType | null
  selectedValue: string | null
  onClose: () => void
  onConfirm: (amount: number) => void
  isLoading: boolean
  balance: number | null
}

const NEON_LABEL: Record<string, { text: string; color: string; glow: string }> = {
  long:  { text: "롱",   color: "#00ff88", glow: "rgba(0,255,136,0.4)" },
  short: { text: "숏",   color: "#ff4444", glow: "rgba(255,68,68,0.4)" },
  over:  { text: "오버", color: "#ff8800", glow: "rgba(255,136,0,0.4)" },
  under: { text: "언더", color: "#00aaff", glow: "rgba(0,170,255,0.4)" },
  odd:   { text: "홀",   color: "#cc88ff", glow: "rgba(200,136,255,0.4)" },
  even:  { text: "짝",   color: "#ff44bb", glow: "rgba(255,68,187,0.4)" },
}

function NeonBetDialog({ open, betType, selectedValue, onClose, onConfirm, isLoading, balance }: BetDialogProps) {
  const [selectedChip, setSelectedChip] = useState<number | null>(null)
  const [amount, setAmount] = useState(0)

  useEffect(() => {
    if (open) { setSelectedChip(null); setAmount(0) }
  }, [open])

  const meta = selectedValue ? NEON_LABEL[selectedValue] : null
  if (!open) return null

  const insufficient = balance !== null && amount > balance

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-40" onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto rounded-t-2xl overflow-hidden"
        style={{ background: "#0d1526", borderTop: `1px solid ${meta?.color ?? "#333"}`, boxShadow: `0 -4px 30px ${meta?.glow ?? "rgba(0,255,136,0.15)"}` }}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-full text-sm font-black" style={{ background: `${meta?.color}18`, color: meta?.color, border: `1px solid ${meta?.color}`, boxShadow: `0 0 8px ${meta?.glow}` }}>
              {meta?.text}
            </span>
            <span className="text-sm font-semibold text-white/70">배팅</span>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {balance !== null && (
            <div className="flex items-center justify-between text-xs text-white/40">
              <span>잔고</span>
              <span className="font-semibold tabular-nums text-white/70">₩{balance.toLocaleString()}</span>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-sm text-white/50">배팅 금액</span>
            <div className="flex items-center gap-2">
              <span className="text-xl font-black tabular-nums" style={{ color: insufficient ? "#ff4444" : amount > 0 ? meta?.color : "rgba(255,255,255,0.3)" }}>
                ₩{amount.toLocaleString()}
              </span>
              {amount > 0 && !insufficient && (
                <span className="text-[10px] text-white/40">→ ₩{Math.floor(amount * PAYOUT_RATIO).toLocaleString()} 예상</span>
              )}
              {insufficient && <span className="text-[10px] text-red-400">잔고 부족</span>}
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {CHIPS.map(({ label, value }) => {
              const isActive = selectedChip === value
              return (
                <button
                  key={value}
                  onClick={() => { if (selectedChip === value) { setAmount(p => p + value) } else { setSelectedChip(value); setAmount(value) } }}
                  className="py-2.5 rounded-xl text-xs font-bold border transition-all duration-150 active:scale-95"
                  style={{
                    background: isActive ? `${meta?.color}18` : "rgba(255,255,255,0.06)",
                    borderColor: isActive ? meta?.color ?? "#00ff88" : "rgba(255,255,255,0.1)",
                    color: isActive ? meta?.color : "rgba(255,255,255,0.5)",
                    boxShadow: isActive ? `0 0 8px ${meta?.glow}` : "none",
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>

          <div className="flex gap-2 pb-safe">
            <button
              onClick={() => { setSelectedChip(null); setAmount(0) }}
              className="flex items-center justify-center gap-1 px-4 py-3 rounded-xl border border-white/10 text-white/40 hover:text-white hover:border-white/30 transition-all text-sm"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              초기화
            </button>
            <button
              onClick={() => amount > 0 && !insufficient && onConfirm(amount)}
              disabled={amount <= 0 || isLoading || insufficient}
              className="flex-1 py-3 rounded-xl text-sm font-black transition-all duration-150 active:scale-[0.98] disabled:opacity-30"
              style={{
                background: amount > 0 && !insufficient ? `linear-gradient(135deg, ${meta?.color}dd, ${meta?.color}99)` : "rgba(255,255,255,0.08)",
                color: amount > 0 && !insufficient ? "#000" : "rgba(255,255,255,0.3)",
                boxShadow: amount > 0 && !insufficient ? `0 0 20px ${meta?.glow}` : "none",
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

// ── 결과 시트 ────────────────────────────────────────────────────────────────
function NeonResultSheet({ result, open, onClose }: { result: RoundResult | null; open: boolean; onClose: () => void }) {
  if (!open || !result) return null
  const lastDigit = Math.floor(Math.abs(result.closePrice * 10)) % 10
  const bets = [
    result.direction && { key: result.direction, label: NEON_LABEL[result.direction], won: result.wonDirection, amount: result.directionAmount },
    result.digit && { key: result.digit, label: NEON_LABEL[result.digit], won: result.wonDigit, amount: result.digitAmount },
    result.parity && { key: result.parity, label: NEON_LABEL[result.parity], won: result.wonParity, amount: result.parityAmount },
  ].filter(Boolean) as { key: string; label: { text: string; color: string; glow: string }; won: boolean; amount: number }[]

  const totalBet = bets.reduce((s, b) => s + b.amount, 0)
  const totalPayout = bets.filter(b => b.won).reduce((s, b) => s + Math.floor(b.amount * PAYOUT_RATIO), 0)
  const netProfit = totalPayout - totalBet
  const allWon = bets.every(b => b.won)
  const allLost = bets.every(b => !b.won)
  const resultColor = allWon ? "#00ff88" : allLost ? "#ff4444" : "#ff8800"

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto rounded-t-2xl overflow-hidden" style={{ background: "#0d1526", borderTop: `2px solid ${resultColor}`, boxShadow: `0 -4px 40px ${resultColor}33` }}>
        <div className="px-5 pt-5 pb-4 flex items-center justify-between border-b border-white/10">
          <div>
            <p className="text-[11px] text-white/30 mb-0.5">라운드 #{result.round} · 끝자리 {lastDigit}</p>
            <p className="text-2xl font-black tracking-tight" style={{ color: resultColor, textShadow: `0 0 20px ${resultColor}88` }}>
              {allWon ? "전체 승리!" : allLost ? "전체 패배" : "부분 승리"}
            </p>
          </div>
          <button onClick={onClose} className="text-white/30 hover:text-white p-1.5 rounded-full hover:bg-white/10"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {bets.map((bet) => {
            const payout = bet.won ? Math.floor(bet.amount * PAYOUT_RATIO) : 0
            const net = payout - bet.amount
            return (
              <div key={bet.key} className="flex items-center gap-3 p-3 rounded-xl border" style={{ background: bet.won ? "rgba(0,255,136,0.06)" : "rgba(255,68,68,0.06)", borderColor: bet.won ? "rgba(0,255,136,0.2)" : "rgba(255,68,68,0.2)" }}>
                <span className="text-sm font-black px-2.5 py-1 rounded-lg shrink-0" style={{ color: bet.label.color, background: `${bet.label.color}18`, border: `1px solid ${bet.label.color}`, boxShadow: `0 0 6px ${bet.label.glow}` }}>{bet.label.text}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-white/30">배팅</p>
                  <p className="text-sm font-semibold tabular-nums text-white">₩{bet.amount.toLocaleString()}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] text-white/30 mb-0.5">{bet.won ? "수익" : "손실"}</p>
                  <p className="text-sm font-black tabular-nums" style={{ color: bet.won ? "#00ff88" : "#ff4444" }}>
                    {bet.won ? `+₩${payout.toLocaleString()}` : `-₩${bet.amount.toLocaleString()}`}
                  </p>
                  {bet.won && <p className="text-[9px] text-white/30">순수익 +₩{net.toLocaleString()}</p>}
                </div>
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-black" style={{ background: bet.won ? "#00ff88" : "#ff4444", color: "#000" }}>{bet.won ? "승" : "패"}</div>
              </div>
            )
          })}

          <div className="border-t border-white/10 pt-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-white/30">총 배팅</p>
              <p className="text-sm font-semibold tabular-nums text-white">₩{totalBet.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-white/30">순손익</p>
              <p className="text-lg font-black tabular-nums" style={{ color: netProfit >= 0 ? "#00ff88" : "#ff4444", textShadow: `0 0 12px ${netProfit >= 0 ? "rgba(0,255,136,0.6)" : "rgba(255,68,68,0.6)"}` }}>
                {netProfit >= 0 ? "+" : ""}₩{netProfit.toLocaleString()}
              </p>
            </div>
          </div>

          <button onClick={onClose} className="w-full py-3 rounded-xl border border-white/10 text-white/50 font-semibold text-sm hover:bg-white/5 transition-colors mb-safe">
            확인
          </button>
        </div>
      </div>
    </>
  )
}

// ── 메인 네온 배팅 게임 ─────────────────────────────────────────────────────
export function NeonBettingGame() {
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
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [balance, setBalance] = useState<number | null>(null)
  const [showResultSheet, setShowResultSheet] = useState(false)
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

  const getRoundNumber = useCallback(() => Math.floor(Math.floor(Date.now() / 1000) / 30), [])

  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetch("/api/user/balance", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setBalance(d.balance ?? 0)).catch(() => {})
  }, [])

  useEffect(() => {
    try {
      const raw = localStorage.getItem("game_pending_bet")
      if (!raw) return
      const saved = JSON.parse(raw)
      const currentRound = getRoundNumber()
      if (saved.round !== currentRound) { localStorage.removeItem("game_pending_bet"); return }
      betRef.current = saved.direction; betDigitRef.current = saved.digit; betParityRef.current = saved.parity
      basePriceRef.current = saved.basePrice
      betDirectionAmountRef.current = saved.directionAmount; betDigitAmountRef.current = saved.digitAmount; betParityAmountRef.current = saved.parityAmount
      if (saved.direction) setBetDirection(saved.direction); if (saved.digit) setBetDigit(saved.digit); if (saved.parity) setBetParity(saved.parity)
      setBasePrice(saved.basePrice)
      if (saved.directionAmount) setBetDirectionAmount(saved.directionAmount)
      if (saved.digitAmount) setBetDigitAmount(saved.digitAmount)
      if (saved.parityAmount) setBetParityAmount(saved.parityAmount)
      setPhase("waiting")
    } catch {}
  }, [getRoundNumber])

  useEffect(() => {
    const handler = (e: Event) => { const v = (e as CustomEvent<number>).detail; if (typeof v === "number") setBalance(v) }
    window.addEventListener("balance:update", handler)
    return () => window.removeEventListener("balance:update", handler)
  }, [])

  usePriceWorker({
    onPrice: useCallback((price: number) => { setCurrentPrice(price); currentPriceRef.current = price }, []),
    onClosingPrice: useCallback((price: number, time: number) => { closingPricesRef.current = [...closingPricesRef.current, { time, price }].slice(-100) }, []),
    onInitClosing: useCallback((prices: Array<{ time: number; price: number }>) => { closingPricesRef.current = prices }, []),
  })

  useEffect(() => {
    const tick = setInterval(() => {
      const now = Math.floor(Date.now() / 1000)
      const remaining = 30 - (now % 30)
      setTimeLeft(remaining)
      const round = getRoundNumber()
      setRoundNumber(round)

      if (prevRoundRef.current !== null && round !== prevRoundRef.current) {
        const prices = closingPricesRef.current
        const latestClose = prices.length > 0 ? prices[prices.length - 1].price : currentPriceRef.current
        try { localStorage.removeItem("game_pending_bet") } catch {}

        if ((betRef.current || betDigitRef.current || betParityRef.current) && basePriceRef.current !== null && latestClose !== null) {
          const lastDigit = Math.floor(Math.abs(latestClose * 10)) % 10
          const wonDirection = betRef.current ? (betRef.current === "long" ? latestClose >= basePriceRef.current : latestClose < basePriceRef.current) : false
          const wonDigit = betDigitRef.current ? (betDigitRef.current === "under" ? lastDigit <= 4 : lastDigit >= 5) : false
          const wonParity = betParityRef.current ? (betParityRef.current === "odd" ? lastDigit % 2 !== 0 : lastDigit % 2 === 0) : false

          const token = getToken()
          if (token) {
            fetch("/api/user/game/play", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                basePrice: basePriceRef.current, closePrice: latestClose,
                bets: {
                  direction: betRef.current ?? undefined, directionAmount: betRef.current ? betDirectionAmountRef.current : undefined,
                  digit: betDigitRef.current ?? undefined, digitAmount: betDigitRef.current ? betDigitAmountRef.current : undefined,
                  parity: betParityRef.current ?? undefined, parityAmount: betParityRef.current ? betParityAmountRef.current : undefined,
                },
              }),
            }).then(r => r.json()).then(data => {
              if (typeof data.newBalance === "number") { setBalance(data.newBalance); window.dispatchEvent(new CustomEvent("balance:update", { detail: data.newBalance })) }
            }).catch(() => {})
          }

          const result: RoundResult = {
            round: roundRef.current, direction: betRef.current, digit: betDigitRef.current, parity: betParityRef.current,
            basePrice: basePriceRef.current, closePrice: latestClose, wonDirection, wonDigit, wonParity,
            directionAmount: betDirectionAmountRef.current, digitAmount: betDigitAmountRef.current, parityAmount: betParityAmountRef.current,
          }
          setLastResult(result); setShowResultSheet(true)
          const anyWon = (betRef.current && wonDirection) || (betDigitRef.current && wonDigit) || (betParityRef.current && wonParity)
          const anyLost = (betRef.current && !wonDirection) || (betDigitRef.current && !wonDigit) || (betParityRef.current && !wonParity)
          if (anyWon) setWins(w => w + 1); if (anyLost) setLosses(l => l + 1)
          setPhase("result")
        }

        betRef.current = null; betDigitRef.current = null; betParityRef.current = null
        betDirectionAmountRef.current = 0; betDigitAmountRef.current = 0; betParityAmountRef.current = 0
        setBetDirection(null); setBetDigit(null); setBetParity(null)
        setBetDirectionAmount(0); setBetDigitAmount(0); setBetParityAmount(0)
        setBasePrice(null); basePriceRef.current = null; setDialog(null)
        setTimeout(() => setPhase("betting"), 1500)
      }
      prevRoundRef.current = round; roundRef.current = round
    }, 200)
    return () => clearInterval(tick)
  }, [getRoundNumber])

  const getBase = () => { const p = closingPricesRef.current; return p.length > 0 ? p[p.length - 1].price : currentPriceRef.current }
  const canBet = timeLeft > 15 && phase !== "result"

  const openDialog = (type: BetType, value: string) => {
    if (!canBet) return
    if (type === "direction" && betDirection !== null) return
    if (type === "digit" && betDigit !== null) return
    if (type === "parity" && betParity !== null) return
    setShowResultSheet(false)
    setDialog({ open: true, type, value })
  }

  const handleConfirmBet = async (amount: number) => {
    if (!dialog) return
    setIsPlacingBet(true)
    try {
      const token = getToken()
      if (!token) throw new Error("로그인이 필요합니다")
      const res = await fetch("/api/user/game/bet", {
        method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ betAmount: amount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Bet failed")
      if (typeof data.newBalance === "number") { setBalance(data.newBalance); window.dispatchEvent(new CustomEvent("balance:update", { detail: data.newBalance })) }
      const base = getBase()
      if (!base) throw new Error("No base price")
      if (dialog.type === "direction") { betRef.current = dialog.value as BetDirection; betDirectionAmountRef.current = amount; setBetDirection(dialog.value as BetDirection); setBetDirectionAmount(amount) }
      else if (dialog.type === "digit") { betDigitRef.current = dialog.value as BetDigit; betDigitAmountRef.current = amount; setBetDigit(dialog.value as BetDigit); setBetDigitAmount(amount) }
      else { betParityRef.current = dialog.value as BetParity; betParityAmountRef.current = amount; setBetParity(dialog.value as BetParity); setBetParityAmount(amount) }
      if (!basePriceRef.current) { basePriceRef.current = base; setBasePrice(base) }
      try {
        localStorage.setItem("game_pending_bet", JSON.stringify({
          round: getRoundNumber(), direction: betRef.current, digit: betDigitRef.current, parity: betParityRef.current,
          basePrice: basePriceRef.current, directionAmount: betDirectionAmountRef.current, digitAmount: betDigitAmountRef.current, parityAmount: betParityAmountRef.current,
        }))
      } catch {}
      setPhase("waiting"); setDialog(null)
    } catch (err) { console.error(err) } finally { setIsPlacingBet(false) }
  }

  const priceDiff = currentPrice !== null && basePrice !== null ? currentPrice - basePrice : null
  const isUp = priceDiff !== null && priceDiff >= 0
  const lastDigit = currentPrice !== null ? Math.floor(Math.abs(currentPrice * 10)) % 10 : null

  // 총 배팅 예상 수익
  const totalBet = betDirectionAmount + betDigitAmount + betParityAmount
  const expectedPayout = totalBet > 0 ? Math.floor(totalBet * PAYOUT_RATIO) : 0

  const timerColor = timeLeft > 18 ? "#00ff88" : timeLeft > 15 ? "#ff4444" : timeLeft > 3 ? "#ff8800" : "#ff4444"
  const timerLabel = timeLeft > 18 ? "배팅 가능" : timeLeft > 15 ? "배팅 마감" : timeLeft > 3 ? "게임 중" : "준비 중"

  const fmt = (p: number) => `$${(Math.floor(p * 10) / 10).toFixed(1)}`
  const betAmountFmt = (n: number) => n > 0 ? `₩${n >= 10000 ? `${n / 10000}만` : n.toLocaleString()}` : null

  return (
    <div style={{ background: "#0d1526", minHeight: "100%" }}>
      {/* ── 상단 정보 바 ── */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-start justify-between gap-3">
          {/* 좌: 잔고 + 배팅 + 예상수익 */}
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-white/30 mb-0.5">잔고 BALANCE</p>
            <p className="text-xs font-black tabular-nums text-white leading-none" style={{ fontFamily: "var(--font-orbitron, monospace)" }}>
              {balance !== null ? `${balance.toLocaleString()}원` : "—"}
            </p>
            {totalBet > 0 && (
              <div className="mt-1.5 space-y-0.5">
                <p className="text-xs text-white/50">
                  배팅 <span className="font-bold text-white">{totalBet >= 10000 ? `${totalBet / 10000}만` : totalBet.toLocaleString()}</span>
                </p>
                <p className="text-xs text-white/50">
                  예상 수익{" "}
                  <span className="font-black" style={{ color: "#00ff88", textShadow: "0 0 8px rgba(0,255,136,0.6)" }}>
                    {expectedPayout >= 10000 ? `${(expectedPayout / 10000).toFixed(2)}만` : expectedPayout.toLocaleString()}
                  </span>
                </p>
              </div>
            )}
          </div>

          {/* 중: 원형 타이머 — 카운트다운 + 상태 레이블 */}
          <CircularTimer timeLeft={timeLeft} statusLabel={timerLabel} />

          {/* 우: 실시간 vs 배팅가 */}
          <div className="flex-1 min-w-0 text-right">
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 mb-2" style={{ background: "rgba(255,255,255,0.04)" }}>
              <span className="text-[10px] text-white/30 tabular-nums">--:--</span>
            </div>
            <div>
              <p className="text-[10px] text-white/30 text-right">실시간</p>
              <p className="text-base font-black tabular-nums text-right" style={{ color: "#00ffcc", textShadow: "0 0 8px rgba(0,255,200,0.5)", fontFamily: "var(--font-orbitron, monospace)" }}>
                {currentPrice !== null ? fmt(currentPrice) : "—"}
              </p>
              {basePrice !== null && (
                <>
                  <p className="text-[10px] text-white/20 text-right mt-1.5">마감 기준가</p>
                  <p className="text-sm font-black tabular-nums text-right" style={{ color: "#00ff88", textShadow: "0 0 8px rgba(0,255,136,0.4)", fontFamily: "var(--font-orbitron, monospace)" }}>
                    {fmt(basePrice)}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* 선택 종목 표시등 */}
        {(betDirection || betDigit || betParity) && (
          <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/10">
            {betDirection && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: betDirection === "long" ? "#00ff88" : "#ff4444", boxShadow: `0 0 6px ${betDirection === "long" ? "#00ff88" : "#ff4444"}` }} />
                <span className="text-xs font-bold" style={{ color: betDirection === "long" ? "#00ff88" : "#ff4444" }}>
                  {betDirection === "long" ? "롱" : "숏"} {betAmountFmt(betDirectionAmount)}
                </span>
              </div>
            )}
            {betDigit && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: betDigit === "over" ? "#ff8800" : "#00aaff", boxShadow: `0 0 6px ${betDigit === "over" ? "#ff8800" : "#00aaff"}` }} />
                <span className="text-xs font-bold" style={{ color: betDigit === "over" ? "#ff8800" : "#00aaff" }}>
                  {betDigit === "over" ? "오버" : "언더"} {betAmountFmt(betDigitAmount)}
                </span>
              </div>
            )}
            {betParity && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: betParity === "odd" ? "#cc88ff" : "#ff44bb", boxShadow: `0 0 6px ${betParity === "odd" ? "#cc88ff" : "#ff44bb"}` }} />
                <span className="text-xs font-bold" style={{ color: betParity === "odd" ? "#cc88ff" : "#ff44bb" }}>
                  {betParity === "odd" ? "홀" : "짝"} {betAmountFmt(betParityAmount)}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 배팅 버튼 그리드 ── */}
      <div className="px-4 pb-4">
        {/* 헤더 라벨 */}
        <div className="grid grid-cols-3 gap-2 mb-2">
          {[["롱 / 숏", "#00ff88"], ["언더 / 오버", "#ff8800"], ["홀 / 짝", "#cc88ff"]].map(([label, color]) => (
            <p key={label} className="text-center text-[10px] font-semibold tracking-wide" style={{ color }}>{label}</p>
          ))}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {/* 롱 / 숏 */}
          <div className="flex flex-col gap-2">
            {(["long", "short"] as const).map((dir) => {
              const isSelected = betDirection === dir
              const meta = NEON_LABEL[dir]
              const label = betAmountFmt(betDirectionAmount)
              return (
                <button
                  key={dir}
                  onClick={() => openDialog("direction", dir)}
                  disabled={!canBet || betDirection !== null}
                  className="h-20 rounded-2xl border-2 text-sm font-black flex flex-col items-center justify-center gap-1 transition-all duration-200 active:scale-95 disabled:opacity-40"
                  style={{
                    background: isSelected ? `${meta.color}15` : "rgba(255,255,255,0.04)",
                    borderColor: isSelected ? meta.color : "rgba(255,255,255,0.1)",
                    color: isSelected ? meta.color : "rgba(255,255,255,0.5)",
                    boxShadow: isSelected ? `0 0 20px ${meta.glow}, inset 0 0 20px ${meta.color}08` : "none",
                  }}
                >
                  <div className="flex items-center gap-1">
                    {dir === "long" ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                    <span>{dir === "long" ? "롱" : "숏"}</span>
                  </div>
                  <span className="text-[10px] opacity-60">{dir === "long" ? "직전 대비 상승" : "직전 대비 하락"}</span>
                  {isSelected && label && <span className="text-[9px]">{label}</span>}
                </button>
              )
            })}
          </div>

          {/* 언더 / 오버 */}
          <div className="flex flex-col gap-2">
            {(["under", "over"] as const).map((dig) => {
              const isSelected = betDigit === dig
              const meta = NEON_LABEL[dig]
              const label = betAmountFmt(betDigitAmount)
              return (
                <button
                  key={dig}
                  onClick={() => openDialog("digit", dig)}
                  disabled={!canBet || betDigit !== null}
                  className="h-20 rounded-2xl border-2 text-sm font-black flex flex-col items-center justify-center gap-1 transition-all duration-200 active:scale-95 disabled:opacity-40"
                  style={{
                    background: isSelected ? `${meta.color}15` : "rgba(255,255,255,0.04)",
                    borderColor: isSelected ? meta.color : "rgba(255,255,255,0.1)",
                    color: isSelected ? meta.color : "rgba(255,255,255,0.5)",
                    boxShadow: isSelected ? `0 0 20px ${meta.glow}, inset 0 0 20px ${meta.color}08` : "none",
                  }}
                >
                  <span>{dig === "under" ? "언더" : "오버"}</span>
                  <span className="text-[10px] opacity-60">{dig === "under" ? "0 ~ 4" : "5 ~ 9"}</span>
                  {isSelected && label && <span className="text-[9px]">{label}</span>}
                </button>
              )
            })}
          </div>

          {/* 홀 / 짝 */}
          <div className="flex flex-col gap-2">
            {(["odd", "even"] as const).map((par) => {
              const isSelected = betParity === par
              const meta = NEON_LABEL[par]
              const label = betAmountFmt(betParityAmount)
              return (
                <button
                  key={par}
                  onClick={() => openDialog("parity", par)}
                  disabled={!canBet || betParity !== null}
                  className="h-20 rounded-2xl border-2 text-sm font-black flex flex-col items-center justify-center gap-1 transition-all duration-200 active:scale-95 disabled:opacity-40"
                  style={{
                    background: isSelected ? `${meta.color}15` : "rgba(255,255,255,0.04)",
                    borderColor: isSelected ? meta.color : "rgba(255,255,255,0.1)",
                    color: isSelected ? meta.color : "rgba(255,255,255,0.5)",
                    boxShadow: isSelected ? `0 0 20px ${meta.glow}, inset 0 0 20px ${meta.color}08` : "none",
                  }}
                >
                  <span>{par === "odd" ? "홀" : "짝"}</span>
                  <span className="text-[10px] opacity-60">{par === "odd" ? "1·3·5·7·9" : "0·2·4·6·8"}</span>
                  {isSelected && label && <span className="text-[9px]">{label}</span>}
                </button>
              )
            })}
          </div>
        </div>

        {/* 안내 + 승패 */}
        <div className="flex items-center justify-between mt-3">
          <p className="text-[10px] text-white/25">
            {canBet && !betDirection && !betDigit && !betParity && "종목을 눌러 배팅하세요"}
            {canBet && (betDirection || betDigit || betParity) && "다른 종목 추가 배팅 가능"}
            {!canBet && phase !== "result" && (timeLeft > 3 ? "게임 중 — 배팅 불가" : "다음 게임까지 3초 전")}
            {phase === "result" && "새 라운드 준비 중..."}
          </p>
          <span className="text-[10px] text-white/30">
            <span className="text-green-400 font-bold">{wins}승</span>
            {" / "}
            <span className="text-red-400 font-bold">{losses}패</span>
          </span>
        </div>
      </div>

      {dialog && (
        <NeonBetDialog
          open={dialog.open} betType={dialog.type} selectedValue={dialog.value}
          onClose={() => setDialog(null)} onConfirm={handleConfirmBet}
          isLoading={isPlacingBet} balance={balance}
        />
      )}
      <NeonResultSheet result={lastResult} open={showResultSheet} onClose={() => setShowResultSheet(false)} />
    </div>
  )
}
