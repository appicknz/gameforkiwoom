"use client"

import { useState, useCallback, useRef } from "react"
import BaccaratGame, { BigRoad, type RoadResult } from "@/components/baka/baccarat-game"
import { BakaBettingGame } from "@/components/baka/baka-betting-game"
import { TopBar } from "@/components/dashboard/top-bar"
import { useIsMobile } from "@/hooks/use-mobile"
import { ClosingPrices } from "@/components/dashboard/closing-prices"
import { ProjectAnalytics } from "@/components/dashboard/project-analytics"
import { ClosingPricesBadges } from "@/components/dashboard/closing-prices-badges"
import { BitcoinChart } from "@/components/dashboard/bitcoin-chart"

interface Card { suit: string; value: number; label: string; id: string }
interface CardOverlayData {
  playerCards: Card[]
  bankerCards: Card[]
  pScore: number
  bScore: number
  result: "player" | "banker" | "tie" | null
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
            {/* 배팅 기준가 / 현재가 헤더 */}
            <BitcoinChart headerOnly />

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
                      {cards.map(card => <OverlayCard key={card.id} card={card} s={S} />)}
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

        {/* 하단 통계 섹션 */}
        <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ClosingPrices />
          <div className="flex flex-col gap-4">
            <ClosingPricesBadges />
            <ProjectAnalytics />
          </div>
        </div>

      </main>
    </div>
  )
}
