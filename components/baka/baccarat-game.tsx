"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { BaccaratRoadStats } from "@/components/dashboard/baccarat-road-stats"

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

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

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

// ─── Big Road 컴포넌트 ────────────────────────────────────────────────────
// 실제 바카라 Big Road 규칙:
//   1. 타이는 독립 열을 차지하지 않음 → 직전 결과 칸에 초록 사선(/)으로 표시
//   2. 뱅커/플레이어가 같은 결과면 같은 열에 아래로 쌓임 (최대 MAX_ROWS행)
//   3. MAX_ROWS를 초과하거나 결과가 바뀌면 새 열 시작
//   4. 빨간=뱅커, 파란=플레이어
const MAX_ROWS = 6
const CELL = 22   // 셀 크기 px
const GAP = 2

type RoadResult = "player" | "banker" | "tie"

interface BigRoadCell {
  col: number
  row: number
  result: "player" | "banker"
  tieCount: number   // 이 칸 위에 쌓인 타이 수
}

function buildBigRoad(history: RoadResult[]): BigRoadCell[] {
  const cells: BigRoadCell[] = []
  let col = -1
  let row = 0
  let lastNonTie: "player" | "banker" | null = null

  for (const result of history) {
    if (result === "tie") {
      // 타이: 직전 non-tie 칸의 tieCount 증가
      if (cells.length > 0) {
        cells[cells.length - 1].tieCount += 1
      }
      continue
    }

    if (result !== lastNonTie) {
      // 결과가 바뀜 → 새 열
      col += 1
      row = 0
      lastNonTie = result
    } else {
      // 같은 결과 → 아래로
      row += 1
      if (row >= MAX_ROWS) {
        // 최대 행 초과 → 오른쪽으로 밀기
        col += 1
        row = MAX_ROWS - 1
      }
    }

    cells.push({ col, row, result, tieCount: 0 })
  }

  return cells
}

function BigRoad({ history, round }: { history: RoadResult[]; round: number }) {
  const cells = buildBigRoad(history)
  const maxCol = cells.length > 0 ? Math.max(...cells.map(c => c.col)) : 0
  const totalCols = Math.max(maxCol + 1, 14)  // 최소 14열 표시
  const width = totalCols * (CELL + GAP)
  const height = MAX_ROWS * (CELL + GAP)

  // 카운트 집계
  const pCount = history.filter(r => r === "player").length
  const bCount = history.filter(r => r === "banker").length
  const tCount = history.filter(r => r === "tie").length

  const StatChip = ({
    color, label, count,
  }: { color: string; label: string; count: number }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
      <div style={{
        width: 18, height: 18, borderRadius: "50%",
        background: color,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 9, fontWeight: 800, color: "#fff", flexShrink: 0,
      }}>
        {label}
      </div>
      <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(232,213,163,0.9)" }}>{count}</span>
    </div>
  )

  return (
    <div style={{ marginBottom: 14 }}>
      {/* 라운드 + 카운트 헤더 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        marginBottom: 6,
        padding: "5px 8px",
        background: "rgba(0,0,0,0.35)",
        borderRadius: 7,
        border: "1px solid rgba(212,175,55,0.1)",
        flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(232,213,163,0.7)", marginRight: 2 }}>
          #{round}
        </span>
        <StatChip color="#3b82f6" label="P" count={pCount} />
        <StatChip color="#ef4444" label="B" count={bCount} />
        <StatChip color="#22c55e" label="T" count={tCount} />
      </div>

      {/* BIG ROAD 레전드 */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 5,
      }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(212,175,55,0.6)", letterSpacing: "0.1em" }}>
          BIG ROAD
        </span>
        <div style={{ display: "flex", gap: 8 }}>
          <span style={{ fontSize: 9, color: "#3b82f6", display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", border: "1.5px solid #3b82f6", display: "inline-block" }} />
            P
          </span>
          <span style={{ fontSize: 9, color: "#ef4444", display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", border: "1.5px solid #ef4444", display: "inline-block" }} />
            B
          </span>
          <span style={{ fontSize: 9, color: "#22c55e", display: "flex", alignItems: "center", gap: 3 }}>
            <span style={{ fontSize: 8 }}>╱</span>
            T
          </span>
        </div>
      </div>

      {/* 그리드 */}
      <div style={{
        overflowX: "auto",
        borderRadius: 8,
        border: "1px solid rgba(212,175,55,0.12)",
        background: "rgba(0,0,0,0.25)",
        padding: 4,
      }}>
        <div style={{ position: "relative", width, height, flexShrink: 0 }}>
          {/* 격자 배경 */}
          {Array.from({ length: MAX_ROWS }).map((_, r) =>
            Array.from({ length: totalCols }).map((_, c) => (
              <div
                key={`grid-${r}-${c}`}
                style={{
                  position: "absolute",
                  left: c * (CELL + GAP),
                  top: r * (CELL + GAP),
                  width: CELL,
                  height: CELL,
                  border: "1px solid rgba(212,175,55,0.06)",
                  borderRadius: 3,
                }}
              />
            ))
          )}

          {/* 결과 원 */}
          {cells.map((cell, i) => {
            const color = cell.result === "banker" ? "#ef4444" : "#3b82f6"
            const isLatest = i === cells.length - 1
            return (
              <div
                key={i}
                style={{
                  position: "absolute",
                  left: cell.col * (CELL + GAP),
                  top: cell.row * (CELL + GAP),
                  width: CELL,
                  height: CELL,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {/* 원 */}
                <div style={{
                  width: CELL - 4,
                  height: CELL - 4,
                  borderRadius: "50%",
                  border: `2px solid ${color}`,
                  background: isLatest ? `${color}22` : "transparent",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  position: "relative",
                  boxShadow: isLatest ? `0 0 6px ${color}66` : "none",
                  transition: "box-shadow 0.3s",
                }}>
                  {/* 타이 사선 표시 */}
                  {cell.tieCount > 0 && (
                    <svg
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
                      viewBox="0 0 18 18"
                    >
                      <line x1="2" y1="16" x2="16" y2="2" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" />
                      {cell.tieCount > 1 && (
                        <text x="13" y="6" fontSize="5" fill="#22c55e" fontWeight="bold">{cell.tieCount}</text>
                      )}
                    </svg>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
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
  /** BaccaratGame이 page에 startDeal 함수를 등록 */
  onStartDealRequest?: (handler: () => void) => void
  /** BaccaratGame이 page에 applyFinalDigit 함수를 등록 */
  onFinalDigitRequest?: (handler: (digit: number) => void) => void
  /** BaccaratGame이 page에 setBetSide 함수를 등록 — 배팅 사이드를 딜 전에 주입 */
  onBetSideRequest?: (handler: (side: BetSide) => void) => void
}

// ─── 메인 게임 컴포넌트 ────────────────────────────────────────────────────
export default function BaccaratGame({ onCardsChange, onStartDealRequest, onFinalDigitRequest, onBetSideRequest }: BaccaratGameProps = {}) {
  const [state, setState] = useState<GameState>({
    phase: "betting",
    playerCards: [],
    bankerCards: [],
    bet: null,
    betAmount: 0,
    balance: 0,
    lastDigits: [],
    result: null,
    priceDisplay: 0,
    roundCount: 0,
    history: [],
  })

  const dealingRef = useRef(false)
  const priceRef = useRef(0)
  // 현재 라운드 배팅 사이드 (BakaBettingGame이 15초 전에 주입)
  const betSideRef = useRef<BetSide>(null)
  // 딜 중간 상태 보관 (finalDigit 수신 시 이어서 계산)
  const midStateRef = useRef<{
    finalP: Card[]
    finalB: Card[]
    betSide: BetSide   // 이 라운드 배팅 사이드 스냅샷
  } | null>(null)

  // ─── 가격 수신 (priceDisplay 업데이트) ────────────────────────────────────
  const lastPriceRef = useRef<number | null>(null)
  useEffect(() => {
    const win = window as any
    const id = setInterval(() => {
      const price: number | undefined = win.__bitcoinCurrentPrice
      if (!price || price === lastPriceRef.current) return
      lastPriceRef.current = price
      priceRef.current = price
      setState(prev => ({ ...prev, priceDisplay: price }))
    }, 300)
    return () => clearInterval(id)
  }, [])

  // ─── 서버 바카라 결과 수신 (끝자리 기반, 모든 유저 동일) ──────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      (window as any).__baccaratServerResult = (e as CustomEvent<"player" | "banker" | "tie">).detail
    }
    window.addEventListener("baccarat:server-result", handler)
    return () => window.removeEventListener("baccarat:server-result", handler)
  }, [])

  // ─── 초기 history 불러오기 (DB에���) ───────────────────────────────────────
  useEffect(() => {
    fetch("/api/baccarat/road")
      .then(r => r.json())
      .then(data => {
        if (data.road && Array.isArray(data.road)) {
          // 최근 50개만 유지 (클라이언트 메모리 절약)
          const recent = data.road.slice(-50)
          setState(prev => ({ ...prev, history: recent }))
        }
      })
      .catch(err => console.error("[v0] Failed to load initial BigRoad history:", err))
  }, [])

  // ─── 15초 딜 시작 ───────────────────────────────────────��─────────────────
  // 규칙:
  //   - 플레이어/타이 베팅: Player 1장(임의), Banker 2장(��의)
  //   - 뱅커 베팅:          Banker 1장(임의), Player 2장(임의)
  //   - 0초 끝자리 카드: 베팅 사이드(Player/Banker)의 마지막 카드 → 승부 결정
  //   - 끝자리 카드 받은 쪽 최종 점수 ≤5 → 상대방이 임의 1장 추가 (단, 이미 3장이면 스킵)
  const startDeal = useCallback(async () => {
    if (dealingRef.current) return
    dealingRef.current = true
    midStateRef.current = null

    const side = betSideRef.current  // null이면 배팅 없음 (관전 모드)
    const rand = () => Math.floor(Math.random() * 10)
    const randSuit = () => Math.floor(Math.random() * 4)

    setState(prev => ({ ...prev, phase: "dealing", playerCards: [], bankerCards: [], result: null }))
    await sleep(80)

    // 베팅 사이드에 따라 카드 수 결정
    // betTarget: 0초 끝자리를 받을 쪽 (베팅 사이드)
    // betTarget이 player(또는 tie/null): player 1장, banker 2장
    // betTarget이 banker: banker 1장, player 2장
    const betTarget: "player" | "banker" = (side === "banker") ? "banker" : "player"

    let finalP: Card[] = []
    let finalB: Card[] = []

    if (betTarget === "player") {
      // Player 1장, Banker 2장
      const p1 = digitToCard(rand(), randSuit())
      const b1 = digitToCard(rand(), randSuit())
      const b2 = digitToCard(rand(), randSuit())

      setState(prev => ({ ...prev, playerCards: [p1] }))
      await sleep(350)
      setState(prev => ({ ...prev, bankerCards: [b1] }))
      await sleep(350)
      setState(prev => ({ ...prev, bankerCards: [b1, b2] }))
      await sleep(350)

      finalP = [p1]
      finalB = [b1, b2]
    } else {
      // Banker 1장, Player 2장
      const b1 = digitToCard(rand(), randSuit())
      const p1 = digitToCard(rand(), randSuit())
      const p2 = digitToCard(rand(), randSuit())

      setState(prev => ({ ...prev, bankerCards: [b1] }))
      await sleep(350)
      setState(prev => ({ ...prev, playerCards: [p1] }))
      await sleep(350)
      setState(prev => ({ ...prev, playerCards: [p1, p2] }))
      await sleep(350)

      finalP = [p1, p2]
      finalB = [b1]
    }

    // 중간 상태 저장 → 0초 끝자리 카드 대기
    midStateRef.current = { finalP, finalB, betSide: side }
    setState(prev => ({ ...prev, playerCards: finalP, bankerCards: finalB }))
  }, [])

  // ─── 0초 끝자리 카드 → 베팅 사이드에 부여 → 추가 카드 판정 → 최종 승부 ──
  // 규칙:
  //   1. 끝자리 카드를 betTarget(베팅 사이드)의 마지막 카드로 부여
  //   2. betTarget 최종 점수 ≤5 → 상대방이 임의 1장 추가 (추가 카드가 없는 경우에만)
  //   3. 점수 비교 → 승부
  const applyFinalDigit = useCallback(async (digit: number) => {
    const mid = midStateRef.current
    if (!mid) return

    let { finalP, finalB } = mid
    const { betSide } = mid
    midStateRef.current = null

    const betTarget: "player" | "banker" = (betSide === "banker") ? "banker" : "player"
    const randSuit = () => Math.floor(Math.random() * 4)
    const finalCard = digitToCard(digit, randSuit())

    // 1. 끝자리 카드를 betTarget에게 부여
    if (betTarget === "player") {
      finalP = [...finalP, finalCard]
      setState(prev => ({ ...prev, playerCards: finalP }))
    } else {
      finalB = [...finalB, finalCard]
      setState(prev => ({ ...prev, bankerCards: finalB }))
    }
    await sleep(420)

    // 2. betTarget 점수 ≤5 → 상대방 추가 1장 (이미 추가 카드가 있는 경우 스킵)
    const targetScore = betTarget === "player" ? handScore(finalP) : handScore(finalB)
    if (targetScore <= 5) {
      const extraCard = digitToCard(Math.floor(Math.random() * 10), randSuit())
      if (betTarget === "player" && finalB.length < 3) {
        finalB = [...finalB, extraCard]
        setState(prev => ({ ...prev, bankerCards: finalB }))
        await sleep(380)
      } else if (betTarget === "banker" && finalP.length < 3) {
        finalP = [...finalP, extraCard]
        setState(prev => ({ ...prev, playerCards: finalP }))
        await sleep(380)
      }
    }

    await sleep(200)

    // 3. 최종 승부: 서버에서 전달된 결과 우선 사용 (끝자리 기반, 모든 유저 동일)
    //    서버 결과가 없으면 카드 점수로 폴백
    const serverResult: "player" | "banker" | "tie" | null =
      (window as any).__baccaratServerResult ?? null ;
    (window as any).__baccaratServerResult = null

    const finalPScore = handScore(finalP)
    const finalBScore = handScore(finalB)
    let cardResult: "player" | "banker" | "tie"
    if (finalPScore > finalBScore) cardResult = "player"
    else if (finalBScore > finalPScore) cardResult = "banker"
    else cardResult = "tie"

    const result = serverResult ?? cardResult

    setState(prev => ({
      ...prev,
      phase: "result",
      result,
      playerCards: finalP,
      bankerCards: finalB,
      roundCount: prev.roundCount + 1,
      history: [...prev.history.slice(-49), result],
    }))

    dealingRef.current = false
  }, [])

  // 콜백 등록
  useEffect(() => { onStartDealRequest?.(startDeal) }, [onStartDealRequest, startDeal])
  useEffect(() => { onFinalDigitRequest?.(applyFinalDigit) }, [onFinalDigitRequest, applyFinalDigit])
  useEffect(() => {
    onBetSideRequest?.((side) => { betSideRef.current = side })
  }, [onBetSideRequest])

  const pScore = handScore(state.playerCards)
  const bScore = handScore(state.bankerCards)

  // 카드 상태를 부모로 전달 (차트 오버레이용)
  useEffect(() => {
    onCardsChange?.({ playerCards: state.playerCards, bankerCards: state.bankerCards, pScore, bScore, result: state.result })
  }, [state.playerCards, state.bankerCards, state.result, pScore, bScore, onCardsChange])

  const lastDigit = Math.floor(state.priceDisplay) % 10

  return (
    <div
      className="font-sans"
      style={{
        background: "radial-gradient(ellipse at 50% 0%, #163828 0%, #0d2318 50%, #091510 100%)",
        color: "#e8d5a3",
        boxShadow: "inset 0 0 60px rgba(0,0,0,0.6)",
      }}
    >
      {/* 컴팩트 가격 헤더 (잔고 없음) */}
      <div
        style={{
          borderBottom: "1px solid rgba(212,175,55,0.1)",
          padding: "8px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "rgba(212,175,55,0.03)",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ fontSize: 10, color: "rgba(232,213,163,0.45)", letterSpacing: "0.08em" }}>BTC/USDT</span>
          <span style={{ fontSize: 16, fontWeight: 700, color: "#d4af37" }}>
            {state.priceDisplay ? state.priceDisplay.toFixed(1) : "---"}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "rgba(232,213,163,0.35)" }}>���자리</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#d4af37", lineHeight: 1.1 }}>{state.priceDisplay ? lastDigit : "-"}</div>
          </div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: "rgba(232,213,163,0.35)" }}>라운드</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "rgba(232,213,163,0.6)" }}>#{state.roundCount}</div>
          </div>
        </div>
      </div>

      {/* 게임 테이블 */}
      <div style={{ padding: "14px 12px" }}>

        {/* Big Road */}
        {state.history.length > 0 && (
          <BigRoad history={state.history} round={state.roundCount} />
        )}

        {/* 딜링 중 표시 */}
        {state.phase === "dealing" && (
          <div style={{
            textAlign: "center", padding: "8px",
            marginBottom: 10,
            fontSize: 11, color: "rgba(232,213,163,0.4)", letterSpacing: "0.08em",
          }}>
            딜링 중...
          </div>
        )}

        {/* 빅로드 통계 */}
        <div style={{ marginTop: 12 }}>
          <BaccaratRoadStats />
        </div>

        {/* 카드 캐릭터 이미지 */}
        <div style={{
          marginTop: 12,
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid rgba(212,175,55,0.2)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.5)",
        }}>
          <img
            src="/images/baccarat-card-girl.jpg"
            alt="Baccarat card character"
            style={{ width: "100%", display: "block", objectFit: "cover" }}
          />
        </div>
      </div>
    </div>
  )
}


