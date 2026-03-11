"use client"

import { useState, useCallback } from "react"
import BaccaratGame from "@/components/baka/baccarat-game"
import { TopBar } from "@/components/dashboard/top-bar"
import { BitcoinChart } from "@/components/dashboard/bitcoin-chart"

interface Card { suit: string; value: number; label: string; id: string }
interface CardOverlayData {
  playerCards: Card[]
  bankerCards: Card[]
  pScore: number
  bScore: number
  result: "player" | "banker" | "tie" | null
}

// 카드 슬롯 — 차트 위 오버레이용 (compact)
function OverlayCard({ card }: { card: Card }) {
  const isRed = card.suit === "♥" || card.suit === "♦"
  return (
    <div style={{
      width: 36, height: 52, borderRadius: 6,
      background: "linear-gradient(145deg,#1c1408,#12100a)",
      border: "1px solid rgba(212,175,55,0.5)",
      display: "flex", flexDirection: "column", justifyContent: "space-between",
      padding: "3px 4px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.7)",
      animation: "cardDeal 0.35s cubic-bezier(0.23,1,0.32,1)",
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: isRed ? "#e85c5c" : "#d4af37", lineHeight: 1 }}>
        {card.label}<span style={{ fontSize: 8 }}>{card.suit}</span>
      </div>
      <div style={{ fontSize: 15, textAlign: "center", color: isRed ? "#e85c5c" : "#d4af37", lineHeight: 1 }}>{card.suit}</div>
      <div style={{ fontSize: 11, fontWeight: 700, color: isRed ? "#e85c5c" : "#d4af37", lineHeight: 1, alignSelf: "flex-end", transform: "rotate(180deg)" }}>
        {card.label}
      </div>
    </div>
  )
}

function EmptySlot() {
  return (
    <div style={{
      width: 36, height: 52, borderRadius: 6,
      border: "1px dashed rgba(212,175,55,0.2)",
      background: "rgba(212,175,55,0.02)",
    }} />
  )
}

export default function BakaPage() {
  const [cardData, setCardData] = useState<CardOverlayData>({
    playerCards: [], bankerCards: [], pScore: 0, bScore: 0, result: null,
  })
  const handleCardsChange = useCallback((data: CardOverlayData) => setCardData(data), [])

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "#09080a" }}
    >
      {/* TopBar */}
      <div style={{ background: "#0d0b0e", borderBottom: "1px solid rgba(212,175,55,0.1)" }}>
        <TopBar />
      </div>

      <main className="max-w-7xl mx-auto p-3 md:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* 왼쪽: 차트 */}
          <div className="lg:col-span-2 space-y-4">
            {/* 타이틀 */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <h1
                style={{
                  fontSize: 18,
                  fontWeight: 800,
                  color: "#d4af37",
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                }}
              >
                Baccarat
              </h1>
              <div
                style={{
                  fontSize: 10,
                  color: "rgba(212,175,55,0.5)",
                  border: "1px solid rgba(212,175,55,0.2)",
                  padding: "2px 8px",
                  borderRadius: 4,
                  letterSpacing: "0.1em",
                }}
              >
                BTC 끝자리 기반
              </div>
            </div>

            {/* 차트 + 카드 오버레이 */}
            <style>{`@keyframes cardDeal{from{opacity:0;transform:rotateY(90deg)}to{opacity:1;transform:rotateY(0deg)}}`}</style>
            <div className="relative">
              <BitcoinChart />
              {/* BANKER / PLAYER 카드 오버레이 */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ top: 56, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8, justifyContent: "flex-start", alignItems: "center" }}
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
                        borderRadius: 10,
                        border: `1px solid ${isWinner ? accentColor + "99" : "rgba(212,175,55,0.18)"}`,
                        background: isWinner ? `${accentColor}12` : "rgba(9,8,10,0.72)",
                        backdropFilter: "blur(6px)",
                        padding: "8px 10px",
                        transition: "border-color 0.3s, background 0.3s",
                        boxShadow: isWinner ? `0 0 18px ${accentColor}28` : "0 2px 12px rgba(0,0,0,0.5)",
                        width: "fit-content",
                        minWidth: 140,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: accentColor }}>{label}</span>
                        {isWinner && <span style={{ fontSize: 9, background: accentColor, color: "#fff", padding: "1px 5px", borderRadius: 3, fontWeight: 700 }}>WIN</span>}
                        {cards.length > 0 && (
                          <span style={{ fontSize: 16, fontWeight: 800, color: score >= 8 ? "#d4af37" : "rgba(232,213,163,0.85)", lineHeight: 1, marginLeft: "auto" }}>{score}</span>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        {cards.map(card => <OverlayCard key={card.id} card={card} />)}
                        {Array.from({ length: Math.max(0, 2 - cards.length) }).map((_, i) => <EmptySlot key={i} />)}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 게임 규칙 요약 */}
            <div
              className="rounded-2xl"
              style={{
                border: "1px solid rgba(212,175,55,0.1)",
                background: "rgba(212,175,55,0.03)",
                padding: "14px 16px",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(212,175,55,0.7)", letterSpacing: "0.1em", marginBottom: 10 }}>
                게임 방식
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {[
                  {
                    title: "카드 생성",
                    desc: "비트코인 실시간 가격의 1의 자리 숫자가 카드 값으로 사용됩니다. (예: 68944.31 → 4)",
                  },
                  {
                    title: "바카라 규칙",
                    desc: "9에 가까운 쪽이 승리. 10·J·Q·K = 0점, A = 1점. 합산은 10으로 나눈 나머지.",
                  },
                  {
                    title: "배당",
                    desc: "Player 1:1 · Banker 1:0.95 (5% 커미션) · Tie 8:1",
                  },
                ].map(({ title, desc }) => (
                  <div
                    key={title}
                    style={{
                      background: "rgba(212,175,55,0.04)",
                      border: "1px solid rgba(212,175,55,0.1)",
                      borderRadius: 8,
                      padding: "10px 12px",
                    }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#d4af37", marginBottom: 5 }}>{title}</div>
                    <div style={{ fontSize: 11, color: "rgba(232,213,163,0.5)", lineHeight: 1.6 }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 오른쪽: 바카라 게임 */}
          <div>
            <div
              className="rounded-2xl overflow-hidden sticky top-4"
              style={{
                border: "1px solid rgba(212,175,55,0.2)",
                boxShadow: "0 0 50px rgba(212,175,55,0.06)",
              }}
            >
              <BaccaratGame onCardsChange={handleCardsChange} />
            </div>
          </div>

        </div>
      </main>
    </div>
  )
}
