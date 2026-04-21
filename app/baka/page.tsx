"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import BaccaratGame, { BigRoad, type RoadResult } from "@/components/baka/baccarat-game"
import { BakaBettingGame } from "@/components/baka/baka-betting-game"
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

const BANKER_COLOR = "#ef4444"
const PLAYER_COLOR = "#3b82f6"
const GOLD = "#d4af37"

// 헤더: 현재가 왼쪽, BANKER/PLAYER 끝자리 카드 오른쪽
function BakaHeader() {
  const [price, setPrice] = useState<string>("—")
  const [bankerDigit, setBankerDigit] = useState<string>("—")
  const [playerDigit, setPlayerDigit] = useState<string>("—")

  useEffect(() => {
    const onPrice = (e: Event) => {
      const { price: p } = (e as CustomEvent<{ price: number }>).detail
      setPrice(`$${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
      const dec = p.toFixed(2).split(".")[1] ?? "00"
      setBankerDigit(dec[0] ?? "0")
      setPlayerDigit(dec[1] ?? "0")
    }
    window.addEventListener("baka:price", onPrice)
    return () => window.removeEventListener("baka:price", onPrice)
  }, [])

  return (
    <div style={{
      background: "rgba(5,13,10,0.92)",
      border: "1px solid rgba(212,175,55,0.2)",
      borderRadius: 16,
      padding: "10px 16px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}>
      {/* 왼쪽: 현재가 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 10, color: "rgba(212,175,55,0.5)", letterSpacing: "0.06em" }}>현재가</span>
        <span style={{ fontSize: 22, fontWeight: 700, color: GOLD, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.01em" }}>{price}</span>
      </div>

      {/* 오른쪽: BANKER / PLAYER 끝자리 카드 */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
        {/* BANKER 카드 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 9, fontWeight: 600, color: `${BANKER_COLOR}99`, letterSpacing: "0.06em" }}>BANKER</span>
          <div style={{
            width: 42, height: 58,
            borderRadius: 7,
            background: "linear-gradient(145deg,#1c1408,#12100a)",
            border: `1.5px solid ${BANKER_COLOR}88`,
            boxShadow: `0 0 10px ${BANKER_COLOR}33, 0 3px 10px rgba(0,0,0,0.6)`,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "space-between",
            padding: "4px 4px",
          }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: BANKER_COLOR, lineHeight: 1, alignSelf: "flex-start" }}>{bankerDigit}</span>
            <span style={{ fontSize: 24, fontWeight: 900, color: BANKER_COLOR, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{bankerDigit}</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: BANKER_COLOR, lineHeight: 1, alignSelf: "flex-end", transform: "rotate(180deg)" }}>{bankerDigit}</span>
          </div>
        </div>

        <span style={{ color: "rgba(212,175,55,0.3)", fontSize: 18, fontWeight: 300, paddingBottom: 10 }}>/</span>

        {/* PLAYER 카드 */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 9, fontWeight: 600, color: `${PLAYER_COLOR}99`, letterSpacing: "0.06em" }}>PLAYER</span>
          <div style={{
            width: 42, height: 58,
            borderRadius: 7,
            background: "linear-gradient(145deg,#1c1408,#12100a)",
            border: `1.5px solid ${PLAYER_COLOR}88`,
            boxShadow: `0 0 10px ${PLAYER_COLOR}33, 0 3px 10px rgba(0,0,0,0.6)`,
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "space-between",
            padding: "4px 4px",
          }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: PLAYER_COLOR, lineHeight: 1, alignSelf: "flex-start" }}>{playerDigit}</span>
            <span style={{ fontSize: 24, fontWeight: 900, color: PLAYER_COLOR, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{playerDigit}</span>
            <span style={{ fontSize: 11, fontWeight: 800, color: PLAYER_COLOR, lineHeight: 1, alignSelf: "flex-end", transform: "rotate(180deg)" }}>{playerDigit}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// 헤더 아래 실시간 가격 바 (최근 득점 바 스타일)
function BakaLivePriceBar() {
  const [prices, setPrices] = useState<number[]>([])
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onPrice = (e: Event) => {
      const { price } = (e as CustomEvent<{ price: number }>).detail
      setPrices(prev => [...prev.slice(-19), price])
    }
    window.addEventListener("baka:price", onPrice)
    return () => window.removeEventListener("baka:price", onPrice)
  }, [])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollLeft = listRef.current.scrollWidth
  }, [prices])

  if (prices.length === 0) return null

  const latest = prices[prices.length - 1]

  return (
    <div style={{
      background: "rgba(5,13,10,0.9)",
      border: "1px solid rgba(212,175,55,0.15)",
      borderRadius: 12,
      padding: "8px 14px",
      display: "flex",
      alignItems: "center",
      gap: 6,
      overflow: "hidden",
    }}>
      <span style={{ fontSize: 10, color: "rgba(212,175,55,0.5)", whiteSpace: "nowrap", marginRight: 2 }}>
        실시간 가격:
      </span>
      <div ref={listRef} style={{ display: "flex", gap: 6, overflowX: "auto", alignItems: "center" }}>
        {prices.map((p, i) => {
          const prev = prices[i - 1]
          const up = prev !== undefined ? p > prev : null
          const color = up === null ? "rgba(255,255,255,0.4)" : up ? "#10b981" : "#ef4444"
          const isCurrent = i === prices.length - 1
          return (
            <span key={i} style={{
              fontSize: 11,
              background: isCurrent ? "rgba(16,185,129,0.12)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${isCurrent ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.07)"}`,
              borderRadius: 6,
              padding: "2px 8px",
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
              flexShrink: 0,
              color,
              fontWeight: isCurrent ? 700 : 400,
            }}>
              ${p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          )
        })}
      </div>
    </div>
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
  const [priceState, setPriceState] = useState<{ base: number | null; current: number | null }>({ base: null, current: null })
  const handlePriceChange = useCallback((base: number | null, current: number | null) => {
    setPriceState({ base, current })
  }, [])


  // BaccaratGame이 자신의 함수를 여기에 등록 → BakaBettingGame 트리거가 호출
  const startDealRef = useRef<(() => void) | null>(null)
  const applyFinalDigitRef = useRef<((digit: number) => void) | null>(null)
  const setBetSideRef = useRef<((side: "player" | "banker" | "tie" | null) => void) | null>(null)
  const resetCardsRef = useRef<(() => void) | null>(null)

  const handleCardsChange = useCallback((data: CardOverlayData) => {
    setCardData(data)
    setBaccaratResult(data.result)
    if (data.result) {
      window.dispatchEvent(new CustomEvent("baccarat:result", { detail: data.result }))
    }
  }, [])

  // BaccaratGame → page: 함수 등록
  const handleRegisterResetCards = useCallback((fn: () => void) => { resetCardsRef.current = fn }, [])
  const handleRegisterStartDeal = useCallback((fn: () => void) => { startDealRef.current = fn }, [])
  const handleRegisterFinalDigit = useCallback((fn: (digit: number) => void) => { applyFinalDigitRef.current = fn }, [])
  const handleRegisterBetSide = useCallback((fn: (side: "player" | "banker" | "tie" | null) => void) => { setBetSideRef.current = fn }, [])

  // BakaBettingGame → page: 트리거
  const handleResetCardsTrigger = useCallback(() => { resetCardsRef.current?.() }, [])
  const handleStartDealTrigger = useCallback(() => { startDealRef.current?.() }, [])
  const handleFinalDigitTrigger = useCallback((digit: number) => { applyFinalDigitRef.current?.(digit) }, [])
  const handleBetSideTrigger = useCallback((side: "player" | "banker" | "tie" | null) => { setBetSideRef.current?.(side) }, [])

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "radial-gradient(ellipse at 50% 30%, #0f2a1a 0%, #081510 60%, #050d0a 100%)" }}
    >
      <main className="max-w-7xl mx-auto p-3 md:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* 왼쪽: BigRoad + 카드 오버레이 */}
          <div className="lg:col-span-2 space-y-4">
            {/* 헤더: 기준가 왼쪽, 뱅커/플레이어 끝자리 오른쪽 (/race 스타일) */}
            <BakaHeader />

            {/* 실시간 가격 바 */}
            <BakaLivePriceBar />

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
              {/* 게임 상태 박스 — 중앙, /race VerticalTimer 스타일 */}
              {(() => {
                const { timeLeft } = gameStatus
                // 페이즈 구조: 정산(5s) rem 30→25 / 배팅(15s) rem 25→10 / 게임중(10s) rem 10→0
                const phases = [
                  {
                    label: "정산",
                    duration: 5,
                    active: timeLeft > 25,
                    countdown: timeLeft > 25 ? timeLeft - 25 : 5,
                    color: "#60a5fa",
                    pct: timeLeft > 25 ? (timeLeft - 25) / 5 : 0,
                  },
                  {
                    label: "배팅",
                    duration: 15,
                    active: timeLeft <= 25 && timeLeft > 10,
                    countdown: timeLeft <= 25 && timeLeft > 10 ? timeLeft - 10 : 15,
                    color: "#10b981",
                    pct: timeLeft <= 25 && timeLeft > 10 ? (timeLeft - 10) / 15 : 0,
                  },
                  {
                    label: "게임중",
                    duration: 10,
                    active: timeLeft <= 10 && timeLeft > 0,
                    countdown: timeLeft <= 10 && timeLeft > 0 ? timeLeft : 10,
                    color: timeLeft <= 3 ? "#ef4444" : "#f97316",
                    pct: timeLeft <= 10 && timeLeft > 0 ? timeLeft / 10 : 0,
                  },
                ]
                const activePhase = phases.find(p => p.active) ?? phases[0]
                return (
                  <div style={{
                    width: Math.round(52 * S),
                    flexShrink: 0,
                    order: 1,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: Math.round(4 * S),
                  }}>
                    {/* 3단계 세로 블록 */}
                    {phases.map((p) => (
                      <div
                        key={p.label}
                        style={{
                          width: Math.round(44 * S),
                          borderRadius: Math.round(6 * S),
                          padding: `${Math.round(4 * S)}px ${Math.round(4 * S)}px`,
                          background: p.active ? `${p.color}18` : "rgba(255,255,255,0.03)",
                          border: `1px solid ${p.active ? p.color + "55" : "rgba(255,255,255,0.07)"}`,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: Math.round(2 * S),
                          transition: "background 0.3s, border-color 0.3s",
                        }}
                      >
                        {/* 라벨 */}
                        <span style={{
                          fontSize: Math.round(8 * S),
                          fontWeight: 600,
                          color: p.active ? p.color : "rgba(255,255,255,0.22)",
                          letterSpacing: "0.04em",
                          lineHeight: 1,
                        }}>{p.label}</span>
                        {/* 숫자 카운트다운 */}
                        <span style={{
                          fontSize: Math.round(15 * S),
                          fontWeight: 800,
                          color: p.active ? p.color : "rgba(255,255,255,0.15)",
                          fontVariantNumeric: "tabular-nums",
                          lineHeight: 1,
                        }}>{p.active ? p.countdown : p.duration}</span>
                        {/* 세로 진행 바 */}
                        <div style={{
                          width: Math.round(28 * S),
                          height: Math.round(3 * S),
                          borderRadius: 99,
                          background: "rgba(255,255,255,0.06)",
                          overflow: "hidden",
                        }}>
                          <div style={{
                            height: "100%",
                            width: p.active ? `${p.pct * 100}%` : "100%",
                            background: p.active ? p.color : "rgba(255,255,255,0.08)",
                            borderRadius: 99,
                            transition: "width 0.8s linear",
                          }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
              {(["banker", "player"] as const).map((side, idx) => {
                const cards = side === "banker" ? cardData.bankerCards : cardData.playerCards
                const score = side === "banker" ? cardData.bScore : cardData.pScore  // 끝자리
                const oppScore = side === "banker" ? cardData.pScore : cardData.bScore
                const rawSum = cards.reduce((s, c) => s + c.value, 0)               // 합산 전체
                const label = side === "banker" ? "BANKER" : "PLAYER"
                const accentColor = side === "banker" ? "#ef4444" : "#3b82f6"
                const isWinner = cardData.result === side
                const isHigher = score > oppScore
                const hasCards = cards.length > 0
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
                      {/* 합산 전체 + 끝자리 동그라미 */}
                      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: Math.round(4 * S) }}>
                        {hasCards && rawSum !== score && (
                          <span style={{ fontSize: Math.round(11 * S), fontWeight: 600, color: "rgba(232,213,163,0.4)", lineHeight: 1 }}>{rawSum}</span>
                        )}
                        <div style={{
                          width: Math.round(30 * S), height: Math.round(30 * S),
                          borderRadius: "50%",
                          border: `2px solid ${isHigher ? "#d4af37" : isWinner && cardData.result === "tie" ? "rgba(232,213,163,0.5)" : "rgba(232,213,163,0.25)"}`,
                          background: isHigher ? "rgba(212,175,55,0.18)" : "rgba(0,0,0,0.2)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          boxShadow: isHigher ? `0 0 ${Math.round(8*S)}px rgba(212,175,55,0.4)` : "none",
                        }}>
                          <span style={{
                            fontSize: Math.round(15 * S), fontWeight: 900,
                            color: isHigher ? "#d4af37" : "rgba(232,213,163,0.7)",
                            lineHeight: 1,
                          }}>{score}</span>
                        </div>
                      </div>
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
              onResetCards={handleResetCardsTrigger}
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
                onResetRequest={handleRegisterResetCards}
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
