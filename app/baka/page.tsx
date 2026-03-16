"use client"

import { useState, useCallback, useRef, useEffect, useMemo } from "react"
import useSWR from "swr"
const swrFetcher = (url: string) => fetch(url).then(r => r.json())
import BaccaratGame from "@/components/baka/baccarat-game"
import { BakaBettingGame } from "@/components/baka/baka-betting-game"
import { TopBar } from "@/components/dashboard/top-bar"
import { BitcoinChart } from "@/components/dashboard/bitcoin-chart"
import { useIsMobile } from "@/hooks/use-mobile"
import { ClosingPrices } from "@/components/dashboard/closing-prices"
import { ProjectAnalytics } from "@/components/dashboard/project-analytics"
import { ClosingPricesBadges } from "@/components/dashboard/closing-prices-badges"

interface Card { suit: string; value: number; label: string; id: string }
interface CardOverlayData {
  playerCards: Card[]
  bankerCards: Card[]
  pScore: number
  bScore: number
  result: "player" | "banker" | "tie" | null
  finalCard: Card | null
  betTarget: "player" | "banker" | null
}

// ─── Confetti 파티클 ──────────────────────────────────────────────────────────
const COLORS = ["#d4af37","#ef4444","#3b82f6","#22c55e","#f59e0b","#ec4899","#ffffff"]
function ConfettiCanvas({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  useEffect(() => {
    if (!active) return
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext("2d")!
    canvas.width = window.innerWidth; canvas.height = window.innerHeight
    const particles = Array.from({ length: 160 }, () => ({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 4,
      vy: 2 + Math.random() * 4,
      rot: Math.random() * 360,
      rotV: (Math.random() - 0.5) * 8,
      w: 8 + Math.random() * 8,
      h: 4 + Math.random() * 6,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: 1,
    }))
    let frame = 0
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      particles.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.rot += p.rotV
        if (frame > 80) p.alpha = Math.max(0, p.alpha - 0.012)
        ctx.save()
        ctx.globalAlpha = p.alpha
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rot * Math.PI) / 180)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h)
        ctx.restore()
      })
      frame++
      if (frame < 160) rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(rafRef.current); ctx.clearRect(0, 0, canvas.width, canvas.height) }
  }, [active])
  if (!active) return null
  return <canvas ref={canvasRef} style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 9999 }} />
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
  // 카드 캐릭터 이미지 목록 (fly 카드에도 동일하게 사용)
  const { data: cardImagesData } = useSWR<{ images: Array<{ url: string }> }>(
    "/api/card-images", swrFetcher, { refreshInterval: 60000, revalidateOnFocus: false }
  )
  const cardImgSrc = useMemo(() => {
    const imgs = cardImagesData?.images ?? []
    if (imgs.length === 0) return "/images/baccarat-card-girl.jpg"
    return imgs[Math.floor(Date.now() / 30000) % imgs.length].url
  }, [cardImagesData])
  // PC: 1.6배 확대, 모바일: 1배 유지
  const S = isMobile ? 1 : 1.6
  const [cardData, setCardData] = useState<CardOverlayData>({
    playerCards: [], bankerCards: [], pScore: 0, bScore: 0, result: null, finalCard: null, betTarget: null,
  })
  const [baccaratResult, setBaccaratResult] = useState<BaccaratResult>(null)

  // 카드 fly 애니메이션 단계: idle → expand → fly → land → done
  type FlyPhase = "idle" | "expand" | "fly" | "land"
  const [flyPhase, setFlyPhase] = useState<FlyPhase>("idle")
  const [flyCard, setFlyCard] = useState<Card | null>(null)
  const [flyTarget, setFlyTarget] = useState<"player" | "banker" | null>(null)
  const [confettiActive, setConfettiActive] = useState(false)
  const [winnerLabel, setWinnerLabel] = useState<string | null>(null)
  // 카드 이미지 영역 ref (fly 시작 위치)
  const cardImgRef = useRef<HTMLDivElement>(null)
  // 플레이어/뱅커 카드 영역 ref (fly 착지 위치)
  const playerAreaRef = useRef<HTMLDivElement>(null)
  const bankerAreaRef = useRef<HTMLDivElement>(null)

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
    // finalCard 새로 도착 → fly 애니메이션 시작
    if (data.finalCard && data.betTarget) {
      setFlyCard(data.finalCard)
      setFlyTarget(data.betTarget)
      setFlyPhase("expand")
      // expand 유지 600ms → fly 시작
      setTimeout(() => setFlyPhase("fly"), 600)
      // fly 600ms → land
      setTimeout(() => setFlyPhase("land"), 1200)
      // land 500ms → idle
      setTimeout(() => {
        setFlyPhase("idle")
        // 이겼으면 confetti + 승리 텍스트
        if (data.result && data.result !== "tie") {
          const won = data.result
          setWinnerLabel(won === "player" ? "PLAYER WIN!" : "BANKER WIN!")
          setConfettiActive(true)
          setTimeout(() => { setConfettiActive(false); setWinnerLabel(null) }, 3000)
        }
      }, 1700)
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

  // fly 카드의 시작/끝 위치 계산
  const [flyFrom, setFlyFrom] = useState({ x: 0, y: 0, w: 0, h: 0 })
  const [flyTo, setFlyTo]   = useState({ x: 0, y: 0, w: 0, h: 0 })
  useEffect(() => {
    if (flyPhase !== "expand") return
    const src = cardImgRef.current?.getBoundingClientRect()
    const dst = (flyTarget === "player" ? playerAreaRef : bankerAreaRef).current?.getBoundingClientRect()
    if (src) setFlyFrom({ x: src.left, y: src.top, w: src.width, h: src.height })
    if (dst) setFlyTo({ x: dst.left, y: dst.top, w: dst.width, h: dst.height })
  }, [flyPhase, flyTarget])

  const isFlying = flyPhase !== "idle"

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "radial-gradient(ellipse at 50% 30%, #0f2a1a 0%, #081510 60%, #050d0a 100%)" }}
    >
      {/* CSS keyframes */}
      <style>{`
        @keyframes cardDeal { from{opacity:0;transform:rotateY(90deg)} to{opacity:1;transform:rotateY(0deg)} }
        @keyframes flyExpand {
          0%   { transform: scale(1); opacity: 1; }
          100% { transform: scale(1.08); opacity: 1; }
        }
        @keyframes flyMove {
          0%   { opacity: 1; }
          80%  { opacity: 1; }
          100% { opacity: 0; }
        }
        @keyframes winPop {
          0%   { opacity: 0; transform: translate(-50%,-50%) scale(0.4); }
          60%  { opacity: 1; transform: translate(-50%,-50%) scale(1.15); }
          80%  { transform: translate(-50%,-50%) scale(0.95); }
          100% { opacity: 1; transform: translate(-50%,-50%) scale(1); }
        }
      `}</style>

      {/* Confetti */}
      <ConfettiCanvas active={confettiActive} />

      {/* 승리 텍스트 */}
      {winnerLabel && (
        <div style={{
          position: "fixed", top: "42%", left: "50%",
          transform: "translate(-50%,-50%)",
          zIndex: 9998,
          fontSize: "clamp(36px, 6vw, 72px)",
          fontWeight: 900,
          letterSpacing: "0.08em",
          color: winnerLabel.startsWith("PLAYER") ? "#3b82f6" : "#ef4444",
          textShadow: "0 0 40px currentColor, 0 4px 20px rgba(0,0,0,0.8)",
          animation: "winPop 0.5s cubic-bezier(0.23,1,0.32,1) forwards",
          pointerEvents: "none",
          whiteSpace: "nowrap",
        }}>
          {winnerLabel}
        </div>
      )}

      {/* Fly 카드 — position:fixed, 시작→끝 위치 CSS transition */}
      {isFlying && flyCard && (() => {
        const isFly  = flyPhase === "fly" || flyPhase === "land"
        const tx = isFly ? flyTo.x   : flyFrom.x
        const ty = isFly ? flyTo.y   : flyFrom.y
        const tw = isFly ? flyTo.w   : flyFrom.w
        const th = isFly ? flyTo.h   : flyFrom.h
        const op = flyPhase === "land" ? 0 : 1
        const sc = flyPhase === "expand" ? 1.08 : flyPhase === "land" ? 0.85 : 1
        return (
          <div style={{
            position: "fixed",
            left: tx, top: ty,
            width: tw, height: th,
            zIndex: 9997,
            pointerEvents: "none",
            transition: isFly
              ? "left 0.55s cubic-bezier(0.4,0,0.2,1), top 0.55s cubic-bezier(0.4,0,0.2,1), width 0.55s, height 0.55s, opacity 0.3s, transform 0.3s"
              : "transform 0.15s",
            opacity: op,
            transform: `scale(${sc})`,
            transformOrigin: "center center",
            borderRadius: 14,
            overflow: "hidden",
            border: "2px solid rgba(212,175,55,0.6)",
            boxShadow: "0 8px 40px rgba(212,175,55,0.3), 0 0 0 1px rgba(212,175,55,0.2)",
          }}>
            {/* 카드 이미지 */}
            <img src={cardImgSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top", display: "block" }} />
            {/* 카드 숫자/무늬 오버레이 */}
            <div style={{ position: "absolute", top: 8, left: 10, display: "flex", flexDirection: "column", gap: 0 }}>
              <span style={{ fontSize: 40, fontWeight: 900, lineHeight: 1, color: "#fff", fontFamily: "Georgia, serif" }}>{flyCard.label}</span>
              <span style={{ fontSize: 32, lineHeight: 1, color: "#fff" }}>{flyCard.suit}</span>
            </div>
            <div style={{ position: "absolute", bottom: 8, right: 10, transform: "rotate(180deg)", display: "flex", flexDirection: "column", gap: 0 }}>
              <span style={{ fontSize: 40, fontWeight: 900, lineHeight: 1, color: "#fff", fontFamily: "Georgia, serif" }}>{flyCard.label}</span>
              <span style={{ fontSize: 32, lineHeight: 1, color: "#fff" }}>{flyCard.suit}</span>
            </div>
            <div style={{ position: "absolute", inset: 6, borderRadius: 10, border: "1px solid rgba(212,175,55,0.35)", pointerEvents: "none" }} />
          </div>
        )
      })()}

      {/* TopBar */}
      <div style={{ background: "rgba(5,13,10,0.95)", borderBottom: "1px solid rgba(212,175,55,0.12)" }}>
        <TopBar />
      </div>

      <main className="max-w-7xl mx-auto p-3 md:p-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* 왼쪽: 차트 */}
          <div className="lg:col-span-2 space-y-4">
            {/* 타이틀 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <h1
                  style={{
                    fontSize: 18,
                    fontWeight: 800,
                    color: "#d4af37",
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    margin: 0,
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
                    whiteSpace: "nowrap",
                  }}
                >
                  BTC 끝자리 기반
                </div>
              </div>

              {/* 게임 결과 — 오른쪽 정렬 */}
              {cardData.result && (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  {/* 결과 뱃지 */}
                  <span style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: "0.1em",
                    color: cardData.result === "banker" ? "#ef4444" : cardData.result === "player" ? "#3b82f6" : "#22c55e",
                    background: cardData.result === "banker" ? "rgba(239,68,68,0.12)" : cardData.result === "player" ? "rgba(59,130,246,0.12)" : "rgba(34,197,94,0.12)",
                    border: `1px solid ${cardData.result === "banker" ? "rgba(239,68,68,0.35)" : cardData.result === "player" ? "rgba(59,130,246,0.35)" : "rgba(34,197,94,0.35)"}`,
                    padding: "2px 10px",
                    borderRadius: 6,
                  }}>
                    {cardData.result === "banker" ? "BANKER WIN" : cardData.result === "player" ? "PLAYER WIN" : "TIE"}
                  </span>
                  {/* 스코어 */}
                  <span style={{ fontSize: 13, color: "rgba(212,175,55,0.65)", fontVariantNumeric: "tabular-nums" }}>
                    <span style={{ color: "#ef4444", fontWeight: 800 }}>{cardData.bScore}</span>
                    <span style={{ margin: "0 6px", color: "rgba(212,175,55,0.3)" }}>:</span>
                    <span style={{ color: "#3b82f6", fontWeight: 800 }}>{cardData.pScore}</span>
                  </span>
                </div>
              )}
            </div>

            {/* 차트 + 카드 오버레이 */}
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
                      ref={side === "player" ? playerAreaRef : bankerAreaRef}
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
                        {cards.map(card => <OverlayCard key={card.id} card={card} s={S} />)}
                        {Array.from({ length: Math.max(0, 2 - cards.length) }).map((_, i) => <EmptySlot key={i} s={S} />)}
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
          </div>

          {/* 오른쪽: 바카라 카드 딜 게임 */}
          <div>
            <div
              ref={cardImgRef}
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
