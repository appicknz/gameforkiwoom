"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import BaccaratGame, { BigRoad, type RoadResult } from "@/components/baka/baccarat-game"
import { BakaBettingGame } from "@/components/baka/baka-betting-game"
import { TopBar } from "@/components/dashboard/top-bar"
import { useIsMobile } from "@/hooks/use-mobile"
import { ClosingPrices } from "@/components/dashboard/closing-prices"
import { ProjectAnalytics } from "@/components/dashboard/project-analytics"

interface Card { suit: string; value: number; label: string; id: string }
interface CardOverlayData {
  playerCards: Card[]
  bankerCards: Card[]
  pScore: number
  bScore: number
  result: "player" | "banker" | "tie" | null
  finalCard?: Card | null
}

type BaccaratResult = "player" | "banker" | "tie" | null

// 카드 슬롯 — 차트 위 오버레이용 (scale 지원)
function OverlayCard({ card, s = 1 }: { card: Card; s?: number }) {
  const isRed = card.suit === "♥" || card.suit === "♦"
  const W = Math.round(36 * s)
  const H = Math.round(52 * s)
  const R = Math.round(6 * s)
  const P = `${Math.round(3 * s)}px ${Math.round(4 * s)}px`
  return (
    <div style={{
      width: W, height: H, borderRadius: R,
      background: "linear-gradient(145deg,#1c1408,#12100a)",
      border: "1px solid rgba(212,175,55,0.5)",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      padding: P,
      boxShadow: "0 2px 8px rgba(0,0,0,0.7)",
      animation: "cardDeal 0.35s cubic-bezier(0.23,1,0.32,1)",
      flexShrink: 0,
    }}>
      <div style={{ fontSize: Math.round(11 * s), fontWeight: 700, color: isRed ? "#e85c5c" : "#d4af37", lineHeight: 1 }}>
        {card.label}<span style={{ fontSize: Math.round(8 * s) }}>{card.suit}</span>
      </div>
      <div style={{ fontSize: Math.round(15 * s), textAlign: "center", color: isRed ? "#e85c5c" : "#d4af37", lineHeight: 1 }}>{card.suit}</div>
      <div style={{ fontSize: Math.round(11 * s), fontWeight: 700, color: isRed ? "#e85c5c" : "#d4af37", lineHeight: 1, alignSelf: "flex-end", transform: "rotate(180deg)" }}>
        {card.label}
      </div>
    </div>
  )
}

function EmptySlot({ s = 1 }: { s?: number }) {
  return (
    <div style={{
      width: Math.round(36 * s), height: Math.round(52 * s), borderRadius: Math.round(6 * s),
      border: "1px dashed rgba(212,175,55,0.2)",
      background: "rgba(212,175,55,0.02)",
      flexShrink: 0,
    }} />
  )
}

// 배팅 기준가 + 30초 끝자리: baka:closing 이벤트 단일 소스
function HeaderBasePriceAndDigits() {
  const priceRef = useRef<HTMLSpanElement>(null)
  const digitsRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    // 초기값
    const init: { price: number }[] = (window as any).__bitcoinClosingPrices ?? []
    if (init.length > 0) {
      const p = init[init.length - 1].price
      if (priceRef.current) {
        priceRef.current.textContent = `$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      }
      // 30초 끝자리 두 자리: .XX 부분
      const truncated = Math.floor(p * 100)
      const d1 = Math.floor(truncated / 10) % 10  // 소수점 첫째 자리 (뱅커)
      const d2 = truncated % 10                    // 소수점 둘째 자리 (플레이어)
      if (digitsRef.current) {
        digitsRef.current.textContent = `B${d1} P${d2}`
      }
    }

    const onClosing = (e: Event) => {
      const { price } = (e as CustomEvent<{ price: number }>).detail
      if (priceRef.current) {
        priceRef.current.textContent = `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      }
      // 30초 끝자리 두 자리: .XX 부분
      const truncated = Math.floor(price * 100)
      const d1 = Math.floor(truncated / 10) % 10
      const d2 = truncated % 10
      if (digitsRef.current) {
        digitsRef.current.textContent = `B${d1} P${d2}`
      }
    }
    window.addEventListener("baka:closing", onClosing)
    return () => window.removeEventListener("baka:closing", onClosing)
  }, [])

  return { priceSpan: <span ref={priceRef}>—</span>, digitsSpan: <span ref={digitsRef}>—</span> }
}

export default function BakaPage() {
  const isMobile = useIsMobile()
  // PC: 1.6배 확대, 모바일: 1배 유지
  const S = isMobile ? 1 : 1.6
  const [cardData, setCardData] = useState<CardOverlayData>({
    playerCards: [], bankerCards: [], pScore: 0, bScore: 0, result: null,
  })
  const [baccaratResult, setBaccaratResult] = useState<BaccaratResult>(null)
  const [roadState, setRoadState] = useState<{ history: RoadResult[]; round: number }>({ history: [], round: 0 })
  const handleRoadChange = useCallback((history: RoadResult[], round: number) => {
    setRoadState({ history, round })
  }, [])
  const [gameStatus, setGameStatus] = useState<{ timeLeft: number; phase: "betting" | "waiting" | "result" | "dealing" }>({ timeLeft: 30, phase: "betting" })
  const handleStatusChange = useCallback((timeLeft: number, phase: "betting" | "waiting" | "result" | "dealing") => {
    setGameStatus({ timeLeft, phase })
  }, [])
  const [priceState, setPriceState] = useState<{ base: number | null; current: number | null }>({ base: null, current: null })
  const handlePriceChange = useCallback((base: number | null, current: number | null) => {
    setPriceState({ base, current })
  }, [])
  // 헤더 현재가: baka:price 이벤트로 DOM 직접 업데이트 (매 틱 리렌더 방지)
  const headerCurrentRef = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const onPrice = (e: Event) => {
      const { price } = (e as CustomEvent<{ price: number }>).detail
      if (headerCurrentRef.current) {
        // 소수점 정확히 2자리: 직접 포매팅
        headerCurrentRef.current.textContent = `$${price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`
      }
    }
    window.addEventListener("baka:price", onPrice)
    return () => window.removeEventListener("baka:price", onPrice)
  }, [])

  // BaccaratGame이 자신의 함수를 여기에 등록 → BakaBettingGame 트리거가 호출
  const startDealRef = useRef<(() => void) | null>(null)
  const applyFinalDigitRef = useRef<((digit: number) => void) | null>(null)
  const setBetSideRef = useRef<((side: "player" | "banker" | "tie" | null) => void) | null>(null)

  const handleCardsChange = useCallback((data: CardOverlayData) => {
    setCardData(data)
    setBaccaratResult(data.result)
    if (data.result) {
      window.dispatchEvent(new CustomEvent("baccarat:result", { detail: data.result }))
    }
  }, [])

  // BaccaratGame → page: 함수 등록
  const handleRegisterStartDeal = useCallback((fn: () => void) => { startDealRef.current = fn }, [])
  const handleRegisterFinalDigit = useCallback((fn: (digit: number) => void) => { applyFinalDigitRef.current = fn }, [])
  const handleRegisterBetSide = useCallback((fn: (side: "player" | "banker" | "tie" | null) => void) => { setBetSideRef.current = fn }, [])

  // BakaBettingGame → page: 트리거
  const handleStartDealTrigger = useCallback(() => { startDealRef.current?.() }, [])
  const handleFinalDigitTrigger = useCallback((digit: number) => { applyFinalDigitRef.current?.(digit) }, [])
  const handleBetSideTrigger = useCallback((side: "player" | "banker" | "tie" | null) => { setBetSideRef.current?.(side) }, [])

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "radial-gradient(ellipse at 50% 30%, #0f2a1a 0%, #081510 60%, #050d0a 100%)" }}
    >
      {/* TopBar */}
      <div style={{ background: "rgba(5,13,10,0.95)", borderBottom: "1px solid rgba(212,175,55,0.12)" }}>
        <TopBar />
      </div>

      <main className="max-w-7xl mx-auto p-3 md:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* 왼쪽: BigRoad + 카드 오버레이 */}
          <div className="lg:col-span-2 space-y-4">
            {/* 배팅 기준가 / 현재가 심플 헤더 */}
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              background: "rgba(5,15,10,0.92)",
              border: "1px solid rgba(212,175,55,0.15)",
              borderRadius: 12,
            }}>
              {/* 좌: BTC 아이콘 + 배팅 기준가 */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: "50%",
                  background: "radial-gradient(circle at 35% 35%, #f7931a, #c06000)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, fontWeight: 900, color: "#fff",
                  flexShrink: 0,
                }}>₿</div>
                <div>
                  <div style={{ fontSize: 9, color: "rgba(232,213,163,0.45)", letterSpacing: "0.06em", marginBottom: 1 }}>배팅 기준가</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#d4af37", fontVariantNumeric: "tabular-nums" }}>
                    {HeaderBasePriceAndDigits().priceSpan}
                  </div>
                </div>
              </div>
              {/* 우: 현재가 */}
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 9, color: "rgba(232,213,163,0.45)", letterSpacing: "0.06em", marginBottom: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#10b981", display: "inline-block" }} />
                  현재가
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#10b981" }}>
                  <span ref={headerCurrentRef}>—</span>
                </div>
              </div>
            </div>

            {/* BigRoad */}
            <style>{`@keyframes cardDeal{from{opacity:0;transform:rotateY(90deg)}to{opacity:1;transform:rotateY(0deg)}}@keyframes pulseDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:0.4;transform:scale(0.6)}}`}</style>
            <div style={{
              background: "rgba(5,15,10,0.92)",
              border: "1px solid rgba(212,175,55,0.2)",
              borderRadius: 16,
              overflow: "hidden",
              padding: "12px",
            }}>
              <BigRoad history={roadState.history} round={roadState.round} />
            </div>

            {/* ── 0초 끝자리 카드 센터 팝업 오버레이 ── */}
            {cardData.finalCard && (() => {
              const fc = cardData.finalCard!
              const isRed = fc.suit === "♥" || fc.suit === "♦"
              return (
                <div style={{
                  position: "fixed", inset: 0, zIndex: 9999,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: "rgba(0,0,0,0.55)",
                  animation: "fadeInOverlay 0.15s ease",
                }}>
                  <div style={{
                    background: "linear-gradient(145deg,#1c1408,#12100a)",
                    border: `3px solid ${isRed ? "#e85c5c" : "#d4af37"}`,
                    borderRadius: 20,
                    padding: "28px 36px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 8,
                    boxShadow: `0 0 60px ${isRed ? "#e85c5c" : "#d4af37"}80, 0 12px 48px rgba(0,0,0,0.8)`,
                    animation: "popupCard 0.35s cubic-bezier(0.34,1.56,0.64,1)",
                    minWidth: 160,
                  }}>
                    {/* 끝자리 숫자 크게 */}
                    <span style={{ fontSize: 80, fontWeight: 900, lineHeight: 1, color: isRed ? "#e85c5c" : "#d4af37", fontFamily: "Georgia, serif" }}>
                      {fc.label}
                    </span>
                    {/* 무늬 */}
                    <span style={{ fontSize: 48, lineHeight: 1, color: isRed ? "#e85c5c" : "#d4af37" }}>
                      {fc.suit}
                    </span>
                    <span style={{ fontSize: 12, color: "rgba(212,175,55,0.7)", letterSpacing: "0.1em", marginTop: 4 }}>
                      BTC 끝자리 카드
                    </span>
                  </div>
                  <style>{`
                    @keyframes fadeInOverlay { from { opacity: 0 } to { opacity: 1 } }
                    @keyframes popupCard { from { transform: scale(0.2) rotate(-15deg); opacity: 0 } to { transform: scale(1) rotate(0deg); opacity: 1 } }
                  `}</style>
                </div>
              )
            })()}

            {/* BANKER / PLAYER 카드 패널 + 중앙 상태 박스 */}
            <div style={{
              display: "flex",
              gap: Math.round(6 * S),
              alignItems: "stretch",
            }}>
              {/* 게임 상태 박스 — 중앙, 같은 높이 */}
              {(() => {
                const { timeLeft, phase } = gameStatus
                const statusColor = phase === "betting" ? "#10b981" : phase === "dealing" ? "#f97316" : "#6366f1"
                const statusLabel = phase === "betting" ? "배팅 가능" : phase === "dealing" ? "딜링 중" : phase === "result" ? "정산 중" : "대기 중"
                return (
                  <div style={{
                    width: Math.round(52 * S),
                    flexShrink: 0,
                    order: 1,
                    borderRadius: Math.round(10 * S),
                    border: `1px solid ${statusColor}55`,
                    background: `${statusColor}0d`,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: Math.round(4 * S),
                    padding: `${Math.round(6 * S)}px ${Math.round(4 * S)}px`,
                  }}>
                    {/* 원형 pulse 인디케이터 */}
                    <div style={{ position: "relative", width: Math.round(10 * S), height: Math.round(10 * S) }}>
                      <div style={{
                        width: "100%", height: "100%",
                        borderRadius: "50%",
                        background: statusColor,
                        animation: phase !== "result" ? "pulseDot 1.2s ease-in-out infinite" : "none",
                      }} />
                    </div>
                    {/* 상태 텍스트 */}
                    <span style={{
                      fontSize: Math.round(9 * S),
                      fontWeight: 700,
                      color: statusColor,
                      letterSpacing: "0.04em",
                      textAlign: "center",
                      lineHeight: 1.2,
                      writingMode: "vertical-rl",
                      textOrientation: "mixed",
                    }}>{statusLabel}</span>
                    {/* 타이머 */}
                    {phase !== "result" && (
                      <span style={{
                        fontSize: Math.round(14 * S),
                        fontWeight: 800,
                        color: statusColor,
                        fontVariantNumeric: "tabular-nums",
                        lineHeight: 1,
                      }}>{timeLeft}</span>
                    )}
                  </div>
                )
              })()}
              {(["banker", "player"] as const).map((side, idx) => {
                const cards = side === "banker" ? cardData.bankerCards : cardData.playerCards
                const score = side === "banker" ? cardData.bScore : cardData.pScore
                const label = side === "banker" ? "BANKER" : "PLAYER"
                const accentColor = side === "banker" ? "#ef4444" : "#3b82f6"
                const isWinner = cardData.result === side
                return (
                  <div
                    key={side}
                    style={{
                      flex: 1,
                      order: idx === 0 ? 0 : 2,
                      borderRadius: Math.round(10 * S),
                      border: `1px solid ${isWinner ? accentColor + "99" : "rgba(212,175,55,0.18)"}`,
                      background: isWinner ? `${accentColor}14` : "rgba(9,8,10,0.82)",
                      padding: `${Math.round(10 * S)}px ${Math.round(12 * S)}px`,
                      transition: "border-color 0.3s, background 0.3s",
                      boxShadow: isWinner ? `0 0 ${Math.round(18 * S)}px ${accentColor}28` : `0 2px ${Math.round(12 * S)}px rgba(0,0,0,0.4)`,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: Math.round(8 * S), marginBottom: Math.round(8 * S) }}>
                      <span style={{ fontSize: Math.round(10 * S), fontWeight: 700, letterSpacing: "0.12em", color: accentColor }}>{label}</span>
                      {isWinner && (
                        <span style={{ fontSize: Math.round(9 * S), background: accentColor, color: "#fff", padding: `1px ${Math.round(5 * S)}px`, borderRadius: 3, fontWeight: 700 }}>WIN</span>
                      )}
                      <span style={{ fontSize: Math.round(16 * S), fontWeight: 800, color: score >= 8 ? "#d4af37" : "rgba(232,213,163,0.85)", lineHeight: 1, marginLeft: "auto" }}>{score}</span>
                    </div>
                    <div style={{ display: "flex", gap: Math.round(6 * S) }}>
                      {cards.map((card, ci) => <OverlayCard key={`${card.id}-${ci}`} card={card} s={S} />)}
                      {Array.from({ length: Math.max(0, 2 - cards.length) }).map((_, i) => <EmptySlot key={i} s={S} />)}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* 배팅 게임 */}
            <BakaBettingGame
              onStartDealTrigger={handleStartDealTrigger}
              onFinalDigitTrigger={handleFinalDigitTrigger}
              onBetSideTrigger={handleBetSideTrigger}
              onStatusChange={handleStatusChange}
              onPriceChange={handlePriceChange}
            />
          </div>

          {/* 오른쪽: 바카라 카드 딜 게임 */}
          <div>
            <div
              className="rounded-2xl overflow-hidden sticky top-4"
              style={{
                border: "1px solid rgba(212,175,55,0.2)",
                boxShadow: "0 0 50px rgba(212,175,55,0.06)",
              }}
            >
              <BaccaratGame
                onCardsChange={handleCardsChange}
                onStartDealRequest={handleRegisterStartDeal}
                onFinalDigitRequest={handleRegisterFinalDigit}
                onBetSideRequest={handleRegisterBetSide}
                onRoadChange={handleRoadChange}
              />
            </div>
          </div>

        </div>



      </main>
    </div>
  )
}
