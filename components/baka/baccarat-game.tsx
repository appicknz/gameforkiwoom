"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import useSWR from "swr"
import { BitcoinChart } from "@/components/dashboard/bitcoin-chart"
import { ClosingPrices } from "@/components/dashboard/closing-prices"

const swrFetcher = (url: string) => fetch(url).then(r => r.json())


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
  finalCard: Card | null  // 0초 끝자리 카드 → 이미지 오버레이 표시용
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

// ─── 카드 유틸 ─────────────────────────────────────────────────────────────
const SUITS: Suit[] = ["♠", "♥", "♦", "♣"]

// 결정론적 해시 (mulberry32 PRNG)
// seed가 동일하면 항상 동일한 숫자 시퀀스를 반환 → 모든 유저 동일한 카드
function makeSeededRand(seed: number) {
  let s = seed >>> 0
  return function (): number {
    s = Math.imul(s ^ (s >>> 15), s | 1)
    s ^= s + Math.imul(s ^ (s >>> 7), s | 61)
    return ((s ^ (s >>> 14)) >>> 0) / 0x100000000
  }
}

// 현재 30초 라운드 슬롯 번호를 seed로 사용
// → 같은 라운드에 접속한 모든 클라이언트가 동일한 seed를 가짐
function getRoundSeed(): number {
  return Math.floor(Date.now() / 30000)
}

// 끝자리 숫자 → 카드 변환
// 0 = 10/J/Q/K (점수 0), 1 = A (점수 1), 2~9 = 액면가
function digitToCard(digit: number, suitIdx: number): Card {
  const suit = SUITS[suitIdx % 4]
  const id = `${digit}-${suitIdx}-${Date.now()}`
  if (digit === 0) {
    const zeroLabels = ["10", "J", "Q", "K"]
    return { suit, value: 0, label: zeroLabels[suitIdx % 4], id }
  }
  if (digit === 1) {
    return { suit, value: 1, label: "A", id }
  }
  return { suit, value: digit, label: String(digit), id }
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

export type RoadResult = "player" | "banker" | "tie"

interface BigRoadCell {
  col: number
  row: number
  result: "player" | "banker"
  tieCount: number   // 이 칸 위에 쌓인 타이 수
}

export function buildBigRoad(history: RoadResult[]): BigRoadCell[] {
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

const DISPLAY_LIMIT = 20 // 슬라이딩 윈도우 최대 표시 개수
const STAT_LIMIT    = 50 // 카운트 집계 기준: 최근 50개

export function BigRoad({
  history,
  round,
  colorMap,
  mode,
  playerLabel = "P",
  bankerLabel = "B",
  tieLabel = "T",
}: {
  history: RoadResult[]
  round: number
  colorMap?: { banker: string; player: string; statBanker?: string; statPlayer?: string }
  mode?: "baka" | "race"
  playerLabel?: string
  bankerLabel?: string
  tieLabel?: string
}) {
  // 18개 슬라이딩 윈도우: 18개 초과 시 맨 앞 잘라내기
  const displayHistory = history.length > DISPLAY_LIMIT ? history.slice(-DISPLAY_LIMIT) : history

  const cells = buildBigRoad(displayHistory)

  // 컨테이너 너비 측정 → 셀 크기 동적 계산
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerW, setContainerW] = useState(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      setContainerW(entries[0].contentRect.width)
    })
    ro.observe(el)
    setContainerW(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  // 그리드가 컨테이너 전체 너비를 채우도록 계산 (카드 공간 제거됨)
  const GRID_PAD = 8  // 그리드 div padding 4px × 2
  const avail = containerW > 0 ? containerW - GRID_PAD : DISPLAY_LIMIT * (CELL + GAP)
  // avail = DISPLAY_LIMIT * (cellSize + GAP)  →  cellSize = (avail - DISPLAY_LIMIT*GAP) / DISPLAY_LIMIT
  const cellSize = containerW > 0
    ? Math.max(8, Math.floor((avail - DISPLAY_LIMIT * GAP) / DISPLAY_LIMIT))
    : CELL

  const totalCols = DISPLAY_LIMIT
  const width = totalCols * (cellSize + GAP)
  const height = MAX_ROWS * (cellSize + GAP)

  // 카운트 집계: 최근 STAT_LIMIT(50)개 기준
  const statHistory = history.length > STAT_LIMIT ? history.slice(-STAT_LIMIT) : history
  const pCount = statHistory.filter(r => r === "player").length
  const bCount = statHistory.filter(r => r === "banker").length
  const tCount = statHistory.filter(r => r === "tie").length

  const StatChip = ({
    color, label, count,
  }: { color: string; label: string; count: number }) => {
    const isShort = label.length <= 1
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <div style={{
          minWidth: isShort ? 18 : "auto",
          height: 18,
          paddingInline: isShort ? 0 : 6,
          borderRadius: isShort ? "50%" : 9,
          background: color,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 8, fontWeight: 800, color: "#fff", flexShrink: 0,
          whiteSpace: "nowrap",
        }}>
          {label}
        </div>
        <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(232,213,163,0.9)" }}>{count}</span>
      </div>
    )
  }

  return (
    <div ref={containerRef} style={{ marginBottom: 14 }}>
      {/* BIG ROAD 헤더 — 라운드+카운트 배지 + 전체보기 */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 5, gap: 8,
      }}>
        {/* 왼쪽: BIG ROAD 타이틀 + 라운드/P/B/T 배지 */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(212,175,55,0.6)", letterSpacing: "0.1em" }}>
            BIG ROAD
          </span>
          {/* 배지 그룹 */}
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "3px 8px",
            background: "rgba(0,0,0,0.35)",
            borderRadius: 20,
            border: "1px solid rgba(212,175,55,0.1)",
          }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: "rgba(232,213,163,0.7)" }}>
              #{round}
            </span>
            <StatChip color={colorMap?.statPlayer ?? colorMap?.player ?? "#3b82f6"} label={playerLabel} count={pCount} />
            <StatChip color={colorMap?.statBanker ?? colorMap?.banker ?? "#ef4444"} label={bankerLabel} count={bCount} />
            <StatChip color="#22c55e" label={tieLabel} count={tCount} />
          </div>
        </div>
        {/* 오른쪽: 전체보기 버튼 */}
        <a
          href="/baccarat-stats"
          style={{
            fontSize: 9,
            fontWeight: 700,
            color: "rgba(212,175,55,0.8)",
            border: "1px solid rgba(212,175,55,0.25)",
            borderRadius: 4,
            padding: "2px 7px",
            textDecoration: "none",
            letterSpacing: "0.05em",
            background: "rgba(212,175,55,0.06)",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          전체보기
        </a>
      </div>

      {/* 빅로드 그리드 */}
      <div style={{
        borderRadius: 8,
        border: "1px solid rgba(212,175,55,0.12)",
        background: "rgba(0,0,0,0.25)",
        padding: 4,
        overflow: "hidden",
      }}>
          <div style={{ position: "relative", width, height, flexShrink: 0 }}>

            {/* 차트 — 그리드 내부 배경 */}
            <div style={{
              position: "absolute",
              inset: 0,
              zIndex: 1,
              pointerEvents: "none",
              opacity: 0.45,
            }}>
              <BitcoinChart compact mode={mode === "race" ? "race" : undefined} />
            </div>
            {/* 격자 배경 */}
            {Array.from({ length: MAX_ROWS }).map((_, r) =>
              Array.from({ length: totalCols }).map((_, c) => (
                <div
                  key={`grid-${r}-${c}`}
                  style={{
                    position: "absolute",
                    left: c * (cellSize + GAP),
                    top: r * (cellSize + GAP),
                    width: cellSize,
                    height: cellSize,
                    border: "1px solid rgba(212,175,55,0.06)",
                    borderRadius: 3,
                    zIndex: 2,
                  }}
                />
              ))
            )}

            {/* 결과 원 */}
            {cells.map((cell, i) => {
              const bankerColor = colorMap?.banker ?? "#ef4444"
              const playerColor = colorMap?.player ?? "#3b82f6"
              const color = cell.result === "banker" ? bankerColor : playerColor
              const isLatest = i === cells.length - 1
              return (
                <div
                  key={i}
                  style={{
                    position: "absolute",
                    left: cell.col * (cellSize + GAP),
                    top: cell.row * (cellSize + GAP),
                    width: cellSize,
                    height: cellSize,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 2,
                  }}
                >
                  {/* 원 */}
                  <div style={{
                    width: cellSize - 4,
                    height: cellSize - 4,
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

        {/* 뒷면 */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backfaceVisibility: "hidden",
            transform: "rotateY(180deg)",
            background: "linear-gradient(145deg, #0d1a0f, #091209)",
            border: "1px solid rgba(212,175,55,0.3)",
            borderRadius: 8,
          }}
        />
      </div>
    </div>
  )
}

interface BaccaratGameProps {
  onCardsChange?: (data: { playerCards: Card[]; bankerCards: Card[]; pScore: number; bScore: number; result: GameState["result"]; finalCard: Card | null }) => void
  /** BaccaratGame이 page에 startDeal 함수를 등록 */
  onStartDealRequest?: (handler: () => void) => void
  /** BaccaratGame이 page에 applyFinalDigit 함수를 등록 */
  onFinalDigitRequest?: (handler: (digit: number) => void) => void
  /** BaccaratGame이 page에 setBetSide 함수를 등록 — 배팅 사이드를 딜 전에 주입 */
  onBetSideRequest?: (handler: (side: BetSide) => void) => void
  /** BaccaratGame이 page에 resetCards 함수를 등록 — 라운드 전환 시 카드 초기화 */
  onResetRequest?: (handler: () => void) => void
  /** history/roundCount 변경 시 page로 전달 */
  onRoadChange?: (history: RoadResult[], round: number) => void
}

// ─── 메인 게임 컴포넌트 ────────────────────────────────────────────────────
export default function BaccaratGame({ onCardsChange, onStartDealRequest, onFinalDigitRequest, onBetSideRequest, onResetRequest, onRoadChange }: BaccaratGameProps = {}) {
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
    finalCard: null,
  })

  const dealingRef = useRef(false)
  const priceRef = useRef(0)
  // 현재 라운드 배팅 가이드 (BakaBettingGame이 15초 전에 주입)
  const betSideRef = useRef<BetSide>(null)
  // 딜 중간 상태 보관 (finalDigit 수신 시 이어서 계산)
  const midStateRef = useRef<{
    finalP: Card[]
    finalB: Card[]
    betSide: BetSide   // 이 라운드 배팅 사이드 스냅샷
  } | null>(null)

  // ── 가격 수신 (priceDisplay 업데이트) ────────────────────────────────────
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

  // 끝자리 기반 결과는 applyFinalDigit 내부에서 직접 계산 (digit <= 4 = player, <= 8 = banker, 9 = tie)
  // 별도 이벤트/전역 변수 불필요

  // ─── 초기 history 불러오기 (DB) ───────────────────────────────────────
  useEffect(() => {
    fetch("/api/baccarat/road")
      .then(r => r.json())
      .then(data => {
        if (data.road && Array.isArray(data.road)) {
          // 최근 50개만 유지 (카운트+빅로드 기준)
          const recent = data.road.slice(-50)
          // DB total로 roundCount 초기화 — 클라이언트 없이도 #1부터 누적
          const dbTotal = data.stats?.total ?? recent.length
          setState(prev => ({
            ...prev,
            history: recent,
            roundCount: dbTotal,  // DB 누적 라운드 수로 시작
          }))
        }
      })
      .catch(err => console.error("[v0] Failed to load initial BigRoad history:", err))
  }, [])

  // history/roundCount 변경 시 page로 전달
  useEffect(() => {
    onRoadChange?.(state.history, state.roundCount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.history, state.roundCount])

  // ─── 15초 딜 시작 ────────────────────────────────────────────────────────
  // 규칙:
  //   - 플레이어/타이 베팅: Player 1장(임의), Banker 2장(임의)
  //   - 뱅커 베팅:          Banker 1장(임의), Player 2장(임의)
  //   - 0초 끝자리 카드: 베팅 사이드(Player/Banker)의 마지막 카드 → 승부 결정
  //   - 끝자리 카드 받은 쪽 최종 점수 ≤5 → 상대방이 임의 1장 추가 (단, 이미 3장이면 스킵)
  const startDeal = useCallback(async () => {
    if (dealingRef.current) return
    dealingRef.current = true
    midStateRef.current = null

    const side = betSideRef.current  // null이면 배팅 없음 (관전 모드)

    // seed = 순수 라운드슬롯 번호 → 같은 라운드의 모든 클라이언트 동일한 카드
    const seeded = makeSeededRand(getRoundSeed())
    const rand = () => Math.floor(seeded() * 10)  // 0~9 카드 숫자
    const randSuit = () => Math.floor(seeded() * 4)   // 0~3 무늬

    setState(prev => ({ ...prev, phase: "dealing", playerCards: [], bankerCards: [], result: null }))
    await sleep(80)

    // 플레이어/뱅커 항상 각 2장씩 — P1, B1, P2, B2 순서 (바카라 정식 딜 순서)
    const p1 = digitToCard(rand(), randSuit())
    const b1 = digitToCard(rand(), randSuit())
    const p2 = digitToCard(rand(), randSuit())
    const b2 = digitToCard(rand(), randSuit())

    setState(prev => ({ ...prev, playerCards: [p1] }))
    await sleep(320)
    setState(prev => ({ ...prev, bankerCards: [b1] }))
    await sleep(320)
    setState(prev => ({ ...prev, playerCards: [p1, p2] }))
    await sleep(320)
    setState(prev => ({ ...prev, bankerCards: [b1, b2] }))
    await sleep(320)

    const finalP: Card[] = [p1, p2]
    const finalB: Card[] = [b1, b2]

    // 중간 상태 저장 → 0초 끝자리 카드 대기
    midStateRef.current = { finalP, finalB, betSide: side }
    setState(prev => ({ ...prev, playerCards: finalP, bankerCards: finalB }))
  }, [])

  // ─── 0초 끝자��� 카드 → 베팅 사이에 부여 → 추가 카드 연출 → 최종 승부 표시 ──
  // 규칙:
  //   1. 끝자리 카드를 betTarget(베팅 사이드)의 마지막 카드로 부여 (카드 연출)
  //   2. betTarget 점수 ≤5 → 상대방 추가 1장 연출 (이미 3장이면 스킵)
  //   3. 승부는 반드시 승자 기반으로 결정 (0~4=player, 5~8=banker, 9=tie)
  //      → 카드 점수는 연출용이며 승부에 영향 없음 (유저 간 일관성 보장)
  const applyFinalDigit = useCallback(async (closingPrice: number) => {
    // midStateRef가 아직 준비 안 됐으면 최대 3초 대기 (startDeal 애니메이션 딜레이 대응)
    let mid = midStateRef.current
    if (!mid) {
      for (let i = 0; i < 30; i++) {
        await sleep(100)
        mid = midStateRef.current
        if (mid) break
      }
    }
    if (!mid) return  // 3초 대기 후에도 없으면 (딜 시작 안 됨) 무시

    let { finalP, finalB } = mid
    midStateRef.current = null

    // 소수점 2자리 추출: toFixed(2) 문자열 파싱 → 부동소수점 오차 없음
    const decStr = closingPrice.toFixed(2).split(".")[1] ?? "00"
    const bankerDigit = parseInt(decStr[0] ?? "0")   // 소수점 첫째 자리 → 뱅커
    const playerDigit = parseInt(decStr[1] ?? "0")   // 소수점 둘째 자리 → 플레이어

    // 무늬 seed: 라운드 기반 고정값 → 모든 기기 동일
    const finalSeeded = makeSeededRand(getRoundSeed() + 9999)
    const finalRandSuit = () => Math.floor(finalSeeded() * 4)

    const bankerCard = digitToCard(bankerDigit, finalRandSuit())
    const playerCard = digitToCard(playerDigit, finalRandSuit())

    // 1. 뱅커 카드 팝업
    setState(prev => ({ ...prev, finalCard: bankerCard }))
    await sleep(950)

    // 2. 뱅커 카드 추가
    finalB = [...finalB, bankerCard]
    setState(prev => ({ ...prev, bankerCards: finalB, finalCard: null }))
    await sleep(350)

    // 3. 플레이어 카드 팝업
    setState(prev => ({ ...prev, finalCard: playerCard }))
    await sleep(950)

    // 4. 플레이어 카드 추가
    finalP = [...finalP, playerCard]
    setState(prev => ({ ...prev, playerCards: finalP, finalCard: null }))
    await sleep(350)

    // 5. 승부 결정: BTC 끝자리 기반 (카드 연출은 시각적 표현일 뿐, 승패는 규칙 우선)
    // 소수점 둘째 자리(playerDigit) 기준: 0~4=player, 5~8=banker, 9=tie
    const decStr2 = closingPrice.toFixed(2).split(".")[1] ?? "00"
    const finalPlayerDigit = parseInt(decStr2[1] ?? "0")
    const btcResult: "player" | "banker" | "tie" =
      finalPlayerDigit <= 4 ? "player" : finalPlayerDigit <= 8 ? "banker" : "tie"

    // 카드 점수는 표시용으로만 사용
    const pScore = handScore(finalP)
    const bScore = handScore(finalB)

    setState(prev => ({
      ...prev,
      phase: "result",
      result: btcResult,
      playerCards: finalP,
      bankerCards: finalB,
      roundCount: prev.roundCount + 1,
      history: [...prev.history.slice(-49), btcResult],
      finalCard: null,
    }))

    dealingRef.current = false
    // btcResult를 dispatch — baka-betting-game의 settle()이 이 값을 승패 판정에 사용
    window.dispatchEvent(new CustomEvent("baccarat:deal-complete", { detail: { result: btcResult, pScore, bScore } }))
  }, [])

  // 라운드 전환 시 카드 초기화 — dealing 중이 아닐 때만 리셋
  const resetCards = useCallback(() => {
    if (dealingRef.current) return  // 딜 중에는 리셋 무시
    setState(prev => ({
      ...prev,
      phase: "betting",
      playerCards: [],
      bankerCards: [],
      result: null,
      finalCard: null,
    }))
    betSideRef.current = null
  }, [])

  // 콜백 등록
  useEffect(() => { onResetRequest?.(resetCards) }, [onResetRequest, resetCards])
  useEffect(() => { onStartDealRequest?.(startDeal) }, [onStartDealRequest, startDeal])
  useEffect(() => { onFinalDigitRequest?.(applyFinalDigit) }, [onFinalDigitRequest, applyFinalDigit])
  useEffect(() => {
    onBetSideRequest?.((side) => { betSideRef.current = side })
  }, [onBetSideRequest])

  const pScore = handScore(state.playerCards)
  const bScore = handScore(state.bankerCards)

  // 카드 상태를 부모로 전달 (차트 오버레이용)
  useEffect(() => {
    onCardsChange?.({ playerCards: state.playerCards, bankerCards: state.bankerCards, pScore, bScore, result: state.result, finalCard: state.finalCard ?? null })
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
      {/* BACCARAT 타이틀 헤더 */}
      <div
        style={{
          borderBottom: "1px solid rgba(212,175,55,0.1)",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: "rgba(212,175,55,0.03)",
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 800, color: "#d4af37", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          Baccarat
        </span>
        <span style={{ fontSize: 10, color: "rgba(212,175,55,0.5)", border: "1px solid rgba(212,175,55,0.2)", padding: "2px 8px", borderRadius: 4, letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
          BTC 끝자리 기반
        </span>
      </div>

      {/* 차트 */}
      <div style={{ padding: "10px 12px 0" }}>
        <BitcoinChart />
      </div>

      {/* 30초 마감 기준가 */}
      <div style={{ padding: "0 12px 12px" }}>
        <ClosingPrices />
      </div>

    </div>
  )
}

// ─── 카드 캐릭터 오버레이 컴포넌트 ──────────────────────────────────────────
// 영상 우선, 없으면 이미지 폴백. betting 단계 시작 시 영상 재생.
function CardCharacterDisplay({ roundSeed, card, phase }: {
  roundSeed: number
  card: Card | null
  phase: Phase
}) {
  const { data: videoData } = useSWR<{ videos: Array<{ url: string; pathname: string }> }>(
    "/api/card-videos",
    swrFetcher,
    { refreshInterval: 60000, revalidateOnFocus: false }
  )
  const { data: imageData } = useSWR<{ images: Array<{ url: string; pathname: string }> }>(
    "/api/card-images",
    swrFetcher,
    { refreshInterval: 60000, revalidateOnFocus: false }
  )

  const videos = videoData?.videos ?? []
  const images = imageData?.images ?? []

  // 영상 우선, 없으면 이미지 폴백
  const hasVideo = videos.length > 0
  const selectedVideo = hasVideo ? videos[roundSeed % videos.length] : null
  const selectedImage = images.length > 0 ? images[roundSeed % images.length] : null
  const imgSrc = selectedImage?.url ?? "/images/baccarat-card-girl.jpg"

  const videoRef = useRef<HTMLVideoElement>(null)

  // betting 단계 시작 시 영상 처음부터 재생
  useEffect(() => {
    if (!selectedVideo || !videoRef.current) return
    if (phase === "betting") {
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => { })
    }
  }, [phase, selectedVideo?.url])

  const suitColor = "#ffffff"
  const label = card?.label ?? ""
  const suit = card?.suit ?? ""

  return (
    <div style={{
      marginTop: 12,
      position: "relative",
      borderRadius: 14,
      overflow: "hidden",
      border: "2px solid rgba(212,175,55,0.35)",
      boxShadow: "0 6px 32px rgba(0,0,0,0.6), inset 0 0 0 1px rgba(212,175,55,0.1)",
      background: "#0a0f0a",
      aspectRatio: "2/3",
    }}>
      {/* 영상 or 이미지 */}
      {hasVideo && selectedVideo ? (
        <video
          ref={videoRef}
          src={selectedVideo.url}
          muted
          playsInline
          preload="auto"
          style={{ width: "100%", height: "100%", display: "block", objectFit: "cover", objectPosition: "top" }}
        />
      ) : (
        <img
          src={imgSrc}
          alt="Baccarat card character"
          style={{ width: "100%", height: "100%", display: "block", objectFit: "cover", objectPosition: "top" }}
        />
      )}

      {/* 카드 정보가 있을 때만 오버레이 표시 */}
      {card && (
        <>
          {/* 좌상단 — 숫자 + 무늬 */}
          <div style={{
            position: "absolute", top: 10, left: 12,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
          }}>
            <span style={{ fontSize: 46, fontWeight: 900, lineHeight: 1, color: suitColor, fontFamily: "Georgia, serif" }}>
              {label}
            </span>
            <span style={{ fontSize: 38, lineHeight: 1, color: suitColor }}>
              {suit}
            </span>
          </div>

          {/* 우하단 — 180도 회전 */}
          <div style={{
            position: "absolute", bottom: 10, right: 12,
            display: "flex", flexDirection: "column", alignItems: "center", gap: 0,
            transform: "rotate(180deg)",
          }}>
            <span style={{ fontSize: 46, fontWeight: 900, lineHeight: 1, color: suitColor, fontFamily: "Georgia, serif" }}>
              {label}
            </span>
            <span style={{ fontSize: 38, lineHeight: 1, color: suitColor }}>
              {suit}
            </span>
          </div>
        </>
      )}

      {/* 카드 정보 없을 때: 대기 표시 */}
      {!card && (
        <div style={{
          position: "absolute", top: 10, left: 12,
          fontSize: 11, color: "rgba(212,175,55,0.5)", letterSpacing: "0.06em",
          fontStyle: "italic",
        }}>
          대기 중
        </div>
      )}

      {/* 카드 테두리 금장 장식선 */}
      <div style={{
        position: "absolute", inset: 6,
        borderRadius: 10,
        border: "1px solid rgba(212,175,55,0.3)",
        pointerEvents: "none",
      }} />
    </div>
  )
}
