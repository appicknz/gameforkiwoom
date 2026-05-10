"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { TrendingUp, TrendingDown, Clock, X, RotateCcw, Lock, Unlock, Bot, ChevronDown, ChevronUp, Shuffle } from "lucide-react"
import { usePriceWorker } from "@/hooks/use-price-worker"
import { useGatewayOdds } from "@/hooks/use-gateway"

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
  directionAmount: number
  digitAmount: number
  parityAmount: number
  baccaratAmount: number
  // 정산 시점의 실시간 LP 배당률 스냅샷
  baccaratOdds: { player: number; banker: number; tie: number } | null
  // 서버 settle-me가 계산한 최종 payout (백원 단위 내림 적용)
  serverPayout?: number
  // 카드 합산 끝자리 점수 (표시용)
  pScore?: number
  bScore?: number
  pRawSum?: number   // 플레이어 합산 전체 (끝자리 강조 표시용)
  bRawSum?: number   // 뱅커 합산 전체
  playerCards?: { label: string; suit: string; value: number }[]
  bankerCards?: { label: string; suit: string; value: number }[]
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

  const priceChange = result.closePrice - result.basePrice
  const isUp = priceChange >= 0

  // 바카라 배팅 정보
  const bacOdds = result.baccaratOdds
    ? (result.baccarat === "player" ? result.baccaratOdds.player
      : result.baccarat === "banker" ? result.baccaratOdds.banker
      : result.baccaratOdds.tie)
    : null
  const bacPayout = result.wonBaccarat
    ? (typeof result.serverPayout === "number" && result.serverPayout > 0
        ? result.serverPayout
        : bacOdds ? Math.floor((result.baccaratAmount * bacOdds) / 100) * 100 : 0)
    : 0

  // 비바카라 배팅 (롱/숏, 오버/언더, 홀/짝)
  const sideBets = [
    result.direction && { key: result.direction, label: LABEL_MAP[result.direction], won: result.wonDirection, amount: result.directionAmount,
      payout: result.wonDirection ? Math.floor(result.directionAmount * PAYOUT_RATIO / 100) * 100 : 0 },
    result.digit && { key: result.digit, label: LABEL_MAP[result.digit], won: result.wonDigit, amount: result.digitAmount,
      payout: result.wonDigit ? Math.floor(result.digitAmount * PAYOUT_RATIO / 100) * 100 : 0 },
    result.parity && { key: result.parity, label: LABEL_MAP[result.parity], won: result.wonParity, amount: result.parityAmount,
      payout: result.wonParity ? Math.floor(result.parityAmount * PAYOUT_RATIO / 100) * 100 : 0 },
  ].filter(Boolean) as { key: string; label: { text: string; color: string; bg: string }; won: boolean; amount: number; payout: number }[]

  // 승패 헤더
  const hasBaccarat = !!result.baccarat
  const won = hasBaccarat ? result.wonBaccarat : sideBets.some(b => b.won)
  const headerLabel = won ? "WIN" : "LOSS"
  const headerColor = won ? G.gold : "#ef4444"
  const headerBg    = won ? "rgba(212,175,55,0.08)" : "rgba(239,68,68,0.08)"

  // 결과쪽 이긴 포지션 레이블
  const winnerLabel = result.baccaratResult ? LABEL_MAP[result.baccaratResult] : null

  return (
    <>
      <div className="fixed inset-0 z-40" style={{ background: "rgba(0,0,0,0.7)" }} onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl shadow-2xl max-w-lg mx-auto"
        style={{ background: "linear-gradient(180deg,#1a1506,#0d0b04)", border: "1px solid rgba(212,175,55,0.3)", borderBottom: "none" }}>

        {/* 헤더 */}
        <div className="px-5 pt-5 pb-4 flex items-center justify-between" style={{ background: headerBg }}>
          <div>
            <p className="text-[11px] mb-0.5" style={{ color: G.textDim }}>라운드 #{result.round} 결과</p>
            <p className="text-3xl font-black tracking-tight" style={{ color: headerColor }}>{headerLabel}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-[11px]" style={{ color: G.textDim }}>
                {isUp ? "▲" : "▼"} ${Math.abs(priceChange).toFixed(1)}
              </span>
              {/* 이긴 포지션 배지 */}
              {winnerLabel && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md"
                  style={{ background: winnerLabel.bg, color: winnerLabel.color }}>
                  {winnerLabel.text} WIN
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} style={{ color: G.textDim }}><X className="w-5 h-5" /></button>
        </div>

        <div className="px-5 py-4 space-y-3">

          {/* 바카라 점수 카드 — 카드 목록 + 합산 + 끝자리 강조 */}
          {hasBaccarat && (
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${G.goldBorder}` }}>
              <div className="grid grid-cols-2 divide-x" style={{ divideColor: G.goldBorder }}>
                {/* BANKER */}
                {[
                  { side: "banker" as const, cards: result.bankerCards, rawSum: result.bRawSum, score: result.bScore },
                  { side: "player" as const, cards: result.playerCards, rawSum: result.pRawSum, score: result.pScore },
                ].map(({ side, cards, rawSum, score }) => {
                  const isWinner = result.baccaratResult === side
                  const isTie = result.baccaratResult === "tie"
                  const lbl = LABEL_MAP[side]
                  const rawStr = String(rawSum ?? score ?? 0)
                  // 끝자리 강조: "12" → "1" + "2(강조)"
                  const frontDigits = rawStr.slice(0, -1)
                  const lastDigit   = rawStr.slice(-1)
                  return (
                    <div key={side} className="p-3 text-center"
                      style={{ background: isWinner || isTie ? "rgba(212,175,55,0.05)" : "rgba(0,0,0,0.2)" }}>
                      {/* 포지션 + WIN 뱃지 */}
                      <div className="flex items-center justify-center gap-1.5 mb-2">
                        <p className="text-[11px] font-black tracking-wider" style={{ color: lbl.color }}>
                          {side.toUpperCase()}
                        </p>
                        {(isWinner || isTie) && (
                          <span className="text-[9px] font-black px-1.5 py-0.5 rounded"
                            style={{ background: isTie ? LABEL_MAP.tie.bg : lbl.bg, color: isTie ? LABEL_MAP.tie.color : lbl.color }}>
                            {isTie ? "TIE" : "WIN"}
                          </span>
                        )}
                      </div>
                      {/* 카드 목록 */}
                      {cards && cards.length > 0 && (
                        <div className="flex items-center justify-center gap-1 mb-2 flex-wrap">
                          {cards.map((c, i) => {
                            const isRed = c.suit === "♥" || c.suit === "♦"
                            return (
                              <div key={i} className="flex flex-col items-center justify-center rounded-md w-7 h-9 text-[10px] font-black"
                                style={{ background: "#fff", color: isRed ? "#dc2626" : "#111", border: "1px solid #ddd" }}>
                                <span style={{ lineHeight: 1 }}>{c.label}</span>
                                <span style={{ lineHeight: 1, fontSize: 9 }}>{c.suit}</span>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      {/* 합산 = 앞자리(dim) + 끝자리(강조) */}
                      <div className="flex items-end justify-center gap-0" style={{ lineHeight: 1 }}>
                        {frontDigits && (
                          <span className="text-xl font-black tabular-nums" style={{ color: G.textDim }}>
                            {frontDigits}
                          </span>
                        )}
                        <span className="font-black tabular-nums"
                          style={{ fontSize: 32, color: isWinner || isTie ? lbl.color : G.textDim }}>
                          {lastDigit}
                        </span>
                      </div>
                      <p className="text-[9px] mt-0.5" style={{ color: G.textDim }}>합산 끝자리</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* 바카라 배팅 결과 */}
          {result.baccarat && (
            <div className="flex items-center gap-3 p-3 rounded-xl"
              style={{
                background: result.wonBaccarat ? "rgba(212,175,55,0.06)" : "rgba(239,68,68,0.06)",
                border: `1px solid ${result.wonBaccarat ? "rgba(212,175,55,0.2)" : "rgba(239,68,68,0.2)"}`,
              }}>
              {/* 배팅 포지션 배지 */}
              <span className="text-sm font-bold px-2.5 py-1 rounded-lg shrink-0"
                style={{ background: LABEL_MAP[result.baccarat].bg, color: LABEL_MAP[result.baccarat].color }}>
                {LABEL_MAP[result.baccarat].text}
              </span>
              {/* 배팅액 + 배율 */}
              <div className="flex-1 min-w-0">
                <p className="text-[10px]" style={{ color: G.textDim }}>배팅</p>
                <p className="text-base font-bold tabular-nums" style={{ color: G.text }}>
                  ₩{result.baccaratAmount.toLocaleString()}
                </p>
                {bacOdds && (
                  <p className="text-[11px] font-bold tabular-nums" style={{ color: G.gold }}>{bacOdds.toFixed(2)}x</p>
                )}
              </div>
              {/* 총수령액 or 손실 */}
              <div className="text-right shrink-0">
                {result.wonBaccarat ? (
                  <>
                    <p className="text-[10px]" style={{ color: G.textDim }}>총수령</p>
                    <p className="text-lg font-black tabular-nums" style={{ color: G.gold }}>
                      ₩{bacPayout.toLocaleString()}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[10px]" style={{ color: G.textDim }}>손실</p>
                    <p className="text-base font-bold tabular-nums" style={{ color: "#ef4444" }}>
                      -₩{result.baccaratAmount.toLocaleString()}
                    </p>
                  </>
                )}
              </div>
              {/* 승/패 뱃지 */}
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-black"
                style={{ background: result.wonBaccarat ? G.gold : "#ef4444", color: "#000" }}>
                {result.wonBaccarat ? "승" : "패"}
              </div>
            </div>
          )}

          {/* 비바카라 배팅들 */}
          {sideBets.map((bet) => (
            <div key={bet.key} className="flex items-center gap-3 p-3 rounded-xl"
              style={{
                background: bet.won ? "rgba(212,175,55,0.06)" : "rgba(239,68,68,0.06)",
                border: `1px solid ${bet.won ? "rgba(212,175,55,0.2)" : "rgba(239,68,68,0.2)"}`,
              }}>
              <span className="text-sm font-bold px-2.5 py-1 rounded-lg shrink-0"
                style={{ background: bet.label.bg, color: bet.label.color }}>
                {bet.label.text}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px]" style={{ color: G.textDim }}>배팅</p>
                <p className="text-base font-bold tabular-nums" style={{ color: G.text }}>
                  ₩{bet.amount.toLocaleString()}
                </p>
              </div>
              <div className="text-right shrink-0">
                {bet.won ? (
                  <>
                    <p className="text-[10px]" style={{ color: G.textDim }}>총수령</p>
                    <p className="text-lg font-black tabular-nums" style={{ color: G.gold }}>
                      ₩{bet.payout.toLocaleString()}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[10px]" style={{ color: G.textDim }}>손실</p>
                    <p className="text-base font-bold tabular-nums" style={{ color: "#ef4444" }}>
                      -₩{bet.amount.toLocaleString()}
                    </p>
                  </>
                )}
              </div>
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-black"
                style={{ background: bet.won ? G.gold : "#ef4444", color: "#000" }}>
                {bet.won ? "승" : "패"}
              </div>
            </div>
          ))}

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
  /** 30초(라운드 전환) 시점: 카드 리셋 트리거 — BaccaratGame에 새 라운드 준비 요청 */
  onResetCards?: () => void
  /** 25초 시�����: 카드 공개 + 배팅 오픈 트리거 */
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

export function BakaBettingGame({ onResetCards, onStartDealTrigger, onFinalDigitTrigger, onBetSideTrigger, onStatusChange, onPriceChange }: BakaBettingGameProps = {}) {
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
  const lastResultRef = useRef<RoundResult | null>(null)
  useEffect(() => { lastResultRef.current = lastResult }, [lastResult])
  // baccarat:deal-complete 결과를 미리 캐싱 — settle()이 리스너 등록 전에 이벤트가 올 수 있음
  const dealCompleteResultRef = useRef<"player" | "banker" | "tie" | null>(null)
  const dealCompleteScoreRef  = useRef<{ pScore: number; bScore: number } | null>(null)
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [balance, setBalance] = useState<number | null>(null)
  const [showResultSheet, setShowResultSheet] = useState(false)
  const [dialog, setDialog] = useState<{ open: boolean; type: BetType; value: string } | null>(null)
  const [isPlacingBet, setIsPlacingBet] = useState(false)
  const [locked, setLocked] = useState(false)
  const [lockedAmount, setLockedAmount] = useState<number | null>(null)
  // 실시간 배당률 (SSE - 배팅 즉시 반영, 폴링 없음)
  const [liveOdds, setLiveOdds] = useState<{
    player: number | null; banker: number | null; tie: number | null
    available?: boolean
    lpWeight?: number; mode?: "seeded" | "decay" | "natural" | "pending"
  } | null>(null)

  // canBet 상태를 ref로 추적 — SSE 클로저 안에서 최신 값 참조용
  const canBetRef = useRef(false)

  // Railway WS 게이트웨이로 baccarat odds 구독
  // available인 odds는 배팅 구간 여부에 관계없이 항상 state 반영
  useGatewayOdds("baccarat", (data: unknown) => {
    const d = data as { odds?: typeof liveOddsRef.current }
    if (d.odds) {
      liveOddsRef.current = d.odds
      // available=true인 odds는 항상 표시 (배팅 구간 외에도 직전 배당 유지)
      if (d.odds.available !== false) setLiveOdds(d.odds)
    }
  })

  // 마운트 시 현재 odds 즉시 조회 (canBet 상태와 무관하게 초기값 채움)
  useEffect(() => {
    const token = getToken()
    fetch("/api/game/odds?type=baccarat", {
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

  // ── 마운트 시 활성 배팅 복원 (새로고침 대응) ─────────────────
  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetch("/api/user/game/bet?type=baccarat", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.activeBet) return
        const { roundNumber, side, amount, oddsAtBet } = data.activeBet
        // 현재 라운드와 동일한 배팅만 복원 (이미 지난 라운드는 무시)
        const nowRound = Math.floor(Date.now() / 1000 / 30)
        if (roundNumber !== nowRound) return

        // baccarat 배팅 복원
        if (side === "player" || side === "banker" || side === "tie") {
          betBaccaratRef.current = side
          betBaccaratAmountRef.current = amount
          setBetBaccarat(side)
          setBetBaccaratAmount(amount)
          betRoundNumberRef.current = roundNumber
          if (oddsAtBet) {
            liveOddsSnapshotRef.current = oddsAtBet
            dbgBetRef.current = {
              round: roundNumber,
              side,
              amount,
              oddsAtBet: oddsAtBet[side] ?? null,
              oddsSnap: oddsAtBet,
            }
          }
        }
      })
      .catch(() => {})
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
  const betBaccaratAmountRef  = useRef(0)
  const betRoundNumberRef     = useRef(0)   // 배팅 시점 roundNumber 보존 (정산 시 라운드 경계 문제 방지)
  const liveOddsSnapshotRef   = useRef<typeof liveOdds>(null)  // 배팅 ���점 odds 스냅샷 (라운드 종료 후 초기화되기 전 값)
  const liveOddsRef           = useRef<typeof liveOdds>(null)  // 항상 최신 liveOdds를 가리키는 ref (클로저 stale 방지)
  const frozenOddsRef         = useRef<typeof liveOdds>(null)  // 배팅 마감 순간 확정 배�� 스냅샷
  // 디버그용: 배팅 완료 시점에 저장, LOG 2/3에서 재사용
  const dbgBetRef = useRef<{ round: number; side: BetBaccarat; amount: number; oddsAtBet: number | null | undefined; oddsSnap: typeof liveOdds } | null>(null)
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
    const d1 = parseInt(decStr[0] ?? "0")   // 소수점 첫째 자리 → 뱅커 점수
    const d2 = parseInt(decStr[1] ?? "0")   // 소수점 둘째 자리 → 플레이어 점수

    // 9에 가까운 쪽이 이김: d1=뱅커, d2=플레이어, 같으면 타이
    const serverBacResult: "player" | "banker" | "tie" =
      d1 === d2 ? "tie" : d1 > d2 ? "banker" : "player"

    // 3번째 카드: 패널과 동일한 마감가로 전달
    onFinalDigitTrigger?.(closePrice)

    // 배팅 기준가 스냅샷
    const snapshotBase = basePriceRef.current
    const effectiveBase = snapshotBase ?? closePrice

    // 2) 매 라운드 DB 저장 (빅로드용, 배팅 무관)
    // 가격/시간 저장은 price-server(Railway)에서 직접 수행
    // 카드 연출 완료 후 점수만 upsert (클라이언트만 카드 점수를 알 수 있음)
    // 매 라운드 시작 시 캐시 초기화
    dealCompleteResultRef.current = null
    dealCompleteScoreRef.current  = null
    const onDealForScore = (ev: Event) => {
      window.removeEventListener("baccarat:deal-complete", onDealForScore)
      const { result, pScore, bScore, pRawSum, bRawSum, playerCards, bankerCards } = (ev as CustomEvent<{
        result: "player" | "banker" | "tie"; pScore: number; bScore: number; pRawSum: number; bRawSum: number
        playerCards: { label: string; suit: string; value: number }[]
        bankerCards: { label: string; suit: string; value: number }[]
      }>).detail
      dealCompleteResultRef.current = result
      dealCompleteScoreRef.current = { pScore, bScore }
      // DB 저장 (빅로드용)
      fetch("/api/closing-price", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price: closePrice, time, baccarat_result: result, b_score: bScore, p_score: pScore, b_raw_sum: bRawSum, p_raw_sum: pRawSum }),
      }).catch(() => { })
      // 바카라 배팅이 있으면 여기서 바로 정산
      if (betBaccaratRef.current) {
        settle(result, pScore, bScore, pRawSum, bRawSum, playerCards, bankerCards)
      }
    }
    window.addEventListener("baccarat:deal-complete", onDealForScore)
    setTimeout(() => window.removeEventListener("baccarat:deal-complete", onDealForScore), 5000)

    fetch("/api/rounds/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ basePrice: effectiveBase, closePrice, baccaratResult: serverBacResult }),
    }).catch(() => { })

    // 4) 배팅 없으면 기준가 업���이트 후 종료
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

    // 정산 함수 — bacResult: 카드 합산 끝자리 결과, pScore/bScore: 합산 끝자리 숫자
    const settle = (
      bacResult: "player" | "banker" | "tie" | null,
      pScore?: number, bScore?: number,
      pRawSum?: number, bRawSum?: number,
      playerCards?: { label: string; suit: string; value: number }[],
      bankerCards?: { label: string; suit: string; value: number }[],
    ) => {
      const wonBaccarat = betBaccaratRef.current ? betBaccaratRef.current === bacResult : false
      const baccaratRefund = false  // /baka: 타이 결과 시 player/banker는 LOSS, 반환 없음

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
        // 서버 확정 배당을 받은 후 채워짐 — null로 초기화해 깜빡임 방지
        baccaratOdds: null,
        pScore,
        bScore,
        pRawSum,
        bRawSum,
        playerCards,
        bankerCards,
      }
      setLastResult(result)
      // 바카라 배팅이 없으면 즉시 표시, 있으면 settle-me 응답 후 표시해 배당 깜빡임 방지
      const hasBaccaratBet = !!betBaccaratRef.current
      if (!hasBaccaratBet) setShowResultSheet(true)

      const anyWon = (betRef.current && wonDirection) || (betDigitRef.current && wonDigit)
        || (betParityRef.current && wonParity) || (betBaccaratRef.current && wonBaccarat)
      const anyLost = (betRef.current && !wonDirection) || (betDigitRef.current && !wonDigit)
        || (betParityRef.current && !wonParity)
        || (betBaccaratRef.current && !wonBaccarat)
      if (anyWon) setWins(w => w + 1)
      if (anyLost) setLosses(l => l + 1)
      setPhase("result")

      // 서버 정산 호출 — Railway 유무와 무관하게 클라이언트가 직접 실행
      // 배팅이 있는 경우���만 호출 (잔고 반영)
      const token = getToken()
      const resolvedRoundNumber = betRoundNumberRef.current || getRoundNumber()
      const snapshotPlayer = liveOddsSnapshotRef.current?.player
      const appliedOddsForSide = betBaccaratRef.current === "player" ? snapshotPlayer
        : betBaccaratRef.current === "banker" ? liveOddsSnapshotRef.current?.banker
        : liveOddsSnapshotRef.current?.tie
      // ── LOG 3: 게임 결과 ─────────────────────────────────────
      if (dbgBetRef.current) {
        const dbg = dbgBetRef.current
        const oddsAtBet = dbg.oddsAtBet
        const expected = wonBaccarat && oddsAtBet ? Math.floor(dbg.amount * oddsAtBet / 1000) * 1000 : 0
        console.log(`%c[게임결과] 라운드#${resolvedRoundNumber}`, "color:#81c784;font-weight:bold", {
          betSide: dbg.side,
          result: bacResult,
          won: wonBaccarat,
          betAmount: dbg.amount,
          "① 배팅시점odds": oddsAtBet,
          expectedPayout: expected,
          expectedNetProfit: expected - dbg.amount,
          note: "서버 settle-me 응답 대기 중...",
        })
      }

      if (token) {
        fetch("/api/game/settle-me", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            closePrice,
            basePrice: effectiveBase,
            roundNumber: resolvedRoundNumber,
            gameType: "baccarat",
            baccaratResult: bacResult,
            pScore,   // 플레이어 합산 끝자리 — 서버 승패 판정에 사용
            bScore,   // 뱅커 합산 끝자리 — 서버 승패 판정에 사용
          }),
        })
          .then(async r => {
            const text = await r.text()
            return JSON.parse(text)
          })
          .then(d => {
            // ── LOG 3-2: 서버 정산 응답 (게임결과 로그와 비교) ───
            const betSide = lastResultRef.current?.baccarat
            const betAmount = lastResultRef.current?.baccaratAmount ?? 0
            const serverOddsForSide = betSide && d.appliedOdds ? d.appliedOdds[betSide] : null
            // dbgBetRef에 배팅 완료 시점 odds가 보존되어 있음 (liveOddsSnapshotRef는 라운드 초기화로 null 가능)
            const clientOddsAtBet = dbgBetRef.current?.side === betSide
              ? dbgBetRef.current?.oddsAtBet ?? null
              : null
            const expectedByServerOdds = serverOddsForSide ? Math.floor(betAmount * serverOddsForSide / 1000) * 1000 : 0
            const oddsMatch = clientOddsAtBet != null && serverOddsForSide != null
              ? Math.abs(clientOddsAtBet - serverOddsForSide) < 0.01
              : null
            console.log(`%c[서버정산] 라운드#${resolvedRoundNumber}`, oddsMatch === false ? "color:#e57373;font-weight:bold" : "color:#ce93d8;font-weight:bold", {
              betSide,
              betAmount,
              "① 배팅시점odds(클라)": clientOddsAtBet,
              "② 확정odds(서버)": serverOddsForSide,
              "③ oddsMatch": oddsMatch,
              serverPayout: d.payout,
              expectedByServerOdds,
              payoutMatch: d.payout === expectedByServerOdds,
              newBalance: d.balance,
            })
            if (oddsMatch === false) {
              console.warn(`%c[불일치!] 배팅시점 ${clientOddsAtBet}x ≠ 서버확정 ${serverOddsForSide}x — odds:final 오염 의심`, "color:#e57373;font-weight:bold")
            }

            // 정산 완료 후 잔고 갱신
            if (typeof d.balance === "number") {
              setBalance(d.balance)
              window.dispatchEvent(new CustomEvent("balance:update", { detail: d.balance }))
            }
            // 서버 확정 배당 + payout 반영
            const currentResult = lastResultRef.current
            if (currentResult) {
              const updated: RoundResult = { ...currentResult }
              if (d.appliedOdds) updated.baccaratOdds = d.appliedOdds
              if (typeof d.payout === "number") updated.serverPayout = d.payout

              // ── [DEBUG] 모달 표시 데이터 ──────────────────────
              console.log("[baka:modal]", {
                side: updated.baccarat,
                amount: updated.baccaratAmount,
                serverPayout: updated.serverPayout,
                netProfit: typeof updated.serverPayout === "number" ? updated.serverPayout - updated.baccaratAmount : "N/A",
                baccaratOdds: updated.baccaratOdds,
              })

              setLastResult(updated)
            }
            if (hasBaccaratBet) setShowResultSheet(true)
          })
          .catch(err => console.error("[baka:settle error]", err))
      }

      // 베팅 상태 초기화 (다음 라운드 준비)
      betRef.current = null; betDigitRef.current = null
      betParityRef.current = null; betBaccaratRef.current = null
      betDirectionAmountRef.current = 0; betDigitAmountRef.current = 0
      betParityAmountRef.current = 0; betBaccaratAmountRef.current = 0
      betRoundNumberRef.current   = 0
      liveOddsSnapshotRef.current = null
      setBetDirection(null); setBetDigit(null); setBetParity(null); setBetBaccarat(null)
      setBetDirectionAmount(0); setBetDigitAmount(0); setBetParityAmount(0); setBetBaccaratAmount(0)

      // 기준가를 마감가로 교체 (다음 라운드 시작)
      setBasePrice(price); basePriceRef.current = price
      setDialog(null)
      setTimeout(() => setPhase("betting"), 800)  // 1500→800ms
    }

    // 5) 정산 타이밍:
    //    - 바카라 배팅: onDealForScore 내부에서 settle() 호출 (위에서 처리)
    //    - 바카라 배팅 없음: 즉시 정산
    if (!betBaccaratRef.current) {
      settle(null)
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

  // baka:closing 이벤트 구독 �� bitcoin-chart.tsx k.x===true 공식 종가 = ���널과 동일 소스
  useEffect(() => {
    const handler = (e: Event) => {
      const { price, time } = (e as CustomEvent<{ price: number; time: number }>).detail
      handleClosingPrice(price, time)
    }
    window.addEventListener("baka:closing", handler)
    return () => window.removeEventListener("baka:closing", handler)
  }, [handleClosingPrice])

  // 30초: 카드 리셋 중복 방지 ref
  const resetTriggeredRoundRef = useRef<number>(-1)

  // 타이머 + rem===30 카드 리셋 + rem===15 딜 시작 트리��
  useEffect(() => {
    const tick = setInterval(() => {
      const now = Math.floor(Date.now() / 1000)
      const rem = 30 - (now % 30)
      const roundNum = Math.floor(now / 30)
      setTimeLeft(rem)
      roundRef.current = roundNum
      setRoundNumber(roundNum)

      // 30초(라운드 전환): 카드 리셋 — 새 라운드 시작 시 BaccaratGame 초기화
      // rem===30은 now%30===0인 순간에만 발생 (200ms 인터벌이 이 시점을 포착)
      if (rem === 30 && resetTriggeredRoundRef.current !== roundNum) {
        resetTriggeredRoundRef.current = roundNum
        onResetCards?.()
      }

      // 25초: 딜 시작 — 배팅 시작(5초)과 동시에 카드 공개 (라운드당 1회)
      // rem===25: 정산(0~4초) 종료 직후 = 배팅 시작 시점
      if (rem === 25 && dealTriggeredRoundRef.current !== roundNum) {
        dealTriggeredRoundRef.current = roundNum
        onStartDealTrigger?.()
      }
    }, 200)
    return () => clearInterval(tick)
  }, [onResetCards, onStartDealTrigger])

  // 페이즈 구조 (30초 라운드 기준, UTC secInRound 기준):
  //    0~ 4초: 정산   (5초)
  //    5~19초: 배팅   (15초)
  //   20~29초: 게임 중 (10초)
  // SSE 서버와 동일한 UTC 기준으로 계산 — timeLeft 기반 오차 제거
  const canBet = (() => {
    const s = Math.floor(Date.now() / 1000) % 30
    return s >= 5 && s < 20
  })()

  // canBetRef 동기화 + 배팅 시작/마감 로그
  useEffect(() => {
    const wasBetting = canBetRef.current
    canBetRef.current = canBet
    if (canBet && liveOddsRef.current) {
      // 배팅 구간 진입: 최신 liveOdds를 state에 즉시 반영
      setLiveOdds(liveOddsRef.current)
    }


  }, [canBet])

  // autoBet state → ref 초기화
  useEffect(() => { autoBetRef.current = autoBet }, [autoBet])

  // canBet false→true 전환 = 정산 끝, 새 배팅 구간 시작
  const prevCanBetRef = useRef(false)
  useEffect(() => {
    const was = prevCanBetRef.current
    prevCanBetRef.current = canBet
    if (!canBet || was) return

    // 1) 자동배팅 플래그 초기화
    autoBetFiredRef.current = false

    // 2) liveOdds 초기화 → 새 라운드 odds를 즉시 HTTP로 조회
    setLiveOdds(null)
    liveOddsRef.current = null

    const token = getToken()
    fetch("/api/game/odds?type=baccarat", {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.odds) {
          liveOddsRef.current = data.odds
          setLiveOdds(data.odds)
        }
      })
      .catch(() => {})
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
      // baccarat 배팅은 gameType + side + bets를 반드시 포함 — pool 적립 및 odds:final 저장에 필요
      const betsPayload = type === "baccarat"
        ? { baccaratSide: value, baccaratAmount: cfg.amount }
        : type === "direction"
          ? { direction: value, directionAmount: cfg.amount }
          : type === "digit"
            ? { digit: value, digitAmount: cfg.amount }
            : { parity: value, parityAmount: cfg.amount }

      const body: Record<string, unknown> = { betAmount: cfg.amount, bets: betsPayload }
      if (type === "baccarat") { body.gameType = "baccarat"; body.side = value }

      const res = await fetch("/api/user/game/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
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
      betRoundNumberRef.current   = getRoundNumber()
      liveOddsSnapshotRef.current = liveOddsRef.current
      if (!basePriceRef.current && currentPriceRef.current) {
        basePriceRef.current = currentPriceRef.current
        setBasePrice(currentPriceRef.current)
      }

      // ── LOG 1: 배팅 완료 ────────────────────────────────────
      if (type === "baccarat") {
        const snap = liveOddsRef.current
        const side = value as BetBaccarat
        const oddsForSide = side === "player" ? snap?.player : side === "banker" ? snap?.banker : snap?.tie
        // 이후 LOG 2/3에서 참조할 수 있도록 별도 ref에 보존
        dbgBetRef.current = { round: betRoundNumberRef.current, side, amount: cfg.amount, oddsAtBet: oddsForSide, oddsSnap: snap }
        console.log(`%c[배팅완료] 라운드#${betRoundNumberRef.current}`, "color:#4fc3f7;font-weight:bold", {
          side,
          amount: cfg.amount,
          oddsAtBetTime: oddsForSide,
          fullOddsSnapshot: snap,
        })
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
      if (lastResult.wonBaccarat && lastResult.baccaratOdds) {
        // 실제 서버 확정 배당(oddsSnap) 기반 — 고정 승수 사용 금지
        const o = lastResult.baccaratOdds
        const odds = lastResult.baccarat === "player" ? (o.player ?? 0)
          : lastResult.baccarat === "banker" ? (o.banker ?? 0)
          : (o.tie ?? 0)
        pnl += Math.floor(lastResult.baccaratAmount * odds) - lastResult.baccaratAmount
      } else {
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
      // bets 전체를 함께 전송 → Redis에 저장 → settle API가 읽어 일괄 정산
      const betsPayload = {
        direction: dialog.type === "direction" ? dialog.value : (betRef.current ?? undefined),
        directionAmount: betDirectionAmountRef.current > 0 ? betDirectionAmountRef.current : (dialog.type === "direction" ? amount : undefined),
        digit: dialog.type === "digit" ? dialog.value : (betDigitRef.current ?? undefined),
        digitAmount: betDigitAmountRef.current > 0 ? betDigitAmountRef.current : (dialog.type === "digit" ? amount : undefined),
        parity: dialog.type === "parity" ? dialog.value : (betParityRef.current ?? undefined),
        parityAmount: betParityAmountRef.current > 0 ? betParityAmountRef.current : (dialog.type === "parity" ? amount : undefined),
        baccaratSide: dialog.type === "baccarat" ? dialog.value : (betBaccaratRef.current ?? undefined),
        baccaratAmount: betBaccaratAmountRef.current > 0 ? betBaccaratAmountRef.current : (dialog.type === "baccarat" ? amount : undefined),
      }
      const res = await fetch("/api/user/game/bet", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          betAmount: amount,
          bets: betsPayload,
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
    const phaseStatus = timeLeft > 25 ? "dealing"
      : timeLeft > 10 ? "betting"
      : timeLeft > 0  ? "dealing"
      : phase
    onStatusChange?.(timeLeft, phaseStatus as "betting" | "waiting" | "result" | "dealing")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, phase])

  const priceDiff = currentPrice !== null && basePrice !== null ? currentPrice - basePrice : null
  const isUp = priceDiff !== null && priceDiff >= 0

  // 페이즈별 타이머 계산 (서버 기준: s=now%30)
  // 정산(5s):  s=0~4   → rem=30~26 → timeLeft>25
  // 배팅(15s): s=5~19  → rem=25~11 → timeLeft>10 && <=25
  // 게임중(10s): s=20~29 → rem=10~1  → timeLeft<=10
    const currentPhaseLabel = timeLeft > 25 ? "정산 중"
      : timeLeft > 10 ? "배팅 가능"
      : "게임 중"
    const currentPhaseDuration = timeLeft > 25 ? 5 : timeLeft > 10 ? 15 : 10
    const currentPhaseLeft = timeLeft > 25 ? timeLeft - 25
      : timeLeft > 10 ? timeLeft - 10
      : timeLeft
  const timerPercent = (currentPhaseLeft / currentPhaseDuration) * 100
    const timerColor = timeLeft > 25 ? "#60a5fa"   // 정산 — 파랑
      : timeLeft > 10 ? "#10b981"                  // 배팅 가능 — 초록
      : timeLeft > 3  ? "#f97316"                  // 게임 중 — 주황
    : "#ef4444"                                  // 막판 — 빨강
  const timerLabel = currentPhaseLabel

  return (
    <>
      <div style={{
        background: "rgba(8,20,12,0.98)",
        borderRadius: 16,
        padding: "14px 16px",
        border: "1px solid rgba(212,175,55,0.2)",
        boxShadow: "0 4px 32px rgba(0,0,0,0.6)",
      }}>

        {/* ── 헤더: ��팅 + 라운드 + 자동배팅 버튼 (한 줄) ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          {/* 좌: 타이틀 + 라운드 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <h3 style={{ fontSize: 13, fontWeight: 800, color: G.gold, letterSpacing: "0.06em", margin: 0 }}>��팅</h3>
            <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 5, background: G.goldFaint, color: G.goldDim, fontWeight: 600 }}>
              #{roundNumber}
            </span>
          </div>
          {/* 우: 자동배팅 버튼 */}
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
              // liveOdds는 ���팅 구간에만 갱신되므로 그대로 사용하면 게임중 동결됨
              const oddsAvailable = liveOdds?.available !== false
              const oddsVal = (liveOdds && oddsAvailable)
                ? (side === "player" ? liveOdds.player : side === "banker" ? liveOdds.banker : liveOdds.tie)
                : null
              const payout = oddsVal != null ? `${(oddsVal as number).toFixed(2)}x` : "-"
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
