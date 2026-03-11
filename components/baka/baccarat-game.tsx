"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { usePriceWorker } from "@/hooks/use-price-worker"

// ─── 타입 ──────────────────────────────────────────────────────────────────
type Suit = "♠" | "♥" | "♦" | "♣"
type BetSide = "player" | "banker" | "tie" | null
type Phase = "betting" | "dealing" | "result"

interface Card {
  suit: Suit
  value: number   // 0~9 (바카라 점수)
  label: string   // "A", "2", ..., "K"
  id: string
}

interface GameState {
  phase: Phase
  playerCards: Card[]
  bankerCards: Card[]
  bet: BetSide
  betAmount: number
  balance: number
  lastDigits: number[]   // 가격 끝자리 큐
  result: "player" | "banker" | "tie" | null
  priceDisplay: number
  roundCount: number
  history: Array<"player" | "banker" | "tie">
}

// ─── 카드 유틸 ─────────────────────────────────────────────────────────────
const SUITS: Suit[] = ["♠", "♥", "♦", "♣"]
const LABELS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]

// 끝자리 숫자 → 카드 변환
// 0 = 10/J/Q/K (점수 0), 1 = A (점수 1), 2~9 = 액면가
function digitToCard(digit: number, seed: number): Card {
  const suit = SUITS[seed % 4]
  if (digit === 0) {
    const zeroLabels = ["10", "J", "Q", "K"]
    const label = zeroLabels[seed % 4]
    return { suit, value: 0, label, id: `${Date.now()}-${Math.random()}` }
  }
  if (digit === 1) {
    return { suit, value: 1, label: "A", id: `${Date.now()}-${Math.random()}` }
  }
  return { suit, value: digit, label: String(digit), id: `${Date.now()}-${Math.random()}` }
}

function handScore(cards: Card[]) {
  const total = cards.reduce((s, c) => s + c.value, 0)
  return total % 10
}

// ─── 바카라 3번째 카드 규칙 ────────────────────────────────────────────────
function shouldPlayerDraw(pScore: number) {
  return pScore <= 5
}

function shouldBankerDraw(bScore: number, pScore: number, pThird: Card | null): boolean {
  if (!pThird) {
    // 플레이어가 스탠드 → 뱅커도 동일 규칙 (5 이하 히트)
    return bScore <= 5
  }
  const pt = pThird.value
  if (bScore <= 2) return true
  if (bScore === 3) return pt !== 8
  if (bScore === 4) return pt >= 2 && pt <= 7
  if (bScore === 5) return pt >= 4 && pt <= 7
  if (bScore === 6) return pt === 6 || pt === 7
  return false
}

// ─── 카드 컴포넌트 ─────────────────────────────────────────────────────────
function PlayingCard({
  card,
  delay = 0,
  visible = true,
}: {
  card: Card
  delay?: number
  visible?: boolean
}) {
  const [show, setShow] = useState(false)
  const isRed = card.suit === "♥" || card.suit === "♦"

  useEffect(() => {
    if (!visible) { setShow(false); return }
    const t = setTimeout(() => setShow(true), delay)
    return () => clearTimeout(t)
  }, [visible, delay, card.id])

  return (
    <div
      className="relative"
      style={{
        width: 52,
        height: 74,
        perspective: 600,
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          transformStyle: "preserve-3d",
          transition: "transform 0.38s cubic-bezier(0.23, 1, 0.32, 1)",
          transform: show ? "rotateY(0deg)" : "rotateY(90deg)",
          transitionDelay: show ? "0ms" : "0ms",
        }}
      >
        {/* 앞면 */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            background: "linear-gradient(145deg, #1c1408, #12100a)",
            border: "1px solid rgba(212,175,55,0.45)",
            borderRadius: 8,
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "5px 6px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(212,175,55,0.08)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 700, color: isRed ? "#e85c5c" : "#d4af37", lineHeight: 1 }}>
            {card.label}
            <span style={{ fontSize: 10, marginLeft: 1 }}>{card.suit}</span>
          </div>
          <div style={{ fontSize: 22, textAlign: "center", color: isRed ? "#e85c5c" : "#d4af37", lineHeight: 1 }}>
            {card.suit}
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: isRed ? "#e85c5c" : "#d4af37", lineHeight: 1, alignSelf: "flex-end", transform: "rotate(180deg)" }}>
            {card.label}
            <span style={{ fontSize: 10, marginLeft: 1 }}>{card.suit}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

interface BaccaratGameProps {
  onCardsChange?: (data: { playerCards: Card[]; bankerCards: Card[]; pScore: number; bScore: number; result: GameState["result"] }) => void
}

// ─── 메인 게임 컴포넌트 ────────────────────────────────────────────────────
export default function BaccaratGame({ onCardsChange }: BaccaratGameProps = {}) {
  const [state, setState] = useState<GameState>({
    phase: "betting",
    playerCards: [],
    bankerCards: [],
    bet: null,
    betAmount: 1000,
    balance: 10000,
    lastDigits: [],
    result: null,
    priceDisplay: 0,
    roundCount: 0,
    history: [],
  })

  const digitQueueRef = useRef<number[]>([])
  const dealingRef = useRef(false)
  const priceRef = useRef(0)

  // ─── 가격 수신 — usePriceWorker로 window.__bitcoinCurrentPrice 채우기 ("/", "/widget" 동일 방식) ──
  usePriceWorker({
    onPrice: useCallback((price: number) => {
      ;(window as any).__bitcoinCurrentPrice = price
    }, []),
  })

  // window.__bitcoinCurrentPrice 폴링 — 카드용 digit 큐 + priceDisplay 업데이트
  const lastPriceRef = useRef<number | null>(null)
  useEffect(() => {
    const win = window as any
    const id = setInterval(() => {
      const price: number | undefined = win.__bitcoinCurrentPrice
      if (!price) return
      if (price === lastPriceRef.current) return
      lastPriceRef.current = price
      priceRef.current = price
      const digit = Math.floor(price) % 10
      digitQueueRef.current.push(digit)
      if (digitQueueRef.current.length > 20) digitQueueRef.current.shift()
      setState(prev => ({ ...prev, priceDisplay: price }))
    }, 500)
    return () => clearInterval(id)
  }, [])

  // ─── 딜 로직 ─────────────────────────────────────────────────────────────
  const deal = useCallback(async (bet: BetSide, betAmount: number, balance: number) => {
    if (dealingRef.current) return
    dealingRef.current = true

    // 큐에서 숫자 소비 (부족하면 현재 가격 끝자리 반복 사용)
    const getDigit = (seed: number): number => {
      if (digitQueueRef.current.length > 0) {
        return digitQueueRef.current.shift()!
      }
      return (Math.floor(priceRef.current) + seed) % 10
    }

    // 초기 2장씩
    const p1 = digitToCard(getDigit(0), 0)
    const b1 = digitToCard(getDigit(1), 1)
    const p2 = digitToCard(getDigit(2), 2)
    const b2 = digitToCard(getDigit(3), 3)

    setState(prev => ({ ...prev, phase: "dealing", playerCards: [], bankerCards: [] }))
    await sleep(50)

    // 착착 딜: P1 → B1 → P2 → B2
    setState(prev => ({ ...prev, playerCards: [p1] }))
    await sleep(320)
    setState(prev => ({ ...prev, bankerCards: [b1] }))
    await sleep(320)
    setState(prev => ({ ...prev, playerCards: [p1, p2] }))
    await sleep(320)
    setState(prev => ({ ...prev, bankerCards: [b1, b2] }))
    await sleep(500)

    let finalP = [p1, p2]
    let finalB = [b1, b2]

    const pScore = handScore(finalP)
    const bScore = handScore(finalB)

    // 내추럴 체크
    const isNatural = pScore >= 8 || bScore >= 8

    if (!isNatural) {
      // 플레이어 3번째
      let p3: Card | null = null
      if (shouldPlayerDraw(pScore)) {
        p3 = digitToCard(getDigit(4), 4)
        finalP = [...finalP, p3]
        setState(prev => ({ ...prev, playerCards: finalP }))
        await sleep(350)
      }

      // 뱅커 3번째
      if (shouldBankerDraw(bScore, pScore, p3)) {
        const b3 = digitToCard(getDigit(5), 5)
        finalB = [...finalB, b3]
        setState(prev => ({ ...prev, bankerCards: finalB }))
        await sleep(350)
      }
    }

    await sleep(400)

    // 결과 계산
    const finalPScore = handScore(finalP)
    const finalBScore = handScore(finalB)
    let result: "player" | "banker" | "tie"
    if (finalPScore > finalBScore) result = "player"
    else if (finalBScore > finalPScore) result = "banker"
    else result = "tie"

    // 수익 계산
    let newBalance = balance
    if (bet === result) {
      if (result === "player") newBalance += betAmount
      else if (result === "banker") newBalance += Math.floor(betAmount * 0.95) // 5% 커미션
      else if (result === "tie") newBalance += betAmount * 8
    } else if (result === "tie" && (bet === "player" || bet === "banker")) {
      // 타이시 player/banker 베팅 반환
      newBalance = balance
    } else {
      newBalance -= betAmount
    }

    setState(prev => ({
      ...prev,
      phase: "result",
      result,
      balance: Math.max(0, newBalance),
      playerCards: finalP,
      bankerCards: finalB,
      roundCount: prev.roundCount + 1,
      history: [...prev.history.slice(-19), result],
    }))

    dealingRef.current = false
  }, [])

  const handleBet = (side: BetSide) => {
    if (state.phase !== "betting") return
    setState(prev => ({ ...prev, bet: prev.bet === side ? null : side }))
  }

  const handleDeal = () => {
    if (!state.bet || state.betAmount <= 0 || state.balance < state.betAmount) return
    deal(state.bet, state.betAmount, state.balance)
  }

  const handleNextRound = () => {
    setState(prev => ({
      ...prev,
      phase: "betting",
      playerCards: [],
      bankerCards: [],
      bet: null,
      result: null,
    }))
  }

  const pScore = handScore(state.playerCards)
  const bScore = handScore(state.bankerCards)
  const lastDigit = Math.floor(state.priceDisplay) % 10

  // 카드 상태를 부모로 전달 (차트 오버레이용)
  useEffect(() => {
    onCardsChange?.({ playerCards: state.playerCards, bankerCards: state.bankerCards, pScore, bScore, result: state.result })
  }, [state.playerCards, state.bankerCards, state.result, pScore, bScore, onCardsChange])

  return (
    <div
      className="font-sans"
      style={{ background: "#09080a", minHeight: "100%", color: "#e8d5a3" }}
    >
      {/* 가격 헤더 */}
      <div
        style={{
          borderBottom: "1px solid rgba(212,175,55,0.12)",
          padding: "10px 16px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(212,175,55,0.04)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 11, color: "rgba(232,213,163,0.5)", letterSpacing: "0.08em" }}>BTC/USDT</span>
          <span style={{ fontSize: 18, fontWeight: 700, color: "#d4af37" }}>
            {state.priceDisplay ? state.priceDisplay.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "---"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "rgba(232,213,163,0.4)" }}>끝자리</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#d4af37", lineHeight: 1.1 }}>{state.priceDisplay ? lastDigit : "-"}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "rgba(232,213,163,0.4)" }}>잔액</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#a8e6a3" }}>₩{state.balance.toLocaleString()}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 10, color: "rgba(232,213,163,0.4)" }}>라운드</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "rgba(232,213,163,0.7)" }}>#{state.roundCount}</div>
          </div>
        </div>
      </div>

      {/* 게임 테이블 */}
      <div style={{ padding: "16px 12px" }}>

        {/* 히스토리 */}
        {state.history.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginBottom: 14, flexWrap: "wrap" }}>
            {state.history.map((r, i) => (
              <div
                key={i}
                style={{
                  width: 18, height: 18, borderRadius: "50%",
                  background: r === "player" ? "#3b82f6" : r === "banker" ? "#ef4444" : "#22c55e",
                  fontSize: 8, fontWeight: 700, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  opacity: i === state.history.length - 1 ? 1 : 0.55,
                }}
              >
                {r === "player" ? "P" : r === "banker" ? "B" : "T"}
              </div>
            ))}
          </div>
        )}

        {/* 뱅커 / 플레이어 영역 */}
        {(["banker", "player"] as const).map((side) => {
          const cards = side === "banker" ? state.bankerCards : state.playerCards
          const score = side === "banker" ? bScore : pScore
          const label = side === "banker" ? "BANKER" : "PLAYER"
          const accentColor = side === "banker" ? "#ef4444" : "#3b82f6"
          const isWinner = state.result === side
          const isBetting = state.bet === side

          return (
            <div
              key={side}
              style={{
                marginBottom: 12,
                borderRadius: 12,
                border: `1px solid ${isWinner ? accentColor + "88" : "rgba(212,175,55,0.12)"}`,
                background: isWinner ? `${accentColor}08` : "rgba(255,255,255,0.015)",
                padding: "12px 14px",
                transition: "border-color 0.3s, background 0.3s",
                boxShadow: isWinner ? `0 0 20px ${accentColor}22` : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: accentColor }}>{label}</span>
                  {isWinner && (
                    <span style={{ fontSize: 10, background: accentColor, color: "#fff", padding: "1px 6px", borderRadius: 4, fontWeight: 700 }}>WIN</span>
                  )}
                </div>
                {cards.length > 0 && (
                  <span style={{
                    fontSize: 22, fontWeight: 800,
                    color: score >= 8 ? "#d4af37" : "rgba(232,213,163,0.8)",
                    lineHeight: 1,
                  }}>
                    {score}
                    {score >= 8 && <span style={{ fontSize: 10, marginLeft: 4, color: "#d4af37" }}>NATURAL</span>}
                  </span>
                )}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {cards.map((card, ci) => (
                  <PlayingCard key={card.id} card={card} delay={0} visible={true} />
                ))}
                {/* 빈 슬롯 */}
                {Array.from({ length: Math.max(0, 2 - cards.length) }).map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    style={{
                      width: 52, height: 74, borderRadius: 8,
                      border: "1px dashed rgba(212,175,55,0.15)",
                      background: "rgba(212,175,55,0.03)",
                    }}
                  />
                ))}
              </div>
            </div>
          )
        })}

        {/* 결과 배너 */}
        {state.phase === "result" && state.result && (
          <div
            style={{
              textAlign: "center",
              padding: "12px",
              marginBottom: 14,
              borderRadius: 10,
              border: "1px solid rgba(212,175,55,0.3)",
              background: "rgba(212,175,55,0.06)",
            }}
          >
            <div style={{ fontSize: 11, color: "rgba(232,213,163,0.5)", marginBottom: 4 }}>결과</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#d4af37", letterSpacing: "0.08em" }}>
              {state.result === "player" ? "PLAYER WIN" : state.result === "banker" ? "BANKER WIN" : "TIE"}
            </div>
            {state.bet === state.result && (
              <div style={{ fontSize: 13, color: "#a8e6a3", marginTop: 4 }}>
                +{state.result === "tie"
                  ? (state.betAmount * 8).toLocaleString()
                  : state.result === "banker"
                    ? Math.floor(state.betAmount * 0.95).toLocaleString()
                    : state.betAmount.toLocaleString()} 원 획득
              </div>
            )}
            {state.bet !== state.result && state.result !== "tie" && (
              <div style={{ fontSize: 13, color: "#f87171", marginTop: 4 }}>
                -{state.betAmount.toLocaleString()} 원 손실
              </div>
            )}
          </div>
        )}

        {/* 베팅 영역 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "rgba(232,213,163,0.4)", marginBottom: 8, letterSpacing: "0.08em" }}>베팅 선택</div>
          <div style={{ display: "flex", gap: 8 }}>
            {(["player", "banker", "tie"] as BetSide[]).map((side) => {
              const colors = {
                player: { main: "#3b82f6", label: "PLAYER", sub: "1:1" },
                banker: { main: "#ef4444", label: "BANKER", sub: "1:0.95" },
                tie: { main: "#22c55e", label: "TIE", sub: "8:1" },
              }
              const c = colors[side!]
              const isSelected = state.bet === side
              return (
                <button
                  key={side}
                  onClick={() => handleBet(side)}
                  disabled={state.phase !== "betting"}
                  style={{
                    flex: 1, padding: "10px 6px",
                    borderRadius: 10,
                    border: `1px solid ${isSelected ? c.main : "rgba(212,175,55,0.15)"}`,
                    background: isSelected ? `${c.main}22` : "rgba(255,255,255,0.02)",
                    color: isSelected ? c.main : "rgba(232,213,163,0.5)",
                    cursor: state.phase === "betting" ? "pointer" : "not-allowed",
                    transition: "all 0.18s",
                    textAlign: "center",
                    boxShadow: isSelected ? `0 0 12px ${c.main}33` : "none",
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em" }}>{c.label}</div>
                  <div style={{ fontSize: 10, marginTop: 2, opacity: 0.7 }}>{c.sub}</div>
                </button>
              )
            })}
          </div>
        </div>

        {/* 베팅 금액 */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 10, color: "rgba(232,213,163,0.4)", marginBottom: 8, letterSpacing: "0.08em" }}>베팅 금액</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[500, 1000, 5000, 10000, 50000].map((amt) => (
              <button
                key={amt}
                onClick={() => setState(prev => ({ ...prev, betAmount: amt }))}
                disabled={state.phase !== "betting"}
                style={{
                  padding: "5px 10px",
                  borderRadius: 6,
                  border: `1px solid ${state.betAmount === amt ? "#d4af37" : "rgba(212,175,55,0.15)"}`,
                  background: state.betAmount === amt ? "rgba(212,175,55,0.18)" : "rgba(255,255,255,0.02)",
                  color: state.betAmount === amt ? "#d4af37" : "rgba(232,213,163,0.45)",
                  fontSize: 11, fontWeight: 600,
                  cursor: state.phase === "betting" ? "pointer" : "not-allowed",
                  transition: "all 0.15s",
                }}
              >
                {amt >= 10000 ? `${amt / 10000}만` : amt.toLocaleString()}
              </button>
            ))}
          </div>
        </div>

        {/* 딜 / 다음 라운드 버튼 */}
        {state.phase === "betting" && (
          <button
            onClick={handleDeal}
            disabled={!state.bet || state.balance < state.betAmount}
            style={{
              width: "100%", padding: "13px",
              borderRadius: 10,
              border: "1px solid rgba(212,175,55,0.5)",
              background: state.bet ? "rgba(212,175,55,0.15)" : "rgba(255,255,255,0.02)",
              color: state.bet ? "#d4af37" : "rgba(232,213,163,0.25)",
              fontSize: 14, fontWeight: 700, letterSpacing: "0.1em",
              cursor: state.bet && state.balance >= state.betAmount ? "pointer" : "not-allowed",
              transition: "all 0.2s",
              boxShadow: state.bet ? "0 0 20px rgba(212,175,55,0.12)" : "none",
            }}
          >
            DEAL
          </button>
        )}
        {state.phase === "dealing" && (
          <div
            style={{
              width: "100%", padding: "13px",
              borderRadius: 10,
              border: "1px solid rgba(212,175,55,0.2)",
              background: "rgba(212,175,55,0.06)",
              color: "rgba(232,213,163,0.5)",
              fontSize: 13, fontWeight: 600, textAlign: "center",
              letterSpacing: "0.08em",
            }}
          >
            딜링 중...
          </div>
        )}
        {state.phase === "result" && (
          <button
            onClick={handleNextRound}
            style={{
              width: "100%", padding: "13px",
              borderRadius: 10,
              border: "1px solid rgba(212,175,55,0.5)",
              background: "rgba(212,175,55,0.15)",
              color: "#d4af37",
              fontSize: 14, fontWeight: 700, letterSpacing: "0.1em",
              cursor: "pointer",
              transition: "all 0.2s",
            }}
          >
            다음 라운드
          </button>
        )}

        {/* 규칙 안내 */}
        <div style={{ marginTop: 14, fontSize: 10, color: "rgba(232,213,163,0.3)", lineHeight: 1.7 }}>
          * 비트코인 현재가 끝자리 숫자를 카드 값으로 사용합니다. 뱅커 승리시 5% 커미션. 타이는 8:1 배당.
        </div>
      </div>
    </div>
  )
}

function sleep(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms))
}
