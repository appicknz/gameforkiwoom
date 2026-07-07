"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { X, RotateCcw, Lock, Unlock, Bot, ChevronDown, ChevronUp } from "lucide-react"
import { usePriceWorker } from "@/hooks/use-price-worker"
import { useGatewayOdds } from "@/hooks/use-gateway"
import { calcRaceOdds } from "@/lib/lp-system"

// ─── 타입 ──────────────────────────────────────────────────────────────────
type BetDirection = "long" | "short" | null
type BetDigit = "under" | "over" | null
type BetParity = "odd" | "even" | null
type BetRace = "bit" | "coin" | "tie" | null
type BetType = "direction" | "digit" | "parity" | "race"

interface RoundResult {
  round: number
  direction: BetDirection
  digit: BetDigit
  parity: BetParity
  race: BetRace
  raceResult: "bit" | "coin" | "tie" | null
  basePrice: number
  closePrice: number
  wonDirection: boolean
  wonDigit: boolean
  wonParity: boolean
  wonRace: boolean
  raceOdds: number | null  // 서버 확정 배당 (settle-me 응답 appliedOdds)
  directionAmount: number
  digitAmount: number
  parityAmount: number
  raceAmount: number
  bitScore: number
  coinScore: number
}

// ─── 상수 ──────────────────────────────────────────────────────────────────
const CHIPS = [
  { label: "1만", value: 10_000 },
  { label: "5만", value: 50_000 },
  { label: "10만", value: 100_000 },
  { label: "50만", value: 500_000 },
  { label: "100만", value: 1_000_000 },
]
const PAYOUT_RATIO = 1.95

// ─── 색상 테마 ─────────────────────────────────────────────────────────────
const G = {
  gold: "#d4af37",
  goldDim: "rgba(212,175,55,0.6)",
  goldFaint: "rgba(212,175,55,0.12)",
  goldBorder: "rgba(212,175,55,0.25)",
  bg: "#09080a",
  bgCard: "rgba(18,16,10,0.95)",
  bgMuted: "rgba(212,175,55,0.06)",
  text: "rgba(232,213,163,0.85)",
  textDim: "rgba(232,213,163,0.4)",
}

const BIT_COLOR = "#3b82f6"
const BIT_BG = "rgba(59,130,246,0.85)"
const BIT_DIM_BG = "rgba(59,130,246,0.15)"
const BIT_DIM_BORDER = "rgba(59,130,246,0.4)"

const COIN_COLOR = "#f97316"
const COIN_BG = "rgba(249,115,22,0.85)"
const COIN_DIM_BG = "rgba(249,115,22,0.15)"
const COIN_DIM_BORDER = "rgba(249,115,22,0.4)"

const LABEL_MAP: Record<string, { text: string; color: string; bg: string; border: string }> = {
  long:  { text: "롱",   color: "#10b981", bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.4)" },
  short: { text: "숏",   color: "#ef4444", bg: "rgba(239,68,68,0.15)",  border: "rgba(239,68,68,0.4)" },
  over:  { text: "오버", color: "#f97316", bg: "rgba(249,115,22,0.15)", border: "rgba(249,115,22,0.4)" },
  under: { text: "언더", color: "#60a5fa", bg: "rgba(96,165,250,0.15)", border: "rgba(96,165,250,0.4)" },
  odd:   { text: "홀",   color: "#a78bfa", bg: "rgba(167,139,250,0.15)",border: "rgba(167,139,250,0.4)" },
  even:  { text: "짝",   color: "#ec4899", bg: "rgba(236,72,153,0.15)", border: "rgba(236,72,153,0.4)" },
  bit:   { text: "BIT팀", color: BIT_COLOR, bg: "rgba(59,130,246,0.15)",  border: "rgba(59,130,246,0.4)" },
  coin:  { text: "COIN팀",color: COIN_COLOR,bg: "rgba(249,115,22,0.15)", border: "rgba(249,115,22,0.4)" },
  tie:   { text: "TIE",  color: "#22c55e", bg: "rgba(34,197,94,0.15)",  border: "rgba(34,197,94,0.4)" },
}

function getToken(): string | null {
  if (typeof window === "undefined") return null
  try { return localStorage.getItem("app_token") } catch { return null }
}

// ─── 자동 배팅 설정 ────────────────────────────────────────────────────────
interface AutoBetConfig {
  enabled: boolean
  direction: "long" | "short" | "random" | null
  digit: "over" | "under" | "random" | null
  parity: "odd" | "even" | "random" | null
  race: "bit" | "coin" | "tie" | "random" | null
  amount: number
  maxRounds: number | null
  maxLoss: number | null
}

const DEFAULT_AUTO_BET: AutoBetConfig = {
  enabled: false,
  direction: null,
  digit: null,
  parity: null,
  race: "random",
  amount: 10_000,
  maxRounds: 10,
  maxLoss: 100_000,
}

// ─── 배팅 다이얼로그 ────────────────────────────────────────────────────────
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
  liveOdds?: {
    bit?: number | null; coin?: number | null; tie?: number | null
    pools?: { bit: number; coin: number; tie: number }
  } | null
}

function RaceBetDialog({ open, betType, selectedValue, onClose, onConfirm, isLoading, balance, locked, lockedAmount, onLockChange, canBet, liveOdds }: BetDialogProps) {
  const [selectedChip, setSelectedChip] = useState<number | null>(null)
  const [amount, setAmount] = useState(0)

  useEffect(() => {
    if (open) {
      if (locked && lockedAmount !== null) {
        setSelectedChip(lockedAmount); setAmount(lockedAmount)
      } else {
        setSelectedChip(null); setAmount(0)
      }
    }
  }, [open, locked, lockedAmount])

  const handleChip = (value: number) => {
    if (selectedChip === value) setAmount(prev => prev + value)
    else { setSelectedChip(value); setAmount(value) }
  }

  const meta = selectedValue ? LABEL_MAP[selectedValue] : null

  // 내 배팅 포함 예상 배율 계산 — 실제 정산 배율과 일치
  const { previewOdds, expectedPayout } = (() => {
    if (!selectedValue || amount <= 0) return { previewOdds: null, expectedPayout: 0 }

    const side = selectedValue as "bit" | "coin" | "tie"
    const pools = liveOdds?.pools

    if (pools) {
      const newPools = {
        bit:  pools.bit  + (side === "bit"  ? amount : 0),
        coin: pools.coin + (side === "coin" ? amount : 0),
        tie:  pools.tie  + (side === "tie"  ? amount : 0),
      }
      const result = calcRaceOdds(newPools, { enabled: false, lpAmountBaccarat: 0, lpAmountRace: 0, lpMultiplierBaccarat: 1, lpMultiplierRace: 1 }, 0)
      const odds = side === "bit" ? result.bitOdds : side === "coin" ? result.coinOdds : result.tieOdds
      if (odds !== null) return { previewOdds: odds, expectedPayout: Math.floor(amount * odds) }
    }

    const fallbackOdds = side === "bit" ? liveOdds?.bit : side === "coin" ? liveOdds?.coin : liveOdds?.tie
    if (fallbackOdds) return { previewOdds: fallbackOdds, expectedPayout: Math.floor(amount * fallbackOdds) }

    return { previewOdds: null, expectedPayout: 0 }
  })()

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl shadow-2xl max-w-lg mx-auto"
        style={{ background: "linear-gradient(180deg,#1a1506,#0d0b04)", border: "1px solid rgba(212,175,55,0.3)", borderBottom: "none" }}>
        <div className="flex items-center justify-between px-5 pt-5 pb-3" style={{ borderBottom: "1px solid rgba(212,175,55,0.15)" }}>
          <div className="flex items-center gap-2">
            {meta && (
              <span className="px-3 py-1 rounded-full text-sm font-bold"
                style={{ background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
                {meta.text}
              </span>
            )}
            <span className="text-sm font-semibold" style={{ color: G.text }}>배팅 금액 선택</span>
          </div>
          <button onClick={onClose} style={{ color: G.textDim }}><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {balance !== null && (
            <div className="flex items-center justify-between text-xs" style={{ color: G.textDim }}>
              <span>잔고</span>
              <span className="font-semibold tabular-nums" style={{ color: G.goldDim }}>₩{balance.toLocaleString()}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: G.textDim }}>배팅 금액</span>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tabular-nums"
                style={{ color: balance !== null && amount > balance ? "#ef4444" : amount > 0 ? (meta?.color ?? G.gold) : G.textDim }}>
                ₩{amount.toLocaleString()}
              </span>
              {amount > 0 && balance !== null && amount <= balance && expectedPayout > 0 && (
                <span className="text-[10px]" style={{ color: G.goldDim }}>
                  {previewOdds !== null ? `${previewOdds.toFixed(2)}x` : ""} → ₩{expectedPayout.toLocaleString()} 예상
                </span>
              )}
              {balance !== null && amount > balance && <span className="text-[10px] text-red-500">잔고 부족</span>}
            </div>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {CHIPS.map(({ label, value }) => {
              const isActive = selectedChip === value
              return (
                <button key={value} onClick={() => handleChip(value)}
                  className="py-2.5 rounded-xl text-xs font-bold transition-all duration-150 active:scale-95"
                  style={{
                    background: isActive ? G.goldFaint : "rgba(212,175,55,0.04)",
                    border: `1px solid ${isActive ? G.gold : G.goldBorder}`,
                    color: isActive ? G.gold : G.textDim,
                  }}>
                  {label}
                </button>
              )
            })}
          </div>
          {locked && lockedAmount !== null && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold"
              style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.2)", color: G.gold }}>
              <Lock className="w-3 h-3" />₩{lockedAmount.toLocaleString()} 고정 배팅
            </div>
          )}
          <div className="flex gap-2 pb-safe">
            <button onClick={() => { setSelectedChip(null); setAmount(0) }}
              className="flex items-center justify-center gap-1 px-4 py-3 rounded-xl text-sm transition-all"
              style={{ border: `1px solid ${G.goldBorder}`, color: G.textDim }}>
              <RotateCcw className="w-3.5 h-3.5" />초기화
            </button>
            <button
              onClick={() => locked ? onLockChange(false, null) : amount > 0 ? onLockChange(true, amount) : null}
              className="flex items-center justify-center gap-1 px-4 py-3 rounded-xl text-sm font-semibold transition-all"
              style={locked
                ? { background: "rgba(212,175,55,0.1)", border: `1px solid ${G.gold}`, color: G.gold }
                : { background: "rgba(212,175,55,0.04)", border: `1px solid ${G.goldBorder}`, color: G.textDim }}>
              {locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
              {locked ? "해제" : "고정"}
            </button>
            <button
              onClick={() => amount > 0 && canBet && onConfirm(amount)}
              disabled={amount <= 0 || isLoading || (balance !== null && amount > balance) || !canBet}
              className="flex-1 py-3 rounded-xl text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-40"
              style={{ background: amount > 0 && canBet ? (meta?.color ?? G.gold) : "rgba(212,175,55,0.08)", color: "#fff" }}>
              {isLoading ? "처리 중..." : !canBet ? "배팅 마감" : `₩${amount.toLocaleString()} 배팅`}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ─── 결과 시트 ─────────────────────────────────────────────────────────────
function RaceResultSheet({ result, open, onClose }: { result: RoundResult | null; open: boolean; onClose: () => void }) {
  if (!open || !result) return null

  const priceChange = result.closePrice - result.basePrice
  const isUp = priceChange >= 0

  const bets = [
    result.direction && {
      key: result.direction, label: LABEL_MAP[result.direction], won: result.wonDirection,
      amount: result.directionAmount, payout: result.wonDirection ? Math.floor(result.directionAmount * PAYOUT_RATIO) : 0
    },
    result.digit && {
      key: result.digit, label: LABEL_MAP[result.digit], won: result.wonDigit,
      amount: result.digitAmount, payout: result.wonDigit ? Math.floor(result.digitAmount * PAYOUT_RATIO) : 0
    },
    result.parity && {
      key: result.parity, label: LABEL_MAP[result.parity], won: result.wonParity,
      amount: result.parityAmount, payout: result.wonParity ? Math.floor(result.parityAmount * PAYOUT_RATIO) : 0
    },
    result.race && {
      key: result.race, label: LABEL_MAP[result.race], won: result.wonRace,
      amount: result.raceAmount,
      // 서버 확정 배당만 사용 — 하드코딩 없음. 타이 결과 시 bit/coin은 LOSS
      payout: result.wonRace && result.raceOdds
        ? Math.floor(result.raceAmount * result.raceOdds)
        : 0,
    },
  ].filter(Boolean) as { key: string; label: { text: string; color: string; bg: string }; won: boolean; amount: number; payout: number }[]

  const totalBet = bets.reduce((s, b) => s + b.amount, 0)
  const totalPayout = bets.reduce((s, b) => s + b.payout, 0)
  const netProfit = totalPayout - totalBet
  const allWon = bets.every(b => b.won)
  const allLost = bets.every(b => !b.won)

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl shadow-2xl max-w-lg mx-auto"
        style={{ background: "linear-gradient(180deg,#1a1506,#0d0b04)", border: "1px solid rgba(212,175,55,0.3)", borderBottom: "none" }}>
        <div className="px-5 pt-5 pb-4 flex items-center justify-between"
          style={{ background: allWon ? "rgba(212,175,55,0.08)" : allLost ? "rgba(239,68,68,0.08)" : "rgba(212,175,55,0.04)" }}>
          <div>
            <p className="text-[11px] mb-0.5" style={{ color: G.textDim }}>라운드 #{result.round} 결과</p>
            <p className="text-2xl font-black tracking-tight"
              style={{ color: allWon ? G.gold : allLost ? "#ef4444" : "#f97316" }}>
              {allWon ? "승리!" : allLost ? "패배" : "����분 승리"}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: G.textDim }}>
              {isUp ? "▲" : "▼"} ${Math.abs(priceChange).toFixed(1)}
              {result.raceResult && (
                <span className="ml-2 font-bold" style={{ color: LABEL_MAP[result.raceResult].color }}>
                  레이스 {result.raceResult === "bit" ? "BIT팀" : result.raceResult === "coin" ? "COIN팀" : "TIE"}
                  {" "}({result.bitScore} vs {result.coinScore})
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} style={{ color: G.textDim }}><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {bets.map((bet) => {
            const net = bet.payout - bet.amount
            return (
              <div key={bet.key} className="flex items-center gap-3 p-3 rounded-xl"
                style={{
                  background: bet.won ? "rgba(212,175,55,0.06)" : "rgba(239,68,68,0.06)",
                  border: `1px solid ${bet.won ? "rgba(212,175,55,0.2)" : "rgba(239,68,68,0.2)"}`,
                }}>
                <span className="text-sm font-bold px-2.5 py-1 rounded-lg shrink-0"
                  style={{ background: bet.label.bg, color: bet.label.color }}>{bet.label.text}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs" style={{ color: G.textDim }}>배팅</p>
                  <p className="text-sm font-semibold tabular-nums" style={{ color: G.text }}>₩{bet.amount.toLocaleString()}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] mb-0.5" style={{ color: G.textDim }}>
                    {bet.won ? "수익" : "손실"}
                  </p>
                  <p className="text-sm font-bold tabular-nums"
                    style={{ color: bet.won ? G.gold : "#ef4444" }}>
                    {bet.won ? `+₩${bet.payout.toLocaleString()}` : `-₩${bet.amount.toLocaleString()}`}
                  </p>
                  {bet.won && net > 0 && <p className="text-[9px]" style={{ color: G.goldDim }}>순수익 +₩{net.toLocaleString()}</p>}
                </div>
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-black"
                  style={{ background: bet.won ? G.gold : "#ef4444", color: "#000" }}>
                  {bet.won ? "승" : "패"}
                </div>
              </div>
            )
          })}

          <div className="flex items-center justify-between pt-3" style={{ borderTop: `1px solid ${G.goldBorder}` }}>
            <div>
              <p className="text-xs" style={{ color: G.textDim }}>총 배팅</p>
              <p className="text-sm font-semibold tabular-nums" style={{ color: G.text }}>₩{totalBet.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-xs" style={{ color: G.textDim }}>순손익</p>
              <p className="text-lg font-black tabular-nums" style={{ color: netProfit >= 0 ? G.gold : "#ef4444" }}>
                {netProfit >= 0 ? "+" : ""}₩{netProfit.toLocaleString()}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-full py-3 rounded-xl font-semibold text-sm transition-all"
            style={{ background: G.goldFaint, border: `1px solid ${G.goldBorder}`, color: G.gold }}>확인</button>
        </div>
      </div>
    </>
  )
}

// ─── 메인 게임 컴포넌트 ─────────────────────────────────────────────────────
// 3분(180초) 라운드: 0~9초=정산, 10~59초=배팅, 60~179초=게임중(스코어 누적)
// BIT팀(소수점 첫째자리) vs COIN팀(소수점 둘째자리) 매 초 누적
interface RaceBettingGameProps {
  onStatusChange?: (timeLeft: number, phase: "betting" | "waiting" | "result" | "dealing") => void
  onPriceChange?: (basePrice: number | null, currentPrice: number | null) => void
  onScoreChange?: (bit: number, coin: number) => void
}

export function RaceBettingGame({ onStatusChange, onPriceChange, onScoreChange }: RaceBettingGameProps = {}) {
  // 3분(180초) 타이머: 정산10 + 배팅50 + 게임중120
  const [timeLeft, setTimeLeft] = useState(180)
  const [roundNumber, setRoundNumber] = useState(0)

  // 배팅 상태
  const [betDirection, setBetDirection] = useState<BetDirection>(null)
  const [betDigit, setBetDigit] = useState<BetDigit>(null)
  const [betParity, setBetParity] = useState<BetParity>(null)
  const [betRace, setBetRace] = useState<BetRace>(null)
  const [betDirectionAmount, setBetDirectionAmount] = useState(0)
  const [betDigitAmount, setBetDigitAmount] = useState(0)
  const [betParityAmount, setBetParityAmount] = useState(0)
  const [betRaceAmount, setBetRaceAmount] = useState(0)

  // 스코어 (누적)
  const [bitScore, setBitScore] = useState(0)
  const [coinScore, setCoinScore] = useState(0)
  const bitScoreRef = useRef(0)
  const coinScoreRef = useRef(0)

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
  const [locked, setLocked] = useState(false)
  const [lockedAmount, setLockedAmount] = useState<number | null>(null)
  const [autoBet, setAutoBet] = useState<AutoBetConfig>(DEFAULT_AUTO_BET)
  const [autoBetOpen, setAutoBetOpen] = useState(false)
  const [autoBetRounds, setAutoBetRounds] = useState(0)
  const [autoBetPnl, setAutoBetPnl] = useState(0)

  // 실시간 배당률 (SSE - 배팅 즉시 반영, 폴링 없음)
  const [liveOdds, setLiveOdds] = useState<{
    bit: number | null; coin: number | null; tie: number | null
    available?: boolean; mode?: "seeded" | "decay" | "natural" | "pending"
    pools?: { bit: number; coin: number; tie: number }
  } | null>(null)

  // Railway WS 게이트웨이로 race odds 구독 — available:false 포함 항상 반영
  useGatewayOdds("race", (data: unknown) => {
    const d = data as { odds?: typeof liveOddsRef.current; pools?: { bit: number; coin: number; tie: number } }
    if (d.odds) {
      const withPools = { ...d.odds, pools: d.pools ?? liveOddsRef.current?.pools }
      liveOddsRef.current = withPools
      setLiveOdds(withPools)
    }
  })

  const betRef = useRef<BetDirection>(null)
  const betDigitRef = useRef<BetDigit>(null)
  const betParityRef = useRef<BetParity>(null)
  const betRaceRef = useRef<BetRace>(null)
  const betDirectionAmountRef = useRef(0)
  const betDigitAmountRef = useRef(0)
  const betParityAmountRef = useRef(0)
  const betRaceAmountRef = useRef(0)
  const liveOddsRef = useRef<typeof liveOdds>(null)    // 항상 최신 liveOdds (클로저 stale 방지)
  const canBetRef = useRef(false)                      // canBet 최신값 ref (SSE 클로저용)
  const basePriceRef = useRef<number | null>(null)
  const roundRef = useRef<number>(0)
  const currentPriceRef = useRef<number | null>(null)
  const autoBetRef = useRef<AutoBetConfig>(DEFAULT_AUTO_BET)
  const autoBetRoundsRef = useRef(0)
  const autoBetPnlRef = useRef(0)
  const autoBetFiredRef = useRef(false)
  const settledRoundRef = useRef<number>(-1)
  const prevCanBetRef = useRef(false)

  // 잔고 로드
  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetch("/api/user/balance", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setBalance(d.balance ?? 0)).catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const v = (e as CustomEvent<number>).detail
      if (typeof v === "number") setBalance(v)
    }
    window.addEventListener("balance:update", handler)
    return () => window.removeEventListener("balance:update", handler)
  }, [])

  useEffect(() => { autoBetRef.current = autoBet }, [autoBet])

  // 마운트 시 race odds 즉시 조회 — WS 연결 전 버튼 배당 채움
  useEffect(() => {
    const token = getToken()
    fetch("/api/game/odds?type=race", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.odds && !liveOddsRef.current) {
          liveOddsRef.current = data.odds
          setLiveOdds(data.odds)
        }
      })
      .catch(() => {})
  }, [])

  // 3분(180초) 타이머. 라운드: Math.floor(now/180)
  // 페이즈: 0~9초=정산, 10~59초=배팅, 60~179초=게임중
  const prevRoundRef = useRef<number>(-1)

  useEffect(() => {
    const tick = setInterval(() => {
      const now = Math.floor(Date.now() / 1000)
      const secInRound = now % 180          // 0~179
      const rem = 180 - secInRound          // 180~1
      const roundNum = Math.floor(now / 180)
      setTimeLeft(rem)
      roundRef.current = roundNum
      setRoundNumber(roundNum)

      // 라운드 전환 감지 → 스코어 초기화
      if (prevRoundRef.current !== roundNum) {
        prevRoundRef.current = roundNum
        bitScoreRef.current = 0
        coinScoreRef.current = 0
        setBitScore(0)
        setCoinScore(0)
      }

      // 정산 트리거: secInRound === 179 (라운드 마지막 1초)
      if (secInRound === 179 && settledRoundRef.current !== roundNum) {
        settledRoundRef.current = roundNum
        window.dispatchEvent(new CustomEvent("race:settle", { detail: { roundNum } }))
      }
    }, 200)
    return () => clearInterval(tick)
  }, [])

  // 배팅 가능: 10~59초 구간 (정산 10초 이후 ~ 게임시작 전)
  // UTC 직접 계산으로 모든 클라이언트 동일 기준
  const canBet = (() => {
    const now = Math.floor(Date.now() / 1000)
    const s = now % 180
    return s >= 10 && s < 60
  })()
  // 딜링 중: 60초 이후 ~ 라운드 끝
  const isDealing = !canBet && timeLeft > 0

  // canBetRef 동기화 + 배팅 구간 시작 시 자동배팅 플래그 초기화
  useEffect(() => {
    const was = prevCanBetRef.current
    prevCanBetRef.current = canBet
    canBetRef.current = canBet
    if (!canBet || was) return
    // false→true 전환: liveOdds 리셋 없이 플래그만 초기화(폴링으로 갱신)
    autoBetFiredRef.current = false
  }, [canBet])

  // 배팅 구간에서 3초마다 odds 폴링
  useEffect(() => {
    if (!canBet) return
    const poll = () => {
      fetch("/api/game/odds?type=race")
        .then(r => r.ok ? r.json() : null)
        .then(data => {
          if (data?.odds) {
            const withPools = { ...data.odds, pools: data.pools ?? liveOddsRef.current?.pools }
            liveOddsRef.current = withPools
            setLiveOdds(withPools)
          }
        })
        .catch(() => {})
    }
    poll()
    const id = setInterval(poll, 3000)
    return () => clearInterval(id)
  }, [canBet])



  // isDealing / onScoreChange를 ref로 관리 → 이벤트 핸들러 마운트 시 1회만 등록
  const isDealingRef = useRef(isDealing)
  const onScoreChangeRef = useRef(onScoreChange)
  useEffect(() => { isDealingRef.current = isDealing }, [isDealing])
  useEffect(() => { onScoreChangeRef.current = onScoreChange }, [onScoreChange])

  // ��� 초 baka:price 구독 → 딜링 중에만 스코어 누적
  useEffect(() => {
    const handler = (e: Event) => {
      if (!isDealingRef.current) return
      const { price } = (e as CustomEvent<{ price: number; time: number }>).detail
      const dec = price.toFixed(2).split(".")[1] ?? "00"
      const d1 = parseInt(dec[0] ?? "0")   // BIT팀: 소수점 첫째
      const d2 = parseInt(dec[1] ?? "0")   // COIN팀: 소수점 둘째
      bitScoreRef.current += d1
      coinScoreRef.current += d2
      setBitScore(bitScoreRef.current)
      setCoinScore(coinScoreRef.current)
      onScoreChangeRef.current?.(bitScoreRef.current, coinScoreRef.current)
    }
    window.addEventListener("baka:price", handler)
    return () => window.removeEventListener("baka:price", handler)
  }, [])  // 빈 배열 → 마운트/언마운트 시 1회만 등록/해제

  // 라운드 마감 정산 — race:settle 이벤트로 트리거 (타이머 tick에서 secInRound===299에 발행)
  useEffect(() => {
    const onSettle = (e: Event) => {
    const { roundNum } = (e as CustomEvent<{ roundNum: number }>).detail

    const bit = bitScoreRef.current
    const coin = coinScoreRef.current
    const raceResult: "bit" | "coin" | "tie" =
      bit > coin ? "bit" : coin > bit ? "coin" : "tie"

      const closePrice = currentPriceRef.current ?? 0
    const effectiveBase = basePriceRef.current ?? closePrice
    const decStr = closePrice.toFixed(2).split(".")[1] ?? "00"
    const d2 = parseInt(decStr[1] ?? "0")

    const wonDirection = betRef.current
      ? (betRef.current === "long" ? closePrice >= effectiveBase : closePrice < effectiveBase)
      : false
    const wonDigit = betDigitRef.current
      ? (betDigitRef.current === "under" ? d2 <= 4 : d2 >= 5) : false
    const wonParity = betParityRef.current
      ? (betParityRef.current === "odd" ? d2 % 2 !== 0 : d2 % 2 === 0) : false
    const wonRace = betRaceRef.current ? betRaceRef.current === raceResult : false
    // 타이 결과 시 bit/coin은 LOSS — 반환 없음
    const hasRaceBet = !!betRaceRef.current

    const hasBet = betRef.current || betDigitRef.current || betParityRef.current || betRaceRef.current

    if (hasBet) {
      const result: RoundResult = {
        round: roundNum,
        direction: betRef.current, digit: betDigitRef.current,
        parity: betParityRef.current, race: betRaceRef.current,
        raceResult, basePrice: effectiveBase, closePrice,
        wonDirection, wonDigit, wonParity, wonRace,
        raceOdds: null,  // settle-me 응답 후 채워짐
        directionAmount: betDirectionAmountRef.current,
        digitAmount: betDigitAmountRef.current,
        parityAmount: betParityAmountRef.current,
        raceAmount: betRaceAmountRef.current,
        bitScore: bit, coinScore: coin,
      }
      setLastResult(result)
      // race 배팅 없으면 즉시 모달 열기, 있으면 settle-me 응답 후 열기
      if (!hasRaceBet) setShowResultSheet(true)

      const anyWon = (betRef.current && wonDirection) || (betDigitRef.current && wonDigit)
        || (betParityRef.current && wonParity) || (betRaceRef.current && wonRace)
      const anyLost = (betRef.current && !wonDirection) || (betDigitRef.current && !wonDigit)
        || (betParityRef.current && !wonParity) || (betRaceRef.current && !wonRace)
      if (anyWon) setWins(w => w + 1)
      if (anyLost) setLosses(l => l + 1)
      setPhase("result")
    }

    // ── settle-me 호출: 배팅이 있으면 서버 정산 + 잔고 갱신 ──────────────
    // raceSide는 bet refs 초기화 전에 캡처 (클로저에서 사용)
    const capturedRaceSide = betRaceRef.current
    if (hasBet) {
      const token = getToken()
      if (token) {
        fetch("/api/game/settle-me", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            closePrice,
            basePrice: effectiveBase,
            roundNumber: roundNum,
            gameType: "race",
            bitScore: bit,
            coinScore: coin,
          }),
        })
          .then(r => r.json())
          .then(d => {
            if (typeof d.balance === "number") {
              setBalance(d.balance)
              window.dispatchEvent(new CustomEvent("balance:update", { detail: d.balance }))
            }
            if (d.appliedOdds) {
              // appliedOdds = { bit, coin, tie } — 배팅 전 캡처한 사이드의 배당값 추출
              const sideOdds = capturedRaceSide ? (d.appliedOdds[capturedRaceSide] ?? null) : null
              setLastResult(prev => prev ? { ...prev, raceOdds: sideOdds } : prev)
            }
            if (hasRaceBet) setShowResultSheet(true)
          })
          .catch(() => { if (hasRaceBet) setShowResultSheet(true) })
      }
    }

    // 베팅 상태 초기화
    betRef.current = null; betDigitRef.current = null
    betParityRef.current = null; betRaceRef.current = null
    betDirectionAmountRef.current = 0; betDigitAmountRef.current = 0
    betParityAmountRef.current = 0; betRaceAmountRef.current = 0
    setBetDirection(null); setBetDigit(null); setBetParity(null); setBetRace(null)
    setBetDirectionAmount(0); setBetDigitAmount(0); setBetParityAmount(0); setBetRaceAmount(0)
    setBasePrice(currentPriceRef.current); basePriceRef.current = currentPriceRef.current
    setDialog(null)
    setTimeout(() => setPhase("betting"), 800)
    }
    window.addEventListener("race:settle", onSettle)
    return () => window.removeEventListener("race:settle", onSettle)
  }, [])

  // 자동 배팅
  useEffect(() => {
    if (!canBet || autoBetFiredRef.current) return
    const cfg = autoBetRef.current
    if (!cfg.enabled) return
    if (cfg.amount <= 0) return
    if (balance !== null && balance < cfg.amount) return
    if (cfg.maxRounds !== null && autoBetRoundsRef.current >= cfg.maxRounds) {
      setAutoBet(prev => ({ ...prev, enabled: false })); return
    }
    if (cfg.maxLoss !== null && autoBetPnlRef.current <= -cfg.maxLoss) {
      setAutoBet(prev => ({ ...prev, enabled: false })); return
    }
    autoBetFiredRef.current = true
    const pick = <T extends string>(val: T | "random" | null, opts: T[]): T | null => {
      if (val === null) return null
      if (val === "random") return opts[Math.floor(Math.random() * opts.length)]
      return val
    }
    const dir = pick(cfg.direction, ["long", "short"])
    const dig = pick(cfg.digit, ["over", "under"])
    const par = pick(cfg.parity, ["odd", "even"])
    const rac = pick(cfg.race, ["bit", "coin", "tie"])
    if (!dir && !dig && !par && !rac) return
    const token = getToken()
    if (!token) return

    const placeSingle = async (type: BetType, value: string) => {
      const autoBetsPayload = {
        direction:       type === "direction" ? value : undefined,
        directionAmount: type === "direction" ? cfg.amount : undefined,
        digit:           type === "digit" ? value : undefined,
        digitAmount:     type === "digit" ? cfg.amount : undefined,
        parity:          type === "parity" ? value : undefined,
        parityAmount:    type === "parity" ? cfg.amount : undefined,
        raceSide:        type === "race" ? value : undefined,
        raceAmount:      type === "race" ? cfg.amount : undefined,
      }
      const res = await fetch("/api/user/game/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          betAmount: cfg.amount,
          bets: autoBetsPayload,
          ...(type === "race" ? { gameType: "race", side: value } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (typeof data.newBalance === "number") {
        setBalance(data.newBalance)
        window.dispatchEvent(new CustomEvent("balance:update", { detail: data.newBalance }))
      }
      if (type === "direction") { betRef.current = value as BetDirection; betDirectionAmountRef.current = cfg.amount; setBetDirection(value as BetDirection); setBetDirectionAmount(cfg.amount) }
      else if (type === "digit") { betDigitRef.current = value as BetDigit; betDigitAmountRef.current = cfg.amount; setBetDigit(value as BetDigit); setBetDigitAmount(cfg.amount) }
      else if (type === "parity") { betParityRef.current = value as BetParity; betParityAmountRef.current = cfg.amount; setBetParity(value as BetParity); setBetParityAmount(cfg.amount) }
      else if (type === "race") { betRaceRef.current = value as BetRace; betRaceAmountRef.current = cfg.amount; setBetRace(value as BetRace); setBetRaceAmount(cfg.amount) }
      if (!basePriceRef.current && currentPriceRef.current) {
        basePriceRef.current = currentPriceRef.current; setBasePrice(currentPriceRef.current)
      }
    };
    (async () => {
      try {
        if (dir) await placeSingle("direction", dir)
        if (dig) await placeSingle("digit", dig)
        if (par) await placeSingle("parity", par)
        if (rac) await placeSingle("race", rac)
        setPhase("waiting")
      } catch (e) { console.error("[v0 autoBet race]", e) }
    })()
  }, [canBet, balance])

  usePriceWorker({
    onPrice: useCallback((price: number) => {
      setCurrentPrice(price); currentPriceRef.current = price
    }, []),
    onInitClosing: useCallback((prices: Array<{ time: number; price: number }>) => {
      if (prices.length > 0 && !betRef.current && !betDigitRef.current && !betParityRef.current && !betRaceRef.current) {
        const latest = prices[prices.length - 1].price
        setBasePrice(latest); basePriceRef.current = latest
      }
    }, []),
  })

  useEffect(() => { onPriceChange?.(basePrice, currentPrice) }, [basePrice, currentPrice, onPriceChange])
  useEffect(() => {
    const phaseStatus = canBet ? "betting" : timeLeft > 0 ? "dealing" : phase
    onStatusChange?.(timeLeft, phaseStatus as any)
  }, [timeLeft, phase, canBet, onStatusChange])

  const openDialog = (type: BetType, value: string) => {
    if (!canBet) return
    if (type === "direction" && betDirection !== null) return
    if (type === "digit" && betDigit !== null) return
    if (type === "parity" && betParity !== null) return
    if (type === "race" && betRace !== null) return
    setShowResultSheet(false)
    setDialog({ open: true, type, value })
  }

  const handleConfirmBet = async (amount: number) => {
    if (!dialog) return
    setIsPlacingBet(true)
    try {
      const token = getToken()
      if (!token) throw new Error("로그인 필요")
      const betSide = dialog.type === "race" ? dialog.value : undefined
      // bets 전체를 함께 전송 → Redis bet:bets:race:{round}:{userId}에 저장 → settle이 읽음
      const betsPayload = {
        direction:       dialog.type === "direction" ? dialog.value : (betRef.current ?? undefined),
        directionAmount: betDirectionAmountRef.current > 0 ? betDirectionAmountRef.current : (dialog.type === "direction" ? amount : undefined),
        digit:           dialog.type === "digit" ? dialog.value : (betDigitRef.current ?? undefined),
        digitAmount:     betDigitAmountRef.current > 0 ? betDigitAmountRef.current : (dialog.type === "digit" ? amount : undefined),
        parity:          dialog.type === "parity" ? dialog.value : (betParityRef.current ?? undefined),
        parityAmount:    betParityAmountRef.current > 0 ? betParityAmountRef.current : (dialog.type === "parity" ? amount : undefined),
        raceSide:        dialog.type === "race" ? dialog.value : (betRaceRef.current ?? undefined),
        raceAmount:      betRaceAmountRef.current > 0 ? betRaceAmountRef.current : (dialog.type === "race" ? amount : undefined),
      }
      const res = await fetch("/api/user/game/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          betAmount: amount,
          bets: betsPayload,
          ...(betSide ? { gameType: "race", side: betSide } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Bet failed")
      if (typeof data.newBalance === "number") {
        setBalance(data.newBalance)
        window.dispatchEvent(new CustomEvent("balance:update", { detail: data.newBalance }))
      }
      if (!basePriceRef.current) { basePriceRef.current = currentPriceRef.current; setBasePrice(currentPriceRef.current) }
      if (dialog.type === "direction") { betRef.current = dialog.value as BetDirection; betDirectionAmountRef.current = amount; setBetDirection(dialog.value as BetDirection); setBetDirectionAmount(amount) }
      else if (dialog.type === "digit") { betDigitRef.current = dialog.value as BetDigit; betDigitAmountRef.current = amount; setBetDigit(dialog.value as BetDigit); setBetDigitAmount(amount) }
      else if (dialog.type === "parity") { betParityRef.current = dialog.value as BetParity; betParityAmountRef.current = amount; setBetParity(dialog.value as BetParity); setBetParityAmount(amount) }
      else if (dialog.type === "race") { betRaceRef.current = dialog.value as BetRace; betRaceAmountRef.current = amount; setBetRace(dialog.value as BetRace); setBetRaceAmount(amount) }
      setPhase("waiting"); setDialog(null)
    } catch (err) {
      console.error("[v0] RaceBet error:", err)
    } finally {
      setIsPlacingBet(false)
    }
  }

  const priceDiff = currentPrice !== null && basePrice !== null ? currentPrice - basePrice : null
  const timerPercent = (timeLeft / 180) * 100
  const timerColor = canBet ? "#10b981" : timeLeft <= 10 ? "#ef4444" : "#f97316"
  const timerLabel = canBet ? "배팅 가능" : timeLeft > 0 ? "딜링 중" : "정산 중"

  // 배팅 버튼 렌더
  const renderBaccaratButtons = () => (
    <div className="mb-1.5">
      <div className="grid grid-cols-3 gap-1.5">
        {(["bit", "tie", "coin"] as const).map((side) => {
          const isSelected = betRace === side
          // liveOdds는 배팅 구간에만 갱신되므로 그대로 사용하면 게임중 동결됨
          const oddsAvailable = liveOdds?.available !== false
          const oddsVal = (liveOdds && oddsAvailable)
            ? (side === "bit" ? liveOdds.bit : side === "coin" ? liveOdds.coin : liveOdds.tie)
            : null
          const payout = oddsVal != null ? `${(oddsVal as number).toFixed(2)}x` : "-"
          const label = side === "bit" ? "BIT팀" : side === "tie" ? "TIE" : "COIN팀"
          const solidBg = side === "bit" ? BIT_BG : side === "coin" ? COIN_BG : "rgba(34,197,94,0.85)"
          const dimBg = side === "bit" ? "rgba(59,130,246,0.35)" : side === "coin" ? "rgba(249,115,22,0.35)" : "rgba(34,197,94,0.35)"
          const solidColor = side === "bit" ? BIT_COLOR : side === "coin" ? COIN_COLOR : "#22c55e"
          const dimBorder = side === "bit" ? "rgba(59,130,246,0.7)" : side === "coin" ? "rgba(249,115,22,0.7)" : "rgba(34,197,94,0.7)"

          return (
            <button
              key={side}
              onClick={() => openDialog("race", side)}
              disabled={!canBet}
              className="rounded-2xl font-bold flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 disabled:opacity-40"
              style={{
                height: 64,
                border: `2px solid ${isSelected ? solidColor : canBet ? dimBorder : "rgba(255,255,255,0.1)"}`,
                background: isSelected ? solidBg : canBet ? dimBg : "rgba(255,255,255,0.04)",
                color: "#fff",
                cursor: canBet ? "pointer" : "default",
              }}>
              <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "0.03em" }}>{label}</span>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.75)" }}>{payout}</span>
              {betRaceAmount > 0 && isSelected && (
                <span style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>
                  ₩{betRaceAmount >= 10000 ? `${betRaceAmount / 10000}만` : betRaceAmount.toLocaleString()}
                </span>
              )}
            </button>
          )
        })}

      </div>
    </div>
  )

  return (
    <>
      <div style={{
        background: "rgba(8,20,12,0.98)", borderRadius: 16, padding: "14px 16px",
        border: "1px solid rgba(212,175,55,0.2)", boxShadow: "0 4px 32px rgba(0,0,0,0.6)",
      }}>
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: G.gold, letterSpacing: "0.06em", margin: 0 }}>배팅</h3>
            <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 5, background: G.goldFaint, color: G.goldDim, fontWeight: 600 }}>
              #{roundNumber}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setAutoBetOpen(o => !o)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 8,
                background: autoBet.enabled ? "rgba(212,175,55,0.14)" : G.bgMuted,
                border: `1px solid ${autoBet.enabled ? G.gold : G.goldBorder}`,
                cursor: "pointer",
              }}>
              <Bot style={{ width: 12, height: 12, color: autoBet.enabled ? G.gold : G.goldDim }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: autoBet.enabled ? G.gold : G.goldDim }}>자동배팅</span>
              {autoBet.enabled && <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, background: G.gold, color: "#000", fontWeight: 800 }}>ON</span>}
              {autoBetOpen ? <ChevronUp style={{ width: 10, height: 10, color: G.textDim }} /> : <ChevronDown style={{ width: 10, height: 10, color: G.textDim }} />}
            </button>
          </div>
        </div>

        {/* 자동 배팅 패널 */}
        {autoBetOpen && (
          <div className="mt-2 rounded-xl p-3 space-y-3" style={{ background: G.bgMuted, border: `1px solid ${G.goldBorder}` }}>

            {/* 레이스 */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] w-8 shrink-0" style={{ color: G.textDim }}>팀</span>
              <div className="flex gap-1 flex-1">
                <button onClick={() => setAutoBet(prev => ({ ...prev, race: null }))}
                  className="px-2 py-1 rounded text-[10px] font-semibold"
                  style={autoBet.race === null
                    ? { background: G.goldFaint, color: G.gold, border: `1px solid ${G.gold}` }
                    : { background: "transparent", color: G.textDim, border: `1px solid ${G.goldBorder}` }}>없음</button>
                {(["bit", "coin", "tie", "random"] as const).map((opt) => {
                  const labels: Record<typeof opt, string> = { bit: "BIT팀", coin: "COIN팀", tie: "TIE", random: "랜덤" }
                  return (
                    <button key={opt} onClick={() => setAutoBet(prev => ({ ...prev, race: opt }))}
                      className="flex-1 px-1 py-1 rounded text-[10px] font-semibold"
                      style={autoBet.race === opt
                        ? { background: G.goldFaint, color: G.gold, border: `1px solid ${G.gold}` }
                        : { background: "transparent", color: G.textDim, border: `1px solid ${G.goldBorder}` }}>
                      {labels[opt]}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 금액 */}
            <div className="flex items-center gap-2">
              <span className="text-[10px] w-8 shrink-0" style={{ color: G.textDim }}>금액</span>
              <div className="flex gap-1 flex-1 flex-wrap">
                {CHIPS.map(c => (
                  <button key={c.value} onClick={() => setAutoBet(prev => ({ ...prev, amount: c.value }))}
                    className="px-2 py-1 rounded text-[10px] font-semibold"
                    style={autoBet.amount === c.value
                      ? { background: G.goldFaint, color: G.gold, border: `1px solid ${G.gold}` }
                      : { background: "transparent", color: G.textDim, border: `1px solid ${G.goldBorder}` }}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 종료 조건 */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="text-[10px] mb-1" style={{ color: G.textDim }}>최대 라운드</p>
                <input type="number" min={1} max={100} value={autoBet.maxRounds ?? ""}
                  onChange={e => setAutoBet(prev => ({ ...prev, maxRounds: e.target.value === "" ? null : Number(e.target.value) }))}
                  placeholder="무제한" className="w-full px-2 py-1.5 rounded text-[11px] font-semibold tabular-nums"
                  style={{ background: G.bgMuted, border: `1px solid ${G.goldBorder}`, color: G.text, outline: "none" }} />
              </div>
              <div>
                <p className="text-[10px] mb-1" style={{ color: G.textDim }}>손실 한도 ₩</p>
                <input type="number" min={0} value={autoBet.maxLoss ?? ""}
                  onChange={e => setAutoBet(prev => ({ ...prev, maxLoss: e.target.value === "" ? null : Number(e.target.value) }))}
                  placeholder="무제한" className="w-full px-2 py-1.5 rounded text-[11px] font-semibold tabular-nums"
                  style={{ background: G.bgMuted, border: `1px solid ${G.goldBorder}`, color: G.text, outline: "none" }} />
              </div>
            </div>

            <button
              onClick={() => {
                if (autoBet.enabled) { setAutoBet(prev => ({ ...prev, enabled: false })) }
                else { autoBetRoundsRef.current = 0; autoBetPnlRef.current = 0; setAutoBetRounds(0); setAutoBetPnl(0); autoBetFiredRef.current = true; setAutoBet(prev => ({ ...prev, enabled: true })) }
              }}
              className="w-full py-2.5 rounded-xl text-sm font-bold"
              style={autoBet.enabled
                ? { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444" }
                : { background: G.goldFaint, border: `1px solid ${G.gold}`, color: G.gold }}>
              {autoBet.enabled ? "자동 배팅 중단" : "자동 배팅 시작"}
            </button>
          </div>
        )}

        {/* BIT / TIE / COIN ���튼 */}
        {renderBaccaratButtons()}
      </div>

      <RaceBetDialog
        open={!!dialog?.open} betType={dialog?.type ?? null} selectedValue={dialog?.value ?? null}
        onClose={() => setDialog(null)} onConfirm={handleConfirmBet}
        isLoading={isPlacingBet} balance={balance} locked={locked} lockedAmount={lockedAmount}
        onLockChange={(l, a) => { setLocked(l); setLockedAmount(a) }} canBet={canBet}
        liveOdds={liveOdds}
      />
      <RaceResultSheet result={lastResult} open={showResultSheet} onClose={() => setShowResultSheet(false)} />
    </>
  )
}
