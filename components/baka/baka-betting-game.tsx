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
  { label: "1만", value: 10_000 },
  { label: "5만", value: 50_000 },
  { label: "10만", value: 100_000 },
  { label: "50만", value: 500_000 },
  { label: "100만", value: 1_000_000 },
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
  long: { text: "롱", color: "#10b981", bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.4)" },
  short: { text: "숏", color: "#ef4444", bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.4)" },
  over: { text: "오버", color: "#f97316", bg: "rgba(249,115,22,0.15)", border: "rgba(249,115,22,0.4)" },
  under: { text: "언더", color: "#60a5fa", bg: "rgba(96,165,250,0.15)", border: "rgba(96,165,250,0.4)" },
  odd: { text: "홀", color: "#a78bfa", bg: "rgba(167,139,250,0.15)", border: "rgba(167,139,250,0.4)" },
  even: { text: "짝", color: "#ec4899", bg: "rgba(236,72,153,0.15)", border: "rgba(236,72,153,0.4)" },
  player: { text: "PLAYER", color: "#3b82f6", bg: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.4)" },
  banker: { text: "BANKER", color: "#ef4444", bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.4)" },
  tie: { text: "TIE", color: "#22c55e", bg: "rgba(34,197,94,0.15)", border: "rgba(34,197,94,0.4)" },
}

function getToken(): string | null {
  if (typeof window === "undefined") return null
  try { return localStorage.getItem("app_token") } catch { return null }
}

// ─── 비트코인 끝자리 계산 ────────────────────────────────────────────────────
// 소수점 2자리를 그대로 사용: 첫째 자리 = 뱅커, 둘째 자리 = 플레이어
// e.g. 74,087.39 → d1=3(뱅커), d2=9(플레이어)
// e.g. 70,628.08 → d1=0(뱅커), d2=8(플레이어)
function calcLastDigit(price: number): number {
  // 하위 호환: 단일 숫자가 필요한 곳에서는 d2(플레이어 자리) 반환
  const str = price.toFixed(2)
  const dec = str.split(".")[1] ?? "00"
  return parseInt(dec[1] ?? "0")
}

function calcBankerDigit(price: number): number {
  const str = price.toFixed(2)
  const dec = str.split(".")[1] ?? "00"
  return parseInt(dec[0] ?? "0")
}

function calcPlayerDigit(price: number): number {
  const str = price.toFixed(2)
  const dec = str.split(".")[1] ?? "00"
  return parseInt(dec[1] ?? "0")
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

  const lastDigit = calcPlayerDigit(result.closePrice)  // 소수점 둘째 자리 (플레이어 기준)
  const priceChange = result.closePrice - result.basePrice
  const isUp = priceChange >= 0

  const bets = [
    result.direction && {
      key: result.direction, label: LABEL_MAP[result.direction], won: result.wonDirection, amount: result.directionAmount,
      payout: result.wonDirection ? Math.floor(result.directionAmount * PAYOUT_RATIO) : 0
    },
    result.digit && {
      key: result.digit, label: LABEL_MAP[result.digit], won: result.wonDigit, amount: result.digitAmount,
      payout: result.wonDigit ? Math.floor(result.digitAmount * PAYOUT_RATIO) : 0
    },
    result.parity && {
      key: result.parity, label: LABEL_MAP[result.parity], won: result.wonParity, amount: result.parityAmount,
      payout: result.wonParity ? Math.floor(result.parityAmount * PAYOUT_RATIO) : 0
    },
    result.baccarat && {
      key: result.baccarat, label: LABEL_MAP[result.baccarat], won: result.wonBaccarat, amount: result.baccaratAmount,
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
                  비트바카������� {result.baccaratResult === "player" ? "PLAYER" : result.baccaratResult === "banker" ? "BANKER" : "TIE"}
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
  /** 0초 시점: page가 주입해 준 applyFinalDigit 트리거 (끝자리 가격 전체를 전달) */
  onFinalDigitTrigger?: (closingPrice: number) => void
  /** 바카라 배팅 확정 시 선택 사이드를 BaccaratGame에 전달 */
  onBetSideTrigger?: (side: "player" | "banker" | "tie" | null) => void
  /** timeLeft/phase 변경 시 page로 전달 */
  onStatusChange?: (timeLeft: number, phase: "betting" | "waiting" | "result" | "dealing") => void
  /** basePrice/currentPrice 변경 시 page로 전달 */
  onPriceChange?: (basePrice: number | null, currentPrice: number | null) => void
}

export function BakaBettingGame({ onStartDealTrigger, onFinalDigitTrigger, onBetSideTrigger, onStatusChange, onPriceChange }: BakaBettingGameProps = {}) {
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
  // 실시간 배당률 (SSE - 배팅 즉시 반영, 폴링 없음)
  const [liveOdds, setLiveOdds] = useState<{ player: number; banker: number; tie: number } | null>(null)

  useEffect(() => {
    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let destroyed = false

    const connect = () => {
      if (destroyed) return
      const token = getToken()
      const url = `/api/game/odds/stream?type=baccarat${token ? `&token=${token}` : ""}`
      es = new EventSource(url)
      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data.odds) setLiveOdds(data.odds)
          else setLiveOdds(null)
        } catch {}
      }
      es.onerror = () => {
        es?.close()
        if (!destroyed) retryTimer = setTimeout(connect, 2000)
      }
    }

    connect()
    return () => {
      destroyed = true
      if (retryTimer) clearTimeout(retryTimer)
      es?.close()
    }
  }, [])

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
  // closing 트리거 중복 방지 (같은 라운드에 baka:closing이 여러 번 와도 1회만 처리)
  const closingTriggeredRoundRef = useRef<number>(-1)

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
      .catch(() => { })
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

  // baka:closing 이벤트 직접 구독 — Railway type:"closing" 단일 소스
  // 패널(ClosingPrices)도 동일한 이벤트를 구독하므로 카드와 패널이 항상 같은 가격을 씀
  const handleClosingPrice = useCallback((price: number, time: number) => {
    // 같은 라운드에 closing이 중복으로 오는 경우 무시 (Railway + bitcoin-chart 이중 발행 방어)
    const thisRound = Math.floor(time / 30)
    if (closingTriggeredRoundRef.current === thisRound) return
    closingTriggeredRoundRef.current = thisRound

    const closePrice = price

    // 소수점 2자리 toFixed 파싱 → 부동소수점 오차 없음
    const decStr = closePrice.toFixed(2).split(".")[1] ?? "00"
    const d1 = parseInt(decStr[0] ?? "0")   // 소수점 첫째 자리 → 뱅커
    const d2 = parseInt(decStr[1] ?? "0")   // 소수점 둘째 자리 → 플레이어

    // 0~4=player, 5~8=banker, 9=tie
    const serverBacResult: "player" | "banker" | "tie" =
      d2 <= 4 ? "player" : d2 <= 8 ? "banker" : "tie"

    // 3번째 카드: 패널과 동일한 마감가로 전달
    onFinalDigitTrigger?.(closePrice)

    // 배팅 기준가 스냅샷
    const snapshotBase = basePriceRef.current
    const effectiveBase = snapshotBase ?? closePrice

    // 2) 매 라운드 DB 저장 (빅로드용, 배팅 무관)
    fetch("/api/rounds/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ basePrice: effectiveBase, closePrice, baccaratResult: serverBacResult }),
    }).catch(() => { })

    // 4) 배팅 없으면 기준가 업데이트 후 종료
    const hasBet = betRef.current || betDigitRef.current || betParityRef.current || betBaccaratRef.current
    if (!hasBet) {
      setBasePrice(price)
      basePriceRef.current = price
      return
    }

    const wonDirection = betRef.current
      ? (betRef.current === "long" ? closePrice >= effectiveBase : closePrice < effectiveBase)
      : false
    const wonDigit = betDigitRef.current
      ? (betDigitRef.current === "under" ? d2 <= 4 : d2 >= 5)
      : false
    const wonParity = betParityRef.current
      ? (betParityRef.current === "odd" ? d2 % 2 !== 0 : d2 % 2 === 0)
      : false

    // 정산 함수 — bacResult: 확정된 바카라 결과 (없으면 null)
    const settle = (bacResult: "player" | "banker" | "tie" | null) => {
      const wonBaccarat = betBaccaratRef.current ? betBaccaratRef.current === bacResult : false
      const baccaratRefund = !wonBaccarat && bacResult === "tie"
        && (betBaccaratRef.current === "player" || betBaccaratRef.current === "banker")

      // 서버 정산 API
      const token = getToken()
      if (token) {
        fetch("/api/user/game/play", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            basePrice: effectiveBase,
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
        }).catch(() => { })
      }

      const result: RoundResult = {
        round: roundRef.current,
        direction: betRef.current,
        digit: betDigitRef.current,
        parity: betParityRef.current,
        baccarat: betBaccaratRef.current,
        baccaratResult: bacResult,
        basePrice: effectiveBase,
        closePrice,
        wonDirection, wonDigit, wonParity, wonBaccarat, baccaratRefund,
        directionAmount: betDirectionAmountRef.current,
        digitAmount: betDigitAmountRef.current,
        parityAmount: betParityAmountRef.current,
        baccaratAmount: betBaccaratAmountRef.current,
      }
      setLastResult(result)
      setShowResultSheet(true)

      const anyWon = (betRef.current && wonDirection) || (betDigitRef.current && wonDigit)
        || (betParityRef.current && wonParity) || (betBaccaratRef.current && wonBaccarat)
      const anyLost = (betRef.current && !wonDirection) || (betDigitRef.current && !wonDigit)
        || (betParityRef.current && !wonParity)
        || (betBaccaratRef.current && !wonBaccarat && !baccaratRefund)
      if (anyWon) setWins(w => w + 1)
      if (anyLost) setLosses(l => l + 1)
      setPhase("result")

      // 베팅 상태 초기화 (다음 라운드 준비)
      betRef.current = null; betDigitRef.current = null
      betParityRef.current = null; betBaccaratRef.current = null
      betDirectionAmountRef.current = 0; betDigitAmountRef.current = 0
      betParityAmountRef.current = 0; betBaccaratAmountRef.current = 0
      setBetDirection(null); setBetDigit(null); setBetParity(null); setBetBaccarat(null)
      setBetDirectionAmount(0); setBetDigitAmount(0); setBetParityAmount(0); setBetBaccaratAmount(0)

      // 기준가를 마감가로 교체 (다음 라운드 시작)
      setBasePrice(price); basePriceRef.current = price
      setDialog(null)
      setTimeout(() => setPhase("betting"), 800)  // 1500→800ms
    }

    // 5) 정산 타이밍:
    //    - 바카라 배팅 있음: baccarat:deal-complete 이벤트 수신 즉시 정산
    //      (applyFinalDigit 완료 시점이 정확히 전달됨 → 고정 딜레이 불필요)
    //    - 바카라 배팅 없음: 카드 연출과 무관, 즉시 정산
    if (betBaccaratRef.current) {
      const onDealComplete = (e: Event) => {
        window.removeEventListener("baccarat:deal-complete", onDealComplete)
        // applyFinalDigit이 실제 카드 점수로 계산한 결과 사용
        const actualResult = (e as CustomEvent).detail?.result as "player" | "banker" | "tie" | undefined
        settle(actualResult ?? serverBacResult)
      }
      window.addEventListener("baccarat:deal-complete", onDealComplete)
      // 안전 타임아���: 이벤트 미수신 시 1200ms 후 강제 정산 (폴백)
      setTimeout(() => {
        window.removeEventListener("baccarat:deal-complete", onDealComplete)
        settle(serverBacResult)
      }, 1200)
    } else {
      settle(null)  // 즉시 정산 (������라 외 ���목)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFinalDigitTrigger])

  usePriceWorker({
    onPrice: useCallback((price: number) => {
      setCurrentPrice(price)
      currentPriceRef.current = price
    }, []),
    // Railway closing은 baka:closing 이벤트로 통합됐으므로 여기서는 무시
    onInitClosing: useCallback((prices: Array<{ time: number; price: number }>) => {
      if (prices.length > 0 && !betRef.current && !betDigitRef.current && !betParityRef.current && !betBaccaratRef.current) {
        const latest = prices[prices.length - 1].price
        setBasePrice(latest)
        basePriceRef.current = latest
      }
    }, []),
  })

  // baka:closing 이벤트 구독 — bitcoin-chart.tsx k.x===true 공식 종가 = 패널과 동일 소스
  useEffect(() => {
    const handler = (e: Event) => {
      const { price, time } = (e as CustomEvent<{ price: number; time: number }>).detail
      handleClosingPrice(price, time)
    }
    window.addEventListener("baka:closing", handler)
    return () => window.removeEventListener("baka:closing", handler)
  }, [handleClosingPrice])

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

  // autoBet state → ref 초기화
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

      ; (async () => {
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

      const betSide = dialog.type === "baccarat" ? dialog.value : undefined
      const res = await fetch("/api/user/game/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          betAmount: amount,
          ...(betSide ? { gameType: "baccarat", side: betSide } : {}),
        }),
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

  // basePrice/currentPrice 변경 시 page로 전달
  useEffect(() => {
    onPriceChange?.(basePrice, currentPrice)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [basePrice, currentPrice])

  // timeLeft/phase 변경 시 page로 전달
  useEffect(() => {
    const phaseStatus = timeLeft > 15 ? "betting" : timeLeft > 0 ? "dealing" : phase
    onStatusChange?.(timeLeft, phaseStatus as "betting" | "waiting" | "result" | "dealing")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, phase])

  const priceDiff = currentPrice !== null && basePrice !== null ? currentPrice - basePrice : null
  const isUp = priceDiff !== null && priceDiff >= 0
  const timerPercent = (timeLeft / 30) * 100
  const timerColor = timeLeft > 15 ? "#10b981" : timeLeft > 3 ? "#f97316" : "#ef4444"
  const timerLabel = timeLeft > 15 ? "배팅 가능" : timeLeft > 0 ? "딜링 중" : "정산 중"

  return (
    <>
      <div style={{
        background: "rgba(8,20,12,0.98)",
        borderRadius: 16,
        padding: "14px 16px",
        border: "1px solid rgba(212,175,55,0.2)",
        boxShadow: "0 4px 32px rgba(0,0,0,0.6)",
      }}>

        {/* ── 헤더: 배팅 + 라운드 + 자동배팅 버튼 + 타이머 (한 줄) ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          {/* 좌: 타이틀 + 라운드 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: G.gold, letterSpacing: "0.06em", margin: 0 }}>배팅</h3>
            <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 5, background: G.goldFaint, color: G.goldDim, fontWeight: 600 }}>
              #{roundNumber}
            </span>
          </div>
          {/* 우: 자동배팅 버튼 + 타이머 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button
              onClick={() => setAutoBetOpen(o => !o)}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 8,
                background: autoBet.enabled ? "rgba(212,175,55,0.14)" : G.bgMuted,
                border: `1px solid ${autoBet.enabled ? G.gold : G.goldBorder}`,
                cursor: "pointer",
              }}
            >
              <Bot style={{ width: 12, height: 12, color: autoBet.enabled ? G.gold : G.goldDim }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: autoBet.enabled ? G.gold : G.goldDim }}>자동배팅</span>
              {autoBet.enabled && (
                <span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, background: G.gold, color: "#000", fontWeight: 800 }}>ON</span>
              )}
              {autoBetOpen
                ? <ChevronUp style={{ width: 10, height: 10, color: G.textDim }} />
                : <ChevronDown style={{ width: 10, height: 10, color: G.textDim }} />}
            </button>

          </div>
        </div>

        {/* 자동 배팅 설정 패널 */}
        <div>

          {/* 설정 패널 */}
          {autoBetOpen && (
            <div className="mt-2 rounded-xl p-3 space-y-3" style={{ background: G.bgMuted, border: `1px solid ${G.goldBorder}` }}>

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
                    const labels: Record<typeof opt, string> = { player: "플레이���", banker: "��커", tie: "타이", random: "랜덤" }
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
        <div className="mb-1.5">
          <div className="grid grid-cols-3 gap-1.5">
            {(["banker", "tie", "player"] as const).map((side) => {
              const isSelected = betBaccarat === side
              const oddsVal = liveOdds
                ? (side === "player" ? liveOdds.player : side === "banker" ? liveOdds.banker : liveOdds.tie)
                : null
              const payout = oddsVal !== null ? `${oddsVal.toFixed(2)}:1` : "-"
              const label = side === "banker" ? "뱅커" : side === "tie" ? "타이" : "플레이어"
              const solidColor = side === "banker" ? "#ef4444" : side === "tie" ? "#22c55e" : "#3b82f6"
              const solidBg = side === "banker" ? "rgba(239,68,68,0.85)" : side === "tie" ? "rgba(34,197,94,0.85)" : "rgba(59,130,246,0.85)"
              const dimBg = side === "banker" ? "rgba(239,68,68,0.35)" : side === "tie" ? "rgba(34,197,94,0.35)" : "rgba(59,130,246,0.35)"
              const dimBorder = side === "banker" ? "rgba(239,68,68,0.7)" : side === "tie" ? "rgba(34,197,94,0.7)" : "rgba(59,130,246,0.7)"
              return (
                <button key={side}
                  onClick={() => openDialog("baccarat", side)}
                  disabled={!canBet || (betBaccarat !== null && !isSelected)}
                  className="rounded-2xl font-bold flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 disabled:opacity-40"
                  style={{
                    height: 64,
                    background: isSelected ? solidBg : canBet ? dimBg : "rgba(255,255,255,0.04)",
                    border: `2px solid ${isSelected ? solidColor : canBet ? dimBorder : "rgba(255,255,255,0.1)"}`,
                    color: "#fff",
                  }}>
                  <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "0.03em" }}>{label}</span>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.75)" }}>{payout}</span>
                  {isSelected && betBaccaratAmount > 0 && (
                    <span style={{ fontSize: 10, color: "#fff", fontWeight: 700 }}>
                      ₩{betBaccaratAmount >= 10000 ? `${betBaccaratAmount / 10000}만` : betBaccaratAmount.toLocaleString()}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
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
