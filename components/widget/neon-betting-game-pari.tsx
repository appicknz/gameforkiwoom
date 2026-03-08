"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { TrendingUp, TrendingDown, X, RotateCcw } from "lucide-react"

// ── 타입 ──────────────────────────────────────────────────────────────────────
type BetDirection = "long" | "short" | null
type BetDigit    = "under" | "over" | null
type BetParity   = "odd"   | "even" | null
type BetType     = "direction" | "digit" | "parity"

interface PoolState {
  sideA: number; sideB: number
  lpA: number;   lpB: number
  totalA: number; totalB: number
  oddsA: number | null  // null = 사용자 배팅 없음 → "—" 표시
  oddsB: number | null
}

interface Pools {
  long_short:  PoolState
  under_over:  PoolState
  odd_even:    PoolState
}

interface RoundResult {
  round: number
  direction: BetDirection; digit: BetDigit; parity: BetParity
  basePrice: number; closePrice: number
  wonDirection: boolean; wonDigit: boolean; wonParity: boolean
  directionAmount: number; digitAmount: number; parityAmount: number
  directOdds: number; digitOdds: number; parityOdds: number
}

const CHIPS = [
  { label: "1만",   value: 10_000 },
  { label: "5만",   value: 50_000 },
  { label: "10만",  value: 100_000 },
  { label: "50만",  value: 500_000 },
  { label: "100만", value: 1_000_000 },
]

function getToken(): string | null {
  if (typeof window === "undefined") return null
  try { return localStorage.getItem("app_token") } catch { return null }
}

// ── 원형 타이머 (NeonBettingGame과 동일) ─────────────────────────────────────
function CircularTimer({ timeLeft, statusLabel }: { timeLeft: number; statusLabel: string }) {
  const r = 44
  const circ = 2 * Math.PI * r
  const progress = (timeLeft / 30) * circ
  const color = timeLeft > 18 ? "#00ff88" : timeLeft > 15 ? "#ff4444" : timeLeft > 3 ? "#ff8800" : "#ff4444"

  return (
    <div className="relative flex items-center justify-center" style={{ width: 110, height: 110 }}>
      <svg width="110" height="110" style={{ transform: "rotate(-90deg)", position: "absolute" }}>
        <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <circle cx="55" cy="55" r={r} fill="none" stroke={color} strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${progress} ${circ}`}
          style={{ transition: "stroke-dasharray 0.2s linear, stroke 0.3s", filter: `drop-shadow(0 0 6px ${color})` }}
        />
      </svg>
      <div className="flex flex-col items-center z-10">
        <span className="font-black text-3xl leading-none tabular-nums" style={{ color, fontFamily: "var(--font-orbitron, monospace)" }}>
          {timeLeft}
        </span>
        <span className="text-[8px] font-semibold mt-0.5 tracking-tight" style={{ color }}>{statusLabel}</span>
      </div>
    </div>
  )
}

// ── 네온 라벨 맵 ──────────────────────────────────────────────────────────────
const NEON_LABEL: Record<string, { text: string; color: string; glow: string }> = {
  long:  { text: "롱",   color: "#00ff88", glow: "rgba(0,255,136,0.4)" },
  short: { text: "숏",   color: "#ff4444", glow: "rgba(255,68,68,0.4)" },
  over:  { text: "오버", color: "#ff8800", glow: "rgba(255,136,0,0.4)" },
  under: { text: "언더", color: "#00aaff", glow: "rgba(0,170,255,0.4)" },
  odd:   { text: "홀",   color: "#cc88ff", glow: "rgba(200,136,255,0.4)" },
  even:  { text: "짝",   color: "#ff44bb", glow: "rgba(255,68,187,0.4)" },
}

// ── 배팅 다이얼로그 ───────────────────────────────────────────────────────────
interface BetDialogProps {
  open: boolean; betType: BetType | null; selectedValue: string | null
  onClose: () => void; onConfirm: (amount: number) => void
  isLoading: boolean; balance: number | null; odds: number | null
}

function NeonBetDialog({ open, betType, selectedValue, onClose, onConfirm, isLoading, balance, odds }: BetDialogProps) {
  const [selectedChip, setSelectedChip] = useState<number | null>(null)
  const [amount, setAmount] = useState(0)

  useEffect(() => { if (open) { setSelectedChip(null); setAmount(0) } }, [open])

  const meta = selectedValue ? NEON_LABEL[selectedValue] : null
  if (!open) return null
  const insufficient = balance !== null && amount > balance

  return (
    <>
      <div className="fixed inset-0 bg-black/70 z-40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto rounded-t-2xl overflow-hidden"
        style={{ background: "#0d1526", borderTop: `1px solid ${meta?.color ?? "#333"}`, boxShadow: `0 -4px 30px ${meta?.glow ?? "rgba(0,255,136,0.15)"}` }}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            {meta && (
              <span className="text-lg font-black" style={{ color: meta.color }}>{meta.text}</span>
            )}
            <span className="text-sm text-white/50">배팅 금액 선택</span>
            {/* 예상 배당 — 배팅 후 odds가 확정된 경우에만 표시 */}
            {amount > 0 && odds != null && (
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "rgba(255,255,255,0.08)", color: meta?.color ?? "#fff" }}>
                예상 {Math.floor(amount * odds).toLocaleString()}원 (x{odds.toFixed(2)})
              </span>
            )}
            {amount > 0 && odds == null && (
              <span className="text-xs px-2 py-0.5 rounded-full font-bold" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
                배팅 후 배율 확정
              </span>
            )}
          </div>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-white/10">
            <X className="w-4 h-4 text-white/50" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex gap-2 flex-wrap">
            {CHIPS.map(chip => (
              <button key={chip.value}
                onClick={() => { setSelectedChip(chip.value); setAmount(a => a + chip.value) }}
                className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                style={{
                  background: selectedChip === chip.value ? meta?.color : "rgba(255,255,255,0.06)",
                  color: selectedChip === chip.value ? "#000" : "rgba(255,255,255,0.7)",
                  border: `1px solid ${selectedChip === chip.value ? meta?.color ?? "#333" : "rgba(255,255,255,0.1)"}`,
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-center">
            <div className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold tabular-nums"
              style={{ background: "rgba(255,255,255,0.06)", color: "white", border: "1px solid rgba(255,255,255,0.1)" }}>
              {amount > 0 ? `₩${amount.toLocaleString()}` : "금액을 선택하세요"}
            </div>
            <button onClick={() => { setAmount(0); setSelectedChip(null) }}
              className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/10"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)" }}>
              <RotateCcw className="w-4 h-4 text-white/50" />
            </button>
          </div>
          {insufficient && <p className="text-xs text-red-400">잔고가 부족합니다.</p>}
          <button
            onClick={() => amount > 0 && !insufficient && onConfirm(amount)}
            disabled={amount <= 0 || isLoading || insufficient}
            className="w-full py-3.5 rounded-xl font-bold text-sm transition-all disabled:opacity-40"
            style={{ background: meta?.color ?? "#00ff88", color: "#000" }}
          >
            {isLoading ? "처리 중..." : `₩${amount.toLocaleString()} 배팅`}
          </button>
        </div>
      </div>
    </>
  )
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────
interface NeonBettingGamePariProps {
  branchId: string // 파리뮤추얼 지점 ID (필수)
}

export function NeonBettingGamePari({ branchId }: NeonBettingGamePariProps) {
  const [currentPrice, setCurrentPrice]   = useState<number | null>(null)
  const [basePrice, setBasePrice]         = useState<number | null>(null)
  const [timeLeft, setTimeLeft]           = useState(30)
  const [roundTime, setRoundTime]         = useState(0)
  const [balance, setBalance]             = useState<number | null>(null)
  const [pools, setPools]                 = useState<Pools | null>(null)

  const [betDirection, setBetDirection]   = useState<BetDirection>(null)
  const [betDigit, setBetDigit]           = useState<BetDigit>(null)
  const [betParity, setBetParity]         = useState<BetParity>(null)
  const [betDirectionAmt, setBetDirectionAmt] = useState(0)
  const [betDigitAmt, setBetDigitAmt]     = useState(0)
  const [betParityAmt, setBetParityAmt]   = useState(0)

  // 선택된 배당 — null이면 배팅 전 미확정 상태
  const [selectedOdds, setSelectedOdds]   = useState<number | null>(null)

  const [dialogOpen, setDialogOpen]       = useState(false)
  const [dialogType, setDialogType]       = useState<BetType | null>(null)
  const [dialogValue, setDialogValue]     = useState<string | null>(null)
  const [betLoading, setBetLoading]       = useState(false)
  const [results, setResults]             = useState<RoundResult[]>([])

  const currentPriceRef   = useRef<number>(0)
  const closingPricesRef  = useRef<Array<{ time: number; price: number }>>([])
  const betDirectionRef   = useRef<BetDirection>(null)
  const betDigitRef       = useRef<BetDigit>(null)
  const betParityRef      = useRef<BetParity>(null)
  const betDirAmtRef      = useRef(0)
  const betDigitAmtRef    = useRef(0)
  const betParityAmtRef   = useRef(0)
  const basePriceRef      = useRef<number | null>(null)
  const roundRef          = useRef(0)
  const poolsRef          = useRef<Pools | null>(null)
  const settledRef        = useRef(false)
  // 배팅 확정 시 API에서 받은 배율 (balance_lp 조정 반영)
  const dirOddsRef        = useRef<number>(1.95)
  const digOddsRef        = useRef<number>(1.95)
  const parOddsRef        = useRef<number>(1.95)

  // ── window 가격 구독 (GameChart의 usePriceWorker 단일 소스) ──────────────
  useEffect(() => {
    const win = window as any
    const tick = setInterval(() => {
      const price: number | undefined = win.__bitcoinCurrentPrice
      if (price) { setCurrentPrice(price); currentPriceRef.current = price }

      const closing: Array<{ time: number; price: number }> = win.__bitcoinClosingPrices ?? []
      if (closing.length > 0) {
        closingPricesRef.current = closing
        if (!betDirectionRef.current && !betDigitRef.current && !betParityRef.current) {
          const latest = closing[closing.length - 1].price
          setBasePrice(latest); basePriceRef.current = latest
        }
      }
    }, 300)
    return () => clearInterval(tick)
  }, [])

  // ── 잔고 로드 + SSE balance:update 이벤트 구독 (NeonBettingGame과 동일) ──
  const loadBalance = useCallback(async () => {
    const token = getToken()
    if (!token) return
    const res = await fetch("/api/user/balance", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setBalance(d.balance ?? 0) }
  }, [])

  useEffect(() => { loadBalance() }, [loadBalance])

  // balance/stream SSE가 window에 balance:update 커스텀 이벤트를 발행
  // → NeonBettingGame과 동일하게 구독해서 실시간 잔고 반영
  useEffect(() => {
    const handler = (e: Event) => {
      const v = (e as CustomEvent<number>).detail
      if (typeof v === "number") setBalance(v)
    }
    window.addEventListener("balance:update", handler)
    return () => window.removeEventListener("balance:update", handler)
  }, [])

  // ── 풀 폴링 (500ms) — 배당률 실시간 반영 ────────────────────────────────
  useEffect(() => {
    if (!branchId || !roundTime) return
    const poll = async () => {
      const res = await fetch(`/api/pari/pool?branchId=${branchId}&roundTime=${roundTime}`)
      if (res.ok) {
        const d = await res.json()
        if (d.pools) { setPools(d.pools); poolsRef.current = d.pools }
      }
    }
    poll()
    const iv = setInterval(poll, 500)
    return () => clearInterval(iv)
  }, [branchId, roundTime])

  // ── 카운트다운 + 라운드 타이머 ─────────────────────────────────────────
  useEffect(() => {
    const tick = setInterval(() => {
      const now  = Math.floor(Date.now() / 1000)
      const bucket = now - (now % 30)
      const tl = 30 - (now % 30)

      if (bucket !== roundRef.current) {
        // 새 라운드 — 이전 라운드 정산
        if (roundRef.current && !settledRef.current) {
          settledRef.current = true
          handleSettle(bucket)
        }
        roundRef.current = bucket
        settledRef.current = false
        setRoundTime(bucket)
      }
      setTimeLeft(tl)
    }, 500)
    return () => clearInterval(tick)
  }, [])

  // ── 정산 ─────────────────────────────────────────────────────────────────
  const handleSettle = useCallback(async (newBucket: number) => {
    const token = getToken()
    const closing = closingPricesRef.current
    const base = basePriceRef.current

    const hasBet = betDirAmtRef.current > 0 || betDigitAmtRef.current > 0 || betParityAmtRef.current > 0
    if (!hasBet || !token || !base || closing.length === 0) {
      // 배팅 없으면 상태만 초기화
      setBetDirection(null); betDirectionRef.current = null; setBetDirectionAmt(0); betDirAmtRef.current = 0
      setBetDigit(null);     betDigitRef.current = null;     setBetDigitAmt(0);     betDigitAmtRef.current = 0
      setBetParity(null);    betParityRef.current = null;    setBetParityAmt(0);    betParityAmtRef.current = 0
      return
    }

    const closePrice = closing[closing.length - 1].price
    const lastDigit  = Math.floor(closePrice) % 10

    const wonDirection = betDirectionRef.current
      ? (betDirectionRef.current === "long" ? closePrice > base : closePrice < base) : false
    const wonDigit  = betDigitRef.current
      ? (betDigitRef.current === "under" ? lastDigit <= 4 : lastDigit >= 5) : false
    const wonParity = betParityRef.current
      ? (betParityRef.current === "odd" ? lastDigit % 2 !== 0 : lastDigit % 2 === 0) : false

    // 배팅 시 확정된 배율 사용 (balance_lp 조정 후 API 반환값)
    const dOdds  = dirOddsRef.current
    const diOdds = digOddsRef.current
    const paOdds = parOddsRef.current

    try {
      await fetch("/api/pari/play", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          branchId,
          roundTime: roundRef.current,
          closePrice,
          lastDigit,
          betDirection: betDirectionRef.current,
          betDigit: betDigitRef.current,
          betParity: betParityRef.current,
          directionAmount: betDirAmtRef.current,
          digitAmount: betDigitAmtRef.current,
          parityAmount: betParityAmtRef.current,
        }),
      })
    } catch { /* 정산 실패해도 UI ���속 진행 */ }

    setResults(prev => [{
      round: roundRef.current,
      direction: betDirectionRef.current, digit: betDigitRef.current, parity: betParityRef.current,
      basePrice: base, closePrice,
      wonDirection, wonDigit, wonParity,
      directionAmount: betDirAmtRef.current, digitAmount: betDigitAmtRef.current, parityAmount: betParityAmtRef.current,
      directOdds: dOdds, digitOdds: diOdds, parityOdds: paOdds,
    }, ...prev].slice(0, 5))

    // 상태 + 확정 배율 초기화
    setBetDirection(null); betDirectionRef.current = null; setBetDirectionAmt(0); betDirAmtRef.current = 0
    setBetDigit(null);     betDigitRef.current = null;     setBetDigitAmt(0);     betDigitAmtRef.current = 0
    setBetParity(null);    betParityRef.current = null;    setBetParityAmt(0);    betParityAmtRef.current = 0
    dirOddsRef.current = 1.95; digOddsRef.current = 1.95; parOddsRef.current = 1.95
    setBasePrice(null)
    loadBalance()
  }, [branchId, loadBalance])

  // ── 배팅 처리 ─────────────────────────────────────────────────────────────
  const openDialog = (type: BetType, value: string, odds: number) => {
    setDialogType(type); setDialogValue(value); setSelectedOdds(odds); setDialogOpen(true)
  }

  const handleBetConfirm = async (amount: number) => {
    if (!dialogType || !dialogValue) return
    setBetLoading(true)
    const token = getToken()
    if (!token) { setBetLoading(false); return }

    const poolTypeMap: Record<BetType, string> = { direction: "long_short", digit: "under_over", parity: "odd_even" }
    const sideMap: Record<string, string> = { long: "a", under: "a", odd: "a", short: "b", over: "b", even: "b" }

    const res = await fetch("/api/pari/bet", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        branchId,
        roundTime,
        betAmount: amount,
        poolType: poolTypeMap[dialogType],
        side: sideMap[dialogValue],
      }),
    })

    if (res.ok) {
      const data = await res.json()
      setBalance(data.newBalance)
      // API가 balance_lp 조정 후 확정 배율 반환 → 결과 정산에 사용
      const confirmedOdds: number = data.odds ?? 1.95

      if (dialogType === "direction") {
        setBetDirection(dialogValue as BetDirection); betDirectionRef.current = dialogValue as BetDirection
        setBetDirectionAmt(a => a + amount);          betDirAmtRef.current += amount
        dirOddsRef.current = confirmedOdds
        if (!basePriceRef.current && currentPriceRef.current) {
          const bp = currentPriceRef.current; setBasePrice(bp); basePriceRef.current = bp
        }
      } else if (dialogType === "digit") {
        setBetDigit(dialogValue as BetDigit); betDigitRef.current = dialogValue as BetDigit
        setBetDigitAmt(a => a + amount);      betDigitAmtRef.current += amount
        digOddsRef.current = confirmedOdds
      } else {
        setBetParity(dialogValue as BetParity); betParityRef.current = dialogValue as BetParity
        setBetParityAmt(a => a + amount);       betParityAmtRef.current += amount
        parOddsRef.current = confirmedOdds
      }
    }
    setDialogOpen(false); setBetLoading(false)
  }

  // ── 유틸 ─────────────────────────────────────────────────────────────────
  const canBet  = timeLeft > 3 && timeLeft <= 30
  const statusLabel = !canBet ? "마감" : timeLeft > 18 ? "배팅 가능" : "마감 임박"
  const fmt = (n: number | null) => n == null ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
  // null = 배팅 전 → "—" 표시 (파리뮤추얼 핵심: 배팅 전 배당 미공개)
  const fmtOdds = (n: number | null) => n == null ? "—" : `x${n.toFixed(2)}`

  const getPoolOdds = (poolType: "long_short" | "under_over" | "odd_even", side: "a" | "b"): number | null => {
    if (!pools) return null
    return side === "a" ? pools[poolType].oddsA : pools[poolType].oddsB
  }

  return (
    <div className="p-4" style={{ background: "#0d1526" }}>
      {/* 다이얼로그 */}
      <NeonBetDialog
        open={dialogOpen} betType={dialogType} selectedValue={dialogValue}
        onClose={() => setDialogOpen(false)} onConfirm={handleBetConfirm}
        isLoading={betLoading} balance={balance} odds={selectedOdds}
      />

      {/* 상단: 현재가 + 타이머 + 배팅 기준가 */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-[10px] font-semibold tracking-widest uppercase mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>실시간</p>
          <p className="text-2xl font-black tabular-nums" style={{ color: "#00ffcc", fontFamily: "var(--font-orbitron, monospace)" }}>
            {fmt(currentPrice)}
          </p>
          {balance !== null && (
            <p className="text-[10px] mt-1" style={{ color: "rgba(255,255,255,0.35)" }}>잔고 ₩{balance.toLocaleString()}</p>
          )}
        </div>
        <CircularTimer timeLeft={timeLeft} statusLabel={statusLabel} />
        <div className="text-right">
          <p className="text-[10px] font-semibold tracking-widest uppercase mb-1" style={{ color: "rgba(255,255,255,0.3)" }}>배팅 기준가</p>
          <p className="text-2xl font-black tabular-nums" style={{ color: "#00ffcc", fontFamily: "var(--font-orbitron, monospace)" }}>
            {fmt(basePrice)}
          </p>
          <p className="text-[10px] mt-1 font-bold" style={{ color: "#a78bfa" }}>파리뮤추얼</p>
        </div>
      </div>

      {/* 배당률 헤더 — 동적 */}
      <div className="grid grid-cols-3 gap-2 mb-2">
        {([ 
          { color: "#00ff88", oddsA: getPoolOdds("long_short", "a"), oddsB: getPoolOdds("long_short", "b") },
          { color: "#ff8800", oddsA: getPoolOdds("under_over", "a"), oddsB: getPoolOdds("under_over", "b") },
          { color: "#cc88ff", oddsA: getPoolOdds("odd_even",   "a"), oddsB: getPoolOdds("odd_even",   "b") },
        ] as const).map(({ color, oddsA, oddsB }, i) => (
          <div key={i} className="flex flex-col items-center gap-0">
            <p className="text-[11px] font-black tabular-nums" style={{ color }}>
              {fmtOdds(oddsA)} / {fmtOdds(oddsB)}
            </p>
            <p className="text-[9px]" style={{ color: "rgba(255,255,255,0.25)" }}>
              {i === 0 ? "롱/숏" : i === 1 ? "언더/오버" : "홀/짝"}
            </p>
          </div>
        ))}
      </div>

      {/* 배팅 카드 */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {/* 롱/숏 */}
        {([ 
          { value: "long",  type: "direction" as BetType, label: "롱",  subLabel: "직전 대비 상승", Icon: TrendingUp,   odds: getPoolOdds("long_short", "a") },
          { value: "under", type: "digit"     as BetType, label: "언더", subLabel: "0 ~ 4",          Icon: TrendingDown, odds: getPoolOdds("under_over", "a") },
          { value: "odd",   type: "parity"    as BetType, label: "홀",  subLabel: "1·3·5·7·9",      Icon: null,         odds: getPoolOdds("odd_even",   "a") },
        ] as const).map(({ value, type, label, subLabel, Icon, odds }) => {
          const meta = NEON_LABEL[value]
          const activeBet = type === "direction" ? betDirection : type === "digit" ? betDigit : betParity
          const activeBetAmt = type === "direction" ? betDirectionAmt : type === "digit" ? betDigitAmt : betParityAmt
          const isActive = activeBet === value
          return (
            <button key={value} disabled={!canBet}
              onClick={() => openDialog(type, value, odds)}
              className="flex flex-col items-center justify-center py-4 px-2 rounded-2xl transition-all active:scale-95 disabled:opacity-40"
              style={{
                background: isActive ? `${meta.color}18` : "rgba(255,255,255,0.04)",
                border: `1px solid ${isActive ? meta.color : "rgba(255,255,255,0.08)"}`,
                boxShadow: isActive ? `0 0 16px ${meta.glow}` : "none",
              }}
            >
              {Icon && <Icon className="w-5 h-5 mb-1.5" style={{ color: meta.color }} />}
              <span className="text-sm font-black" style={{ color: meta.color }}>{label}</span>
              <span className="text-[9px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{subLabel}</span>
              {isActive && activeBetAmt > 0 && (
                <span className="text-[9px] mt-1 font-bold" style={{ color: meta.color }}>₩{activeBetAmt.toLocaleString()}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* 숏/오버/짝 카드 */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {([
          { value: "short", type: "direction" as BetType, label: "숏",  subLabel: "직전 대비 하락", Icon: TrendingDown, odds: getPoolOdds("long_short", "b") },
          { value: "over",  type: "digit"     as BetType, label: "오버", subLabel: "5 ~ 9",          Icon: TrendingUp,   odds: getPoolOdds("under_over", "b") },
          { value: "even",  type: "parity"    as BetType, label: "짝",  subLabel: "0·2·4·6·8",      Icon: null,         odds: getPoolOdds("odd_even",   "b") },
        ] as const).map(({ value, type, label, subLabel, Icon, odds }) => {
          const meta = NEON_LABEL[value]
          const activeBet = type === "direction" ? betDirection : type === "digit" ? betDigit : betParity
          const activeBetAmt = type === "direction" ? betDirectionAmt : type === "digit" ? betDigitAmt : betParityAmt
          const isActive = activeBet === value
          return (
            <button key={value} disabled={!canBet}
              onClick={() => openDialog(type, value, odds)}
              className="flex flex-col items-center justify-center py-4 px-2 rounded-2xl transition-all active:scale-95 disabled:opacity-40"
              style={{
                background: isActive ? `${meta.color}18` : "rgba(255,255,255,0.04)",
                border: `1px solid ${isActive ? meta.color : "rgba(255,255,255,0.08)"}`,
                boxShadow: isActive ? `0 0 16px ${meta.glow}` : "none",
              }}
            >
              {Icon && <Icon className="w-5 h-5 mb-1.5" style={{ color: meta.color }} />}
              <span className="text-sm font-black" style={{ color: meta.color }}>{label}</span>
              <span className="text-[9px] mt-0.5" style={{ color: "rgba(255,255,255,0.35)" }}>{subLabel}</span>
              {isActive && activeBetAmt > 0 && (
                <span className="text-[9px] mt-1 font-bold" style={{ color: meta.color }}>₩{activeBetAmt.toLocaleString()}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* 풀 현황 바 (파리뮤추얼 특화 UI) */}
      {pools && (
        <div className="space-y-2 mb-4 p-3 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
          <p className="text-[9px] font-semibold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.25)" }}>풀 현황</p>
          {([
            { key: "long_short" as const,  labelA: "롱",   labelB: "숏",   colorA: "#00ff88", colorB: "#ff4444" },
            { key: "under_over" as const,  labelA: "언더", labelB: "오버", colorA: "#00aaff", colorB: "#ff8800" },
            { key: "odd_even"   as const,  labelA: "홀",   labelB: "짝",   colorA: "#cc88ff", colorB: "#ff44bb" },
          ]).map(({ key, labelA, labelB, colorA, colorB }) => {
            const pool = pools[key]
            const total = pool.totalA + pool.totalB
            const pctA = total > 0 ? (pool.totalA / total) * 100 : 50
            return (
              <div key={key}>
                <div className="flex justify-between text-[9px] mb-0.5" style={{ color: "rgba(255,255,255,0.3)" }}>
                  <span style={{ color: colorA }}>{labelA} {fmtOdds(pool.oddsA)} · ₩{Math.floor(pool.totalA).toLocaleString()}</span>
                  <span style={{ color: colorB }}>₩{Math.floor(pool.totalB).toLocaleString()} · {fmtOdds(pool.oddsB)} {labelB}</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pctA}%`, background: `linear-gradient(to right, ${colorA}, ${colorB})` }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* 최근 결과 카드 (/widget NeonBettingGame과 동일 형식) */}
      {results.length > 0 && (
        <div className="space-y-2 mt-2">
          <p className="text-[9px] font-semibold tracking-widest uppercase px-1" style={{ color: "rgba(255,255,255,0.25)" }}>최근 결과</p>
          {results.map((r, i) => {
            const totalNet =
              (r.directionAmount > 0 ? (r.wonDirection ? Math.floor(r.directionAmount * r.directOdds) - r.directionAmount : -r.directionAmount) : 0) +
              (r.digitAmount > 0     ? (r.wonDigit     ? Math.floor(r.digitAmount     * r.digitOdds)  - r.digitAmount     : -r.digitAmount)     : 0) +
              (r.parityAmount > 0    ? (r.wonParity    ? Math.floor(r.parityAmount    * r.parityOdds) - r.parityAmount    : -r.parityAmount)    : 0)
            const isWin = totalNet > 0
            const cardBg = isWin ? "rgba(0,255,136,0.06)" : "rgba(255,68,68,0.06)"
            const cardBorder = isWin ? "rgba(0,255,136,0.2)" : "rgba(255,68,68,0.2)"
            const netColor = isWin ? "#00ff88" : "#ff4444"
            return (
              <div key={i} className="rounded-2xl p-3" style={{ background: cardBg, border: `1px solid ${cardBorder}` }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[9px]" style={{ color: "rgba(255,255,255,0.3)" }}>
                    {new Date(r.round * 1000).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </span>
                  <span className="text-xs font-black" style={{ color: netColor }}>
                    {isWin ? `+${totalNet.toLocaleString()}` : `${totalNet.toLocaleString()}`}원
                  </span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {r.directionAmount > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                      style={{ background: r.wonDirection ? "rgba(0,255,136,0.15)" : "rgba(255,68,68,0.15)", color: r.wonDirection ? "#00ff88" : "#ff4444" }}>
                      {r.direction === "long" ? "롱" : "숏"} x{r.directOdds.toFixed(2)} {r.wonDirection ? "적중" : "미적중"}
                    </span>
                  )}
                  {r.digitAmount > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                      style={{ background: r.wonDigit ? "rgba(0,170,255,0.15)" : "rgba(255,68,68,0.15)", color: r.wonDigit ? "#00aaff" : "#ff4444" }}>
                      {r.digit === "under" ? "언더" : "오버"} x{r.digitOdds.toFixed(2)} {r.wonDigit ? "적중" : "미적중"}
                    </span>
                  )}
                  {r.parityAmount > 0 && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                      style={{ background: r.wonParity ? "rgba(200,136,255,0.15)" : "rgba(255,68,68,0.15)", color: r.wonParity ? "#cc88ff" : "#ff4444" }}>
                      {r.parity === "odd" ? "홀" : "짝"} x{r.parityOdds.toFixed(2)} {r.wonParity ? "적중" : "미적중"}
                    </span>
                  )}
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.4)" }}>
                    마감가 ${r.closePrice.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
                {r.digitAmount > 0 && (
                  <span style={{ color: r.wonDigit ? "#00ff88" : "#ff4444" }}>
                    {r.wonDigit ? `+${Math.floor(r.digitAmount * r.digitOdds - r.digitAmount).toLocaleString()}` : `-${r.digitAmount.toLocaleString()}`}
                  </span>
                )}
                {r.parityAmount > 0 && (
                  <span style={{ color: r.wonParity ? "#00ff88" : "#ff4444" }}>
                    {r.wonParity ? `+${Math.floor(r.parityAmount * r.parityOdds - r.parityAmount).toLocaleString()}` : `-${r.parityAmount.toLocaleString()}`}
                  </span>
                )}
              </div>
              <span style={{ color: "rgba(255,255,255,0.3)" }}>{r.closePrice.toFixed(1)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
