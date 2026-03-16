"use client"

import { useState, useCallback, useRef } from "react"
import BaccaratGame from "@/components/baka/baccarat-game"
import { BakaBettingGame } from "@/components/baka/baka-betting-game"
import { TopBar } from "@/components/dashboard/top-bar"
import { BitcoinChart } from "@/components/dashboard/bitcoin-chart"
import { useIsMobile } from "@/hooks/use-mobile"
import { ClosingPrices } from "@/components/dashboard/closing-prices"
import { ProjectAnalytics } from "@/components/dashboard/project-analytics"
import { ClosingPricesBadges } from "@/components/dashboard/closing-prices-badges"
import { BaccaratHeader } from "@/components/baka/baccarat-header"

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

          {/* 왼쪽: 차트 */}
          <div className="lg:col-span-2 space-y-4">
            {/* 차트 + 카드 오버레이 */}
            <style>{`@keyframes cardDeal{from{opacity:0;transform:rotateY(90deg)}to{opacity:1;transform:rotateY(0deg)}}`}</style>
            <div className="relative">
              <BitcoinChart />
              {/* BANKER / PLAYER 카드 오버레이 */}
              <div
                className="absolute inset-0 pointer-events-none z-20"
                style={{
                  top: 0,
                  padding: `${Math.round(10 * S)}px ${Math.round(12 * S)}px`,
                  display: "flex", flexDirection: "column",
                  gap: Math.round(8 * S),
                  justifyContent: isMobile ? "center" : "flex-start",
                  alignItems: "center",
                }}
              >
                {(["banker", "player"] as const).map((side) => {
                  const cards = side === "banker" ? cardData.bankerCards : cardData.playerCards
                  const score = side === "banker" ? cardData.bScore : cardData.pScore
                  const label = side === "banker" ? "BANKER" : "PLAYER"
                  const accentColor = side === "banker" ? "#ef4444" : "#3b82f6"
                  const isWinner = cardData.result === side
                  return (
                    <div
                      key={side}
                      style={{
                        borderRadius: Math.round(10 * S),
                        border: `1px solid ${isWinner ? accentColor + "99" : "rgba(212,175,55,0.18)"}`,
                        background: isWinner ? `${accentColor}12` : "rgba(9,8,10,0.72)",
                        backdropFilter: "blur(6px)",
                        padding: `${Math.round(8 * S)}px ${Math.round(10 * S)}px`,
                        transition: "border-color 0.3s, background 0.3s",
                        boxShadow: isWinner ? `0 0 ${Math.round(18 * S)}px ${accentColor}28` : `0 2px ${Math.round(12 * S)}px rgba(0,0,0,0.5)`,
                        width: "fit-content",
                        minWidth: Math.round(140 * S),
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: Math.round(8 * S), marginBottom: Math.round(7 * S) }}>
                        <span style={{ fontSize: Math.round(10 * S), fontWeight: 700, letterSpacing: "0.12em", color: accentColor }}>{label}</span>
                        {isWinner && <span style={{ fontSize: Math.round(9 * S), background: accentColor, color: "#fff", padding: `1px ${Math.round(5 * S)}px`, borderRadius: 3, fontWeight: 700 }}>WIN</span>}
                        {cards.length > 0 && (
                          <span style={{ fontSize: Math.round(16 * S), fontWeight: 800, color: score >= 8 ? "#d4af37" : "rgba(232,213,163,0.85)", lineHeight: 1, marginLeft: "auto" }}>{score}</span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: Math.round(6 * S) }}>
                        {cards.map((card, ci) => <OverlayCard key={`${side}-${ci}-${card.id}`} card={card} s={S} />)}
                        {Array.from({ length: Math.max(0, 2 - cards.length) }).map((_, i) => <EmptySlot key={`${side}-empty-${i}`} s={S} />)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 배팅 게임 (기존 6종목 + 바카라) */}
            <BakaBettingGame
              onStartDealTrigger={handleStartDealTrigger}
              onFinalDigitTrigger={handleFinalDigitTrigger}
              onBetSideTrigger={handleBetSideTrigger}
            />

            {/* 게임 결과 헤더 바 */}
            <BaccaratHeader
              result={cardData.result}
              bScore={cardData.bScore}
              pScore={cardData.pScore}
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
