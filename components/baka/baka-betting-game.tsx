"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { TrendingUp, TrendingDown, Clock, X, RotateCcw, Lock, Unlock, Bot, ChevronDown, ChevronUp, Shuffle } from "lucide-react"
import { usePriceWorker } from "@/hooks/use-price-worker"

// ─── 타입 ──────────────────────────────────────────────────────────────────
type BetDirection = "long" | "short" | null
type BetDigit = "under" | "over" | null
type BetParity = "odd" | "even" | null
type BetBaccarat = "player" | "banker" | "tie" | null
type BetType = "direction" | "digit" | "parity" | "baccarat"

interface RoundResult {
  round: number
  direction: BetDirection
  digit: BetDigit
  parity: BetParity
  baccarat: BetBaccarat
  baccaratResult: "player" | "banker" | "tie" | null
  basePrice: number
  closePrice: number
  wonDirection: boolean
  wonDigit: boolean
  wonParity: boolean
  wonBaccarat: boolean
  baccaratRefund: boolean
  directionAmount: number
  digitAmount: number
  parityAmount: number
  baccaratAmount: number
}

// ─── 상수 ──────────────────────────────────────────────────────────────────
const CHIPS = [
  { label: "1만",  value: 10_000 },
  { label: "5만",  value: 50_000 },
  { label: "10만", value: 100_000 },
  { label: "50만", value: 500_000 },
  { label: "100만",value: 1_000_000 },
]
const PAYOUT_RATIO = 1.95

// ─── 황금 테마 색상 ────────────────────────────────────────────────────────
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

const LABEL_MAP: Record<string, { text: string; color: string; bg: string; border: string }> = {
  long:   { text: "롱",    color: "#10b981", bg: "rgba(16,185,129,0.15)",  border: "rgba(16,185,129,0.4)"  },
  short:  { text: "숏",    color: "#ef4444", bg: "rgba(239,68,68,0.15)",   border: "rgba(239,68,68,0.4)"   },
  over:   { text: "오버",  color: "#f97316", bg: "rgba(249,115,22,0.15)",  border: "rgba(249,115,22,0.4)"  },
  under:  { text: "언더",  color: "#60a5fa", bg: "rgba(96,165,250,0.15)",  border: "rgba(96,165,250,0.4)"  },
  odd:    { text: "홀",    color: "#a78bfa", bg: "rgba(167,139,250,0.15)", border: "rgba(167,139,250,0.4)" },
  even:   { text: "짝",    color: "#ec4899", bg: "rgba(236,72,153,0.15)",  border: "rgba(236,72,153,0.4)"  },
  player: { text: "PLAYER", color: "#3b82f6", bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.4)"  },
  banker: { text: "BANKER", color: "#ef4444", bg: "rgba(239,68,68,0.15)",  border: "rgba(239,68,68,0.4)"   },
  tie:    { text: "TIE",    color: "#22c55e", bg: "rgba(34,197,94,0.15)",  border: "rgba(34,197,94,0.4)"   },
}

// getToken: localStorage에서 JWT 동기적으로 조회
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
  baccarat: "player" | "banker" | "tie" | "random" | null
  amount: number
  maxRounds: number | null
  maxLoss: number | null
}

const DEFAULT_AUTO_BET: AutoBetConfig = {
  enabled: false,
  direction: null,
  digit: null,
  parity: null,
  baccarat: "random",
  amount: 10_000,
  maxRounds: 10,
  maxLoss: 100_000,
}

// ─── 금액 선택 바텀 시트 (황금 테마) ──────────────────────────────────────
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
}

function BakaBetDialog({ open, betType, selectedValue, onClose, onConfirm, isLoading, balance, locked, lockedAmount, onLockChange, canBet }: BetDialogProps) {
  const [selectedChip, setSelectedChip] = useState<number | null>(null)
  const [amount, setAmount] = useState(0)

  useEffect(() => {
    if (open) {
      if (locked && lockedAmount !== null) {
        setSelectedChip(lockedAmount)
        setAmount(lockedAmount)
      } else {
        setSelectedChip(null)
        setAmount(0)
      }
    }
  }, [open, locked, lockedAmount])

  const handleChip = (value: number) => {
    if (selectedChip === value) setAmount(prev => prev + value)
    else { setSelectedChip(value); setAmount(value) }
  }

  const meta = selectedValue ? LABEL_MAP[selectedValue] : null

  // 예상 배당 계산
  const expectedPayout = (() => {
    if (!selectedValue || amount <= 0) return 0
    if (selectedValue === "player") return Math.floor(amount * 2)
    if (selectedValue === "banker") return Math.floor(amount * 1.95)
    if (selectedValue === "tie") return Math.floor(amount * 9)
    return Math.floor(amount * PAYOUT_RATIO)
  })()

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose} />
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl shadow-2xl max-w-lg mx-auto"
        style={{
          background: "linear-gradient(180deg, #1a1506 0%, #0d0b04 100%)",
          border: "1px solid rgba(212,175,55,0.3)",
          borderBottom: "none",
        }}
      >
        {/* 헤더 */}
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
          <button onClick={onClose} style={{ color: G.textDim }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* 잔고 */}
          {balance !== null && (
            <div className="flex items-center justify-between text-xs" style={{ color: G.textDim }}>
              <span>잔고</span>
              <span className="font-semibold tabular-nums" style={{ color: G.goldDim }}>
                ₩{balance.toLocaleString()}
              </span>
            </div>
          )}

          {/* 금액 + 예상 배당 */}
          <div className="flex items-center justify-between">
            <span className="text-sm" style={{ color: G.textDim }}>배팅 금액</span>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tabular-nums"
                style={{ color: balance !== null && amount > balance ? "#ef4444" : amount > 0 ? (meta?.color ?? G.gold) : G.textDim }}>
                ₩{amount.toLocaleString()}
              </span>
              {amount > 0 && balance !== null && amount <= balance && (
                <span className="text-[10px]" style={{ color: G.goldDim }}>
                  → ₩{expectedPayout.toLocaleString()} 예상
                </span>
              )}
              {balance !== null && amount > balance && (
                <span className="text-[10px] text-red-500">잔고 부족</span>
              )}
            </div>
          </div>

          {/* 칩 버튼 */}
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
              <Lock className="w-3 h-3" />
              ₩{lockedAmount.toLocaleString()} 고정 배팅
            </div>
          )}

          {/* 버튼 row */}
          <div className="flex gap-2 pb-safe">
            <button onClick={() => { setSelectedChip(null); setAmount(0) }}
              className="flex items-center justify-center gap-1 px-4 py-3 rounded-xl text-sm transition-all"
              style={{ border: `1px solid ${G.goldBorder}`, color: G.textDim }}>
              <RotateCcw className="w-3.5 h-3.5" />
              초기화
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

// ─── 결과 시트 (황금 테마) ─────────────────────────────────────────────────
function BakaResultSheet({ result, open, onClose }: { result: RoundResult | null; open: boolean; onClose: () => void }) {
  if (!open || !result) return null

  const lastDigit = Math.floor(Math.abs(result.closePrice * 10)) % 10
  const priceChange = result.closePrice - result.basePrice
  const isUp = priceChange >= 0

  const bets = [
    result.direction && { key: result.direction, label: LABEL_MAP[result.direction], won: result.wonDirection, amount: result.directionAmount,
      payout: result.wonDirection ? Math.floor(result.directionAmount * PAYOUT_RATIO) : 0 },
    result.digit && { key: result.digit, label: LABEL_MAP[result.digit], won: result.wonDigit, amount: result.digitAmount,
      payout: result.wonDigit ? Math.floor(result.digitAmount * PAYOUT_RATIO) : 0 },
    result.parity && { key: result.parity, label: LABEL_MAP[result.parity], won: result.wonParity, amount: result.parityAmount,
      payout: result.wonParity ? Math.floor(result.parityAmount * PAYOUT_RATIO) : 0 },
    result.baccarat && { key: result.baccarat, label: LABEL_MAP[result.baccarat], won: result.wonBaccarat, amount: result.baccaratAmount,
      payout: result.wonBaccarat
        ? result.baccarat === "player" ? Math.floor(result.baccaratAmount * 2)
          : result.baccarat === "banker" ? Math.floor(result.baccaratAmount * 1.95)
          : Math.floor(result.baccaratAmount * 9)
        : result.baccaratRefund ? result.baccaratAmount : 0,
      isRefund: result.baccaratRefund && !result.wonBaccarat,
    },
  ].filter(Boolean) as { key: string; label: { text: string; color: string; bg: string }; won: boolean; amount: number; payout: number; isRefund?: boolean }[]

  const totalBet = bets.reduce((s, b) => s + b.amount, 0)
  const totalPayout = bets.reduce((s, b) => s + b.payout, 0)
  const netProfit = totalPayout - totalBet
  const allWon = bets.every(b => b.won)
  const allLost = bets.every(b => !b.won && !b.isRefund)

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl shadow-2xl max-w-lg mx-auto"
        style={{ background: "linear-gradient(180deg,#1a1506,#0d0b04)", border: "1px solid rgba(212,175,55,0.3)", borderBottom: "none" }}>
        {/* 헤더 */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between"
          style={{ background: allWon ? "rgba(212,175,55,0.08)" : allLost ? "rgba(239,68,68,0.08)" : "rgba(212,175,55,0.04)" }}>
          <div>
            <p className="text-[11px] mb-0.5" style={{ color: G.textDim }}>라운드 #{result.round} 결과</p>
            <p className="text-2xl font-black tracking-tight"
              style={{ color: allWon ? G.gold : allLost ? "#ef4444" : "#f97316" }}>
              {allWon ? "승리!" : allLost ? "패배" : "부분 승리"}
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: G.textDim }}>
              끝자리 <span className="font-bold" style={{ color: G.gold }}>{lastDigit}</span>
              {"  "}{isUp ? "▲" : "▼"} ${Math.abs(priceChange).toFixed(1)}
              {result.baccaratResult && (
                <span className="ml-2 font-bold" style={{ color: LABEL_MAP[result.baccaratResult].color }}>
                  바카라 {result.baccaratResult === "player" ? "PLAYER" : result.baccaratResult === "banker" ? "BANKER" : "TIE"}
                </span>
              )}
            </p>
          </div>
          <button onClick={onClose} style={{ color: G.textDim }}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          {bets.map((bet) => {
            const net = bet.payout - bet.amount
            return (
              <div key={bet.key} className="flex items-center gap-3 p-3 rounded-xl"
                style={{
                  background: bet.won ? "rgba(212,175,55,0.06)" : bet.isRefund ? "rgba(96,165,250,0.06)" : "rgba(239,68,68,0.06)",
                  border: `1px solid ${bet.won ? "rgba(212,175,55,0.2)" : bet.isRefund ? "rgba(96,165,250,0.2)" : "rgba(239,68,68,0.2)"}`,
                }}>
                <span className="text-sm font-bold px-2.5 py-1 rounded-lg shrink-0"
                  style={{ background: bet.label.bg, color: bet.label.color }}>
                  {bet.label.text}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs" style={{ color: G.textDim }}>배팅</p>
                  <p className="text-sm font-semibold tabular-nums" style={{ color: G.text }}>
                    ₩{bet.amount.toLocaleString()}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] mb-0.5" style={{ color: G.textDim }}>
                    {bet.won ? "수익" : bet.isRefund ? "반환" : "손실"}
                  </p>
                  <p className="text-sm font-bold tabular-nums"
                    style={{ color: bet.won ? G.gold : bet.isRefund ? "#60a5fa" : "#ef4444" }}>
                    {bet.won ? `+₩${bet.payout.toLocaleString()}` : bet.isRefund ? `₩${bet.payout.toLocaleString()}` : `-₩${bet.amount.toLocaleString()}`}
                  </p>
                  {bet.won && net > 0 && <p className="text-[9px]" style={{ color: G.goldDim }}>순수익 +₩{net.toLocaleString()}</p>}
                </div>
                <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-black"
                  style={{ background: bet.won ? G.gold : bet.isRefund ? "#60a5fa" : "#ef4444", color: "#000" }}>
                  {bet.won ? "승" : bet.isRefund ? "반" : "패"}
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
            style={{ background: G.goldFaint, border: `1px solid ${G.goldBorder}`, color: G.gold }}>
            확인
          </button>
        </div>
      </div>
    </>
  )
}

// ─── 메인 게임 컴포넌트 ─────────────────────────────────────────────────────
interface BakaBettingGameProps {
  /** 15초 시점: page가 주입해 준 startDeal 트리거 */
  onStartDealTrigger?: () => void
  /** 0초 시점: page가 주입해 준 applyFinalDigit 트리거 */
  onFinalDigitTrigger?: (digit: number) => void
  /** 바카라 배팅 확정 시 선택 사이드를 BaccaratGame에 전달 */
  onBetSideTrigger?: (side: "player" | "banker" | "tie" | null) => void
}

export function BakaBettingGame({ onStartDealTrigger, onFinalDigitTrigger, onBetSideTrigger }: BakaBettingGameProps = {}) {
  const [timeLeft, setTimeLeft] = useState(30)
  const [roundNumber, setRoundNumber] = useState(0)
  const [betDirection, setBetDirection] = useState<BetDirection>(null)
  const [betDigit, setBetDigit] = useState<BetDigit>(null)
  const [betParity, setBetParity] = useState<BetParity>(null)
  const [betBaccarat, setBetBaccarat] = useState<BetBaccarat>(null)
  const [betDirectionAmount, setBetDirectionAmount] = useState(0)
  const [betDigitAmount, setBetDigitAmount] = useState(0)
  const [betParityAmount, setBetParityAmount] = useState(0)
  const [betBaccaratAmount, setBetBaccaratAmount] = useState(0)
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
  // 자동 배팅
  const [autoBet, setAutoBet] = useState<AutoBetConfig>(DEFAULT_AUTO_BET)
  const [autoBetOpen, setAutoBetOpen] = useState(false)
  const [autoBetRounds, setAutoBetRounds] = useState(0)
  const [autoBetPnl, setAutoBetPnl] = useState(0)
  const autoBetRef = useRef<AutoBetConfig>(DEFAULT_AUTO_BET)
  const autoBetRoundsRef = useRef(0)
  const autoBetPnlRef = useRef(0)
  const autoBetFiredRef = useRef(false)

  const betRef = useRef<BetDirection>(null)
  const betDigitRef = useRef<BetDigit>(null)
  const betParityRef = useRef<BetParity>(null)
  const betBaccaratRef = useRef<BetBaccarat>(null)
  const betDirectionAmountRef = useRef(0)
  const betDigitAmountRef = useRef(0)
  const betParityAmountRef = useRef(0)
  const betBaccaratAmountRef = useRef(0)
  const basePriceRef = useRef<number | null>(null)
  const roundRef = useRef<number>(0)
  const currentPriceRef = useRef<number | null>(null)
  // BaccaratGame이 applyFinalDigit 후 setState → onCardsChange → setBaccaratResult 순으로 전달
  // baccaratResultRef는 onClosingPrice 시점에 읽힘 (900ms 딜레이로 카드 완료 대기)
  const baccaratResultRef = useRef<"player" | "banker" | "tie" | null>(null)
  // 15초 트리거 중복 방지
  const dealTriggeredRoundRef = useRef<number>(-1)
  // onStartDealTrigger / onFinalDigitTrigger는 props로 직접 받으므로 별도 ref 불필요

  // baka/page.tsx에서 BaccaratGame 결과를 브로드캐스트 → baccaratResultRef 동기화
  useEffect(() => {
    const handler = (e: Event) => {
      baccaratResultRef.current = (e as CustomEvent<"player" | "banker" | "tie">).detail
    }
    window.addEventListener("baccarat:result", handler)
    return () => window.removeEventListener("baccarat:result", handler)
  }, [])

  // 잔고 초기 로드
  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetch("/api/user/balance", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setBalance(d.balance ?? 0))
      .catch(() => {})
  }, [])

  // SSE 잔고 동기화
  useEffect(() => {
    const handler = (e: Event) => {
      const v = (e as CustomEvent<number>).detail
      if (typeof v === "number") setBalance(v)
    }
    window.addEventListener("balance:update", handler)
    return () => window.removeEventListener("balance:update", handler)
  }, [])

  const getRoundNumber = useCallback(() => Math.floor(Date.now() / 1000 / 30), [])

  usePriceWorker({
    onPrice: useCallback((price: number) => {
      setCurrentPrice(price)
      currentPriceRef.current = price
    }, []),
    onClosingPrice: useCallback((price: number) => {
      const closePrice = price
      const lastDigit = Math.floor(Math.abs(closePrice * 10)) % 10

      // 0초 끝자리 → BaccaratGame에 뱅커 최종 카드로 전달
      onFinalDigitTrigger?.(lastDigit)

      // 배팅 없으면 새 기준가만 업데이트
      const hasBet = betRef.current || betDigitRef.current || betParityRef.current || betBaccaratRef.current
      if (!hasBet) {
        setBasePrice(price)
        basePriceRef.current = price
        return
      }
      if (basePriceRef.current === null) return

      const wonDirection = betRef.current ? (betRef.current === "long" ? closePrice >= basePriceRef.current : closePrice < basePriceRef.current) : false
      const wonDigit = betDigitRef.current ? (betDigitRef.current === "under" ? lastDigit <= 4 : lastDigit >= 5) : false
      const wonParity = betParityRef.current ? (betParityRef.current === "odd" ? lastDigit % 2 !== 0 : lastDigit % 2 === 0) : false

      // 바카라 결과: BaccaratGame이 applyFinalDigit 후 결과를 반환하기까지 약간의 딜레이 필요
      // → 500ms 후 baccaratResultRef 읽기 (카드 딜 애니메이션 완료 대기)
      const settleAfterDelay = (bacResult: "player" | "banker" | "tie" | null) => {
        const wonBaccarat = betBaccaratRef.current ? betBaccaratRef.current === bacResult : false
        const baccaratRefund = !wonBaccarat && bacResult === "tie" && (betBaccaratRef.current === "player" || betBaccaratRef.current === "banker")

        // 서버 정산
        const token = getToken()
        if (token) {
          fetch("/api/user/game/play", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              basePrice: basePriceRef.current,
              closePrice,
              bets: {
                direction: betRef.current ?? undefined,
                directionAmount: betRef.current ? betDirectionAmountRef.current : undefined,
                digit: betDigitRef.current ?? undefined,
                digitAmount: betDigitRef.current ? betDigitAmountRef.current : undefined,
                parity: betParityRef.current ?? undefined,
                parityAmount: betParityRef.current ? betParityAmountRef.current : undefined,
                baccaratSide: betBaccaratRef.current ?? undefined,
                baccaratAmount: betBaccaratRef.current ? betBaccaratAmountRef.current : undefined,
                baccaratResult: bacResult ?? undefined,
              },
            }),
          }).then(r => r.json()).then(data => {
            if (typeof data.newBalance === "number") {
              setBalance(data.newBalance)
              window.dispatchEvent(new CustomEvent("balance:update", { detail: data.newBalance }))
            }
          }).catch(() => {})
        }

        const result: RoundResult = {
          round: roundRef.current,
          direction: betRef.current,
          digit: betDigitRef.current,
          parity: betParityRef.current,
          baccarat: betBaccaratRef.current,
          baccaratResult: bacResult,
          basePrice: basePriceRef.current!,
          closePrice,
          wonDirection, wonDigit, wonParity, wonBaccarat, baccaratRefund,
          directionAmount: betDirectionAmountRef.current,
          digitAmount: betDigitAmountRef.current,
          parityAmount: betParityAmountRef.current,
          baccaratAmount: betBaccaratAmountRef.current,
        }
        setLastResult(result)
        setShowResultSheet(true)
        const anyWon = (betRef.current && wonDirection) || (betDigitRef.current && wonDigit) || (betParityRef.current && wonParity) || (betBaccaratRef.current && wonBaccarat)
        const anyLost = (betRef.current && !wonDirection) || (betDigitRef.current && !wonDigit) || (betParityRef.current && !wonParity) || (betBaccaratRef.current && !wonBaccarat && !baccaratRefund)
        if (anyWon) setWins(w => w + 1)
        if (anyLost) setLosses(l => l + 1)
        setPhase("result")

        // 초기화
        betRef.current = null; betDigitRef.current = null; betParityRef.current = null; betBaccaratRef.current = null
        betDirectionAmountRef.current = 0; betDigitAmountRef.current = 0; betParityAmountRef.current = 0; betBaccaratAmountRef.current = 0
        setBetDirection(null); setBetDigit(null); setBetParity(null); setBetBaccarat(null)
        setBetDirectionAmount(0); setBetDigitAmount(0); setBetParityAmount(0); setBetBaccaratAmount(0)
        setBasePrice(price); basePriceRef.current = price
        setDialog(null)
        setTimeout(() => setPhase("betting"), 1500)
      }

      // 바카라 배팅이 있으면 카드 딜 완료(~800ms) 후 정산
      if (betBaccaratRef.current) {
        setTimeout(() => {
          settleAfterDelay(baccaratResultRef.current)
        }, 900)
      } else {
        settleAfterDelay(null)
      }
    }, []),
    onInitClosing: useCallback((prices: Array<{ time: number; price: number }>) => {
      if (prices.length > 0 && !betRef.current && !betDigitRef.current && !betParityRef.current && !betBaccaratRef.current) {
        const latest = prices[prices.length - 1].price
        setBasePrice(latest)
        basePriceRef.current = latest
      }
    }, []),
  })

  // 타이머 + 15초 딜 시작 트리거
  useEffect(() => {
    const tick = setInterval(() => {
      const now = Math.floor(Date.now() / 1000)
      const rem = 30 - (now % 30)
      const roundNum = Math.floor(now / 30)
      setTimeLeft(rem)
      roundRef.current = roundNum
      setRoundNumber(roundNum)

      // 15초: 딜 시작 (라운드당 1회)
      if (rem === 15 && dealTriggeredRoundRef.current !== roundNum) {
        dealTriggeredRoundRef.current = roundNum
        onStartDealTrigger?.()
      }
    }, 200)
    return () => clearInterval(tick)
  }, [onStartDealTrigger])

  // 배팅 가능 시간: 30초~15초 초과 구간
  const canBet = timeLeft > 15

  // autoBet state → ref 동기화
  useEffect(() => { autoBetRef.current = autoBet }, [autoBet])

  // 자동 배팅: canBet false→true 전환 시 새 라운드 플래그 초기화
  const prevCanBetRef = useRef(false)
  useEffect(() => {
    const was = prevCanBetRef.current
    prevCanBetRef.current = canBet
    if (!canBet || was) return
    autoBetFiredRef.current = false
  }, [canBet])

  // 자동 배팅 실행
  useEffect(() => {
    if (!canBet) return
    if (autoBetFiredRef.current) return
    const cfg = autoBetRef.current
    if (!cfg.enabled) return
    if (cfg.amount <= 0) return
    if (balance !== null && balance < cfg.amount) return
    if (cfg.maxRounds !== null && autoBetRoundsRef.current >= cfg.maxRounds) {
      setAutoBet(prev => ({ ...prev, enabled: false }))
      return
    }
    if (cfg.maxLoss !== null && autoBetPnlRef.current <= -cfg.maxLoss) {
      setAutoBet(prev => ({ ...prev, enabled: false }))
      return
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
    const bac = pick(cfg.baccarat, ["player", "banker", "tie"])
    if (!dir && !dig && !par && !bac) return

    const token = getToken()
    if (!token) return

    const placeSingle = async (type: BetType, value: string) => {
      const res = await fetch("/api/user/game/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ betAmount: cfg.amount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (typeof data.newBalance === "number") {
        setBalance(data.newBalance)
        window.dispatchEvent(new CustomEvent("balance:update", { detail: data.newBalance }))
      }
      if (type === "direction") {
        betRef.current = value as BetDirection; betDirectionAmountRef.current = cfg.amount
        setBetDirection(value as BetDirection); setBetDirectionAmount(cfg.amount)
      } else if (type === "digit") {
        betDigitRef.current = value as BetDigit; betDigitAmountRef.current = cfg.amount
        setBetDigit(value as BetDigit); setBetDigitAmount(cfg.amount)
      } else if (type === "parity") {
        betParityRef.current = value as BetParity; betParityAmountRef.current = cfg.amount
        setBetParity(value as BetParity); setBetParityAmount(cfg.amount)
      } else if (type === "baccarat") {
        betBaccaratRef.current = value as BetBaccarat; betBaccaratAmountRef.current = cfg.amount
        setBetBaccarat(value as BetBaccarat); setBetBaccaratAmount(cfg.amount)
        onBetSideTrigger?.(value as "player" | "banker" | "tie")
      }
      if (!basePriceRef.current && currentPriceRef.current) {
        basePriceRef.current = currentPriceRef.current
        setBasePrice(currentPriceRef.current)
      }
    }

    ;(async () => {
      try {
        if (dir) await placeSingle("direction", dir)
        if (dig) await placeSingle("digit", dig)
        if (par) await placeSingle("parity", par)
        if (bac) await placeSingle("baccarat", bac)
        setPhase("waiting")
      } catch (e) { console.error("[v0 autoBet]", e) }
    })()
  }, [canBet, balance, onBetSideTrigger])

  // 자동 배팅 결과 트래킹
  useEffect(() => {
    if (!lastResult || !autoBetRef.current.enabled) return
    const cfg = autoBetRef.current
    let pnl = 0
    if (lastResult.direction && lastResult.directionAmount > 0)
      pnl += lastResult.wonDirection ? Math.floor(lastResult.directionAmount * (PAYOUT_RATIO - 1)) : -lastResult.directionAmount
    if (lastResult.digit && lastResult.digitAmount > 0)
      pnl += lastResult.wonDigit ? Math.floor(lastResult.digitAmount * (PAYOUT_RATIO - 1)) : -lastResult.digitAmount
    if (lastResult.parity && lastResult.parityAmount > 0)
      pnl += lastResult.wonParity ? Math.floor(lastResult.parityAmount * (PAYOUT_RATIO - 1)) : -lastResult.parityAmount
    if (lastResult.baccarat && lastResult.baccaratAmount > 0) {
      if (lastResult.wonBaccarat) {
        const mult = lastResult.baccarat === "player" ? 1 : lastResult.baccarat === "banker" ? 0.95 : 8
        pnl += Math.floor(lastResult.baccaratAmount * mult)
      } else if (!lastResult.baccaratRefund) {
        pnl -= lastResult.baccaratAmount
      }
    }
    autoBetRoundsRef.current += 1
    autoBetPnlRef.current += pnl
    setAutoBetRounds(autoBetRoundsRef.current)
    setAutoBetPnl(autoBetPnlRef.current)
    if (cfg.maxRounds !== null && autoBetRoundsRef.current >= cfg.maxRounds)
      setAutoBet(prev => ({ ...prev, enabled: false }))
    else if (cfg.maxLoss !== null && autoBetPnlRef.current <= -cfg.maxLoss)
      setAutoBet(prev => ({ ...prev, enabled: false }))
  }, [lastResult])

  // 다이얼로그 강제 닫기
  useEffect(() => {
    if (!canBet && dialog?.open) setDialog(null)
  }, [canBet, dialog])

  const openDialog = (type: BetType, value: string) => {
    if (!canBet) return
    if (type === "direction" && betDirection !== null) return
    if (type === "digit" && betDigit !== null) return
    if (type === "parity" && betParity !== null) return
    if (type === "baccarat" && betBaccarat !== null) return
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
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ betAmount: amount }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Bet failed")

      if (typeof data.newBalance === "number") {
        setBalance(data.newBalance)
        window.dispatchEvent(new CustomEvent("balance:update", { detail: data.newBalance }))
      }

      if (!basePriceRef.current) {
        basePriceRef.current = currentPriceRef.current
        setBasePrice(currentPriceRef.current)
      }

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
      } else if (dialog.type === "parity") {
        betParityRef.current = dialog.value as BetParity
        betParityAmountRef.current = amount
        setBetParity(dialog.value as BetParity)
        setBetParityAmount(amount)
      } else if (dialog.type === "baccarat") {
        betBaccaratRef.current = dialog.value as BetBaccarat
        betBaccaratAmountRef.current = amount
        setBetBaccarat(dialog.value as BetBaccarat)
        setBetBaccaratAmount(amount)
        // 배팅 사이드를 BaccaratGame에 즉시 전달 (15초 딜 시 카드 분배 기준)
        onBetSideTrigger?.(dialog.value as "player" | "banker" | "tie")
      }

      setPhase("waiting")
      setDialog(null)
    } catch (err) {
      console.error("[v0] BakaBet error:", err)
    } finally {
      setIsPlacingBet(false)
    }
  }

  const priceDiff = currentPrice !== null && basePrice !== null ? currentPrice - basePrice : null
  const isUp = priceDiff !== null && priceDiff >= 0
  const timerPercent = (timeLeft / 30) * 100
  const timerColor = timeLeft > 15 ? "#10b981" : timeLeft > 3 ? "#f97316" : "#ef4444"
  const timerLabel = timeLeft > 15 ? "배팅 가능" : timeLeft > 0 ? "딜링 중" : "정산 중"

  return (
    <>
      <div style={{ background: G.bgCard, borderRadius: 16, padding: "16px" }}>

        {/* 헤더: 타이틀 + 승패 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold" style={{ color: G.gold, letterSpacing: "0.05em" }}>배팅</h3>
            <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: G.goldFaint, color: G.goldDim }}>
              #{roundNumber}
            </span>
          </div>
          <span className="text-[11px]">
            <span className="font-semibold" style={{ color: G.gold }}>{wins}승</span>
            <span style={{ color: G.textDim }}> / </span>
            <span className="font-semibold text-red-500">{losses}패</span>
          </span>
        </div>

        {/* 기준가 / 현재가 오버레이 */}
        {basePrice !== null && currentPrice !== null && phase !== "result" && (
          <div className="flex items-center justify-between mb-3 px-3 py-2 rounded-xl"
            style={{ background: G.bgMuted, border: `1px solid ${G.goldBorder}` }}>
            <div>
              <p className="text-[9px] mb-0.5" style={{ color: G.textDim }}>배팅 기준가</p>
              <p className="text-xs font-semibold tabular-nums" style={{ color: G.text }}>${basePrice.toFixed(1)}</p>
            </div>
            <div className="text-xs font-bold" style={{ color: isUp ? "#10b981" : "#ef4444" }}>
              {isUp ? "▲" : "▼"} {Math.abs(priceDiff!).toFixed(1)}
            </div>
            <div className="text-right">
              <p className="text-[9px] mb-0.5" style={{ color: G.textDim }}>현재가</p>
              <p className="text-xs font-semibold tabular-nums" style={{ color: isUp ? "#10b981" : "#ef4444" }}>
                ${currentPrice.toFixed(1)}
              </p>
            </div>
          </div>
        )}

        {/* 결과 오버레이 */}
        {phase === "result" && lastResult && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl flex-wrap"
            style={{ background: G.bgMuted, border: `1px solid ${G.goldBorder}` }}>
            <p className="text-[10px] shrink-0" style={{ color: G.textDim }}>
              끝자리 <span className="font-bold" style={{ color: G.gold }}>{Math.floor(lastResult.closePrice * 10) % 10}</span>
            </p>
            {lastResult.direction && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: lastResult.wonDirection ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", color: lastResult.wonDirection ? "#10b981" : "#ef4444" }}>
                {lastResult.direction === "long" ? "롱" : "숏"} {lastResult.wonDirection ? "승" : "패"}
              </span>
            )}
            {lastResult.digit && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: lastResult.wonDigit ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", color: lastResult.wonDigit ? "#10b981" : "#ef4444" }}>
                {lastResult.digit === "over" ? "오버" : "언더"} {lastResult.wonDigit ? "승" : "패"}
              </span>
            )}
            {lastResult.parity && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: lastResult.wonParity ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", color: lastResult.wonParity ? "#10b981" : "#ef4444" }}>
                {lastResult.parity === "odd" ? "홀" : "짝"} {lastResult.wonParity ? "승" : "패"}
              </span>
            )}
            {lastResult.baccarat && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                style={{ background: lastResult.wonBaccarat ? "rgba(212,175,55,0.15)" : lastResult.baccaratRefund ? "rgba(96,165,250,0.1)" : "rgba(239,68,68,0.1)",
                  color: lastResult.wonBaccarat ? G.gold : lastResult.baccaratRefund ? "#60a5fa" : "#ef4444" }}>
                {LABEL_MAP[lastResult.baccarat].text} {lastResult.wonBaccarat ? "승" : lastResult.baccaratRefund ? "반환" : "패"}
              </span>
            )}
          </div>
        )}

        {/* 타이머 */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1 text-[11px]" style={{ color: timerColor }}>
              <Clock className="w-3 h-3" />
              <span className="font-medium">{timerLabel}</span>
            </div>
            <span className="text-sm font-bold tabular-nums" style={{ color: timerColor }}>{timeLeft}초</span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: "rgba(212,175,55,0.1)" }}>
            <div className="h-full rounded-full transition-all duration-200"
              style={{ width: `${timerPercent}%`, backgroundColor: timerColor }} />
          </div>
        </div>

        {/* 자동 배팅 패널 */}
        <div className="mb-3">
          {/* 토글 헤더 */}
          <button
            onClick={() => setAutoBetOpen(o => !o)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl transition-all"
            style={{
              background: autoBet.enabled ? "rgba(212,175,55,0.12)" : G.bgMuted,
              border: `1px solid ${autoBet.enabled ? G.gold : G.goldBorder}`,
            }}
          >
            <div className="flex items-center gap-2">
              <Bot className="w-3.5 h-3.5" style={{ color: autoBet.enabled ? G.gold : G.goldDim }} />
              <span className="text-xs font-bold" style={{ color: autoBet.enabled ? G.gold : G.goldDim }}>자동 배팅</span>
              {autoBet.enabled && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: G.gold, color: "#000" }}>ON</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {autoBet.enabled && (
                <span className="text-[10px] font-semibold tabular-nums" style={{ color: autoBetPnl >= 0 ? "#10b981" : "#ef4444" }}>
                  {autoBetRounds}R / {autoBetPnl >= 0 ? "+" : ""}₩{Math.abs(autoBetPnl).toLocaleString()}
                </span>
              )}
              {autoBetOpen
                ? <ChevronUp className="w-3.5 h-3.5" style={{ color: G.textDim }} />
                : <ChevronDown className="w-3.5 h-3.5" style={{ color: G.textDim }} />}
            </div>
          </button>

          {/* 설정 패널 */}
          {autoBetOpen && (
            <div className="mt-2 rounded-xl p-3 space-y-3" style={{ background: G.bgMuted, border: `1px solid ${G.goldBorder}` }}>

              {/* 방향 / 크기 / 홀짝 */}
              {(["direction", "digit", "parity"] as const).map((type) => {
                const meta: Record<typeof type, { opts: string[]; labels: string[]; nullLabel: string }> = {
                  direction: { opts: ["long", "short", "random"], labels: ["롱", "숏", "랜덤"], nullLabel: "방향" },
                  digit:     { opts: ["over", "under", "random"],  labels: ["오버", "언더", "랜덤"], nullLabel: "크기" },
                  parity:    { opts: ["odd", "even", "random"],    labels: ["홀", "짝", "랜덤"],  nullLabel: "홀짝" },
                }
                const { opts, labels, nullLabel } = meta[type]
                const current = autoBet[type]
                return (
                  <div key={type} className="flex items-center gap-2">
                    <span className="text-[10px] w-8 shrink-0" style={{ color: G.textDim }}>{nullLabel}</span>
                    <div className="flex gap-1 flex-1">
                      <button
                        onClick={() => setAutoBet(prev => ({ ...prev, [type]: null }))}
                        className="px-2 py-1 rounded text-[10px] font-semibold transition-all"
                        style={current === null
                          ? { background: G.goldFaint, color: G.gold, border: `1px solid ${G.gold}` }
                          : { background: "transparent", color: G.textDim, border: `1px solid ${G.goldBorder}` }}
                      >없음</button>
                      {opts.map((opt, i) => (
                        <button key={opt}
                          onClick={() => setAutoBet(prev => ({ ...prev, [type]: opt as any }))}
                          className="flex-1 px-1 py-1 rounded text-[10px] font-semibold transition-all flex items-center justify-center gap-0.5"
                          style={current === opt
                            ? { background: G.goldFaint, color: G.gold, border: `1px solid ${G.gold}` }
                            : { background: "transparent", color: G.textDim, border: `1px solid ${G.goldBorder}` }}
                        >
                          {labels[i]}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}

              {/* 바카라 */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] w-8 shrink-0" style={{ color: G.textDim }}>바카라</span>
                <div className="flex gap-1 flex-1">
                  <button
                    onClick={() => setAutoBet(prev => ({ ...prev, baccarat: null }))}
                    className="px-2 py-1 rounded text-[10px] font-semibold transition-all"
                    style={autoBet.baccarat === null
                      ? { background: G.goldFaint, color: G.gold, border: `1px solid ${G.gold}` }
                      : { background: "transparent", color: G.textDim, border: `1px solid ${G.goldBorder}` }}
                  >없음</button>
                  {(["player", "banker", "tie", "random"] as const).map((opt) => {
                    const labels: Record<typeof opt, string> = { player: "플레이어", banker: "뱅커", tie: "타이", random: "랜덤" }
                    return (
                      <button key={opt}
                        onClick={() => setAutoBet(prev => ({ ...prev, baccarat: opt }))}
                        className="flex-1 px-1 py-1 rounded text-[10px] font-semibold transition-all"
                        style={autoBet.baccarat === opt
                          ? { background: G.goldFaint, color: G.gold, border: `1px solid ${G.gold}` }
                          : { background: "transparent", color: G.textDim, border: `1px solid ${G.goldBorder}` }}
                      >{labels[opt]}</button>
                    )
                  })}
                </div>
              </div>

              {/* 배팅 금액 */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] w-8 shrink-0" style={{ color: G.textDim }}>금액</span>
                <div className="flex gap-1 flex-1 flex-wrap">
                  {CHIPS.map(c => (
                    <button key={c.value}
                      onClick={() => setAutoBet(prev => ({ ...prev, amount: c.value }))}
                      className="px-2 py-1 rounded text-[10px] font-semibold transition-all"
                      style={autoBet.amount === c.value
                        ? { background: G.goldFaint, color: G.gold, border: `1px solid ${G.gold}` }
                        : { background: "transparent", color: G.textDim, border: `1px solid ${G.goldBorder}` }}
                    >{c.label}</button>
                  ))}
                </div>
              </div>

              {/* 종료 조건 */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] mb-1" style={{ color: G.textDim }}>최대 라운드 (빈 칸=무제한)</p>
                  <input
                    type="number" min={1} max={100}
                    value={autoBet.maxRounds ?? ""}
                    onChange={e => setAutoBet(prev => ({ ...prev, maxRounds: e.target.value === "" ? null : Number(e.target.value) }))}
                    placeholder="무제한"
                    className="w-full px-2 py-1.5 rounded text-[11px] font-semibold tabular-nums"
                    style={{ background: G.bgMuted, border: `1px solid ${G.goldBorder}`, color: G.text, outline: "none" }}
                  />
                </div>
                <div>
                  <p className="text-[10px] mb-1" style={{ color: G.textDim }}>손실 한도 ₩ (빈 칸=무제한)</p>
                  <input
                    type="number" min={0}
                    value={autoBet.maxLoss ?? ""}
                    onChange={e => setAutoBet(prev => ({ ...prev, maxLoss: e.target.value === "" ? null : Number(e.target.value) }))}
                    placeholder="무제한"
                    className="w-full px-2 py-1.5 rounded text-[11px] font-semibold tabular-nums"
                    style={{ background: G.bgMuted, border: `1px solid ${G.goldBorder}`, color: G.text, outline: "none" }}
                  />
                </div>
              </div>

              {/* ON/OFF 버튼 */}
              <button
                onClick={() => {
                  if (autoBet.enabled) {
                    setAutoBet(prev => ({ ...prev, enabled: false }))
                  } else {
                    autoBetRoundsRef.current = 0
                    autoBetPnlRef.current = 0
                    setAutoBetRounds(0)
                    setAutoBetPnl(0)
                    autoBetFiredRef.current = true
                    setAutoBet(prev => ({ ...prev, enabled: true }))
                  }
                }}
                className="w-full py-2.5 rounded-xl text-sm font-bold transition-all"
                style={autoBet.enabled
                  ? { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444" }
                  : { background: G.goldFaint, border: `1px solid ${G.gold}`, color: G.gold }}
              >
                {autoBet.enabled ? "자동 배팅 중단" : "자동 배팅 시작"}
              </button>
            </div>
          )}
        </div>

        {/* ── 바카라 종목 ── */}
        <div className="mb-3">
          <p className="text-[10px] font-bold mb-2 tracking-widest" style={{ color: G.goldDim }}>BACCARAT</p>
          <div className="grid grid-cols-3 gap-2">
            {(["player", "banker", "tie"] as const).map((side) => {
              const meta = LABEL_MAP[side]
              const isSelected = betBaccarat === side
              const payout = side === "player" ? "1:1" : side === "banker" ? "0.95:1" : "8:1"
              return (
                <button key={side}
                  onClick={() => openDialog("baccarat", side)}
                  disabled={!canBet || (betBaccarat !== null && !isSelected)}
                  className="py-3 rounded-xl text-[11px] font-bold flex flex-col items-center justify-center gap-1 transition-all active:scale-95 disabled:opacity-40"
                  style={{
                    background: isSelected ? meta.bg : "rgba(212,175,55,0.04)",
                    border: `1px solid ${isSelected ? meta.border : G.goldBorder}`,
                    color: isSelected ? meta.color : G.textDim,
                  }}>
                  <span>{meta.text}</span>
                  <span className="text-[8px] opacity-60">{payout}</span>
                  {isSelected && betBaccaratAmount > 0 && (
                    <span className="text-[9px]" style={{ color: meta.color }}>
                      ₩{betBaccaratAmount >= 10000 ? `${betBaccaratAmount / 10000}만` : betBaccaratAmount.toLocaleString()}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ── 기존 6종목 ── */}
        <div className="grid grid-cols-3 gap-2">
          {/* 롱 / 숏 */}
          <div className="flex flex-col gap-2">
            {(["long", "short"] as const).map((dir) => {
              const meta = LABEL_MAP[dir]
              const isSelected = betDirection === dir
              return (
                <button key={dir}
                  onClick={() => openDialog("direction", dir)}
                  disabled={!canBet || betDirection !== null}
                  className="h-14 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 disabled:opacity-40"
                  style={{
                    background: isSelected ? meta.bg : "rgba(212,175,55,0.04)",
                    border: `1px solid ${isSelected ? meta.border : G.goldBorder}`,
                    color: isSelected ? meta.color : G.textDim,
                  }}>
                  <div className="flex items-center gap-1">
                    {dir === "long" ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    <span>{dir === "long" ? "롱" : "숏"}</span>
                  </div>
                  {isSelected && betDirectionAmount > 0 && (
                    <span className="text-[9px]">
                      ₩{betDirectionAmount >= 10000 ? `${betDirectionAmount / 10000}만` : betDirectionAmount.toLocaleString()}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* 오버 / 언더 */}
          <div className="flex flex-col gap-2">
            {(["over", "under"] as const).map((dig) => {
              const meta = LABEL_MAP[dig]
              const isSelected = betDigit === dig
              return (
                <button key={dig}
                  onClick={() => openDialog("digit", dig)}
                  disabled={!canBet || betDigit !== null}
                  className="h-14 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 disabled:opacity-40"
                  style={{
                    background: isSelected ? meta.bg : "rgba(212,175,55,0.04)",
                    border: `1px solid ${isSelected ? meta.border : G.goldBorder}`,
                    color: isSelected ? meta.color : G.textDim,
                  }}>
                  <span>{dig === "over" ? "오버" : "언더"}</span>
                  <span className="text-[9px] opacity-60">{dig === "over" ? "5~9" : "0~4"}</span>
                  {isSelected && betDigitAmount > 0 && (
                    <span className="text-[9px]">
                      ₩{betDigitAmount >= 10000 ? `${betDigitAmount / 10000}만` : betDigitAmount.toLocaleString()}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          {/* 홀 / 짝 */}
          <div className="flex flex-col gap-2">
            {(["odd", "even"] as const).map((par) => {
              const meta = LABEL_MAP[par]
              const isSelected = betParity === par
              return (
                <button key={par}
                  onClick={() => openDialog("parity", par)}
                  disabled={!canBet || betParity !== null}
                  className="h-14 rounded-xl text-xs font-bold flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 disabled:opacity-40"
                  style={{
                    background: isSelected ? meta.bg : "rgba(212,175,55,0.04)",
                    border: `1px solid ${isSelected ? meta.border : G.goldBorder}`,
                    color: isSelected ? meta.color : G.textDim,
                  }}>
                  <span>{par === "odd" ? "홀" : "짝"}</span>
                  <span className="text-[9px] opacity-60">{par === "odd" ? "1·3·5·7·9" : "0·2·4·6·8"}</span>
                  {isSelected && betParityAmount > 0 && (
                    <span className="text-[9px]">
                      ₩{betParityAmount >= 10000 ? `${betParityAmount / 10000}만` : betParityAmount.toLocaleString()}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* 하단: 잔고 + 승패 */}
        <div className="flex items-center justify-between mt-3 pt-3" style={{ borderTop: `1px solid ${G.goldBorder}` }}>
          <span className="text-[11px]" style={{ color: G.textDim }}>
            {timeLeft <= 3 ? `다음 게임까지 ${timeLeft}초 전` : `다음 게임까지 ${timeLeft}초 전`}
          </span>
          <span className="text-[11px]">
            <span className="font-semibold" style={{ color: G.gold }}>{wins}승</span>
            <span style={{ color: G.textDim }}> / </span>
            <span className="font-semibold text-red-500">{losses}패</span>
          </span>
        </div>
      </div>

      {/* 다이얼로그 + 결과 시트 */}
      <BakaBetDialog
        open={dialog?.open ?? false}
        betType={dialog?.type ?? null}
        selectedValue={dialog?.value ?? null}
        onClose={() => setDialog(null)}
        onConfirm={handleConfirmBet}
        isLoading={isPlacingBet}
        balance={balance}
        locked={locked}
        lockedAmount={lockedAmount}
        onLockChange={(l, a) => { setLocked(l); setLockedAmount(a) }}
        canBet={canBet}
      />
      <BakaResultSheet
        result={lastResult}
        open={showResultSheet}
        onClose={() => setShowResultSheet(false)}
      />
    </>
  )
}
