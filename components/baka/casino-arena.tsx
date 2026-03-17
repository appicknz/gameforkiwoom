"use client"

import { useRef, useEffect } from "react"
import useSWR from "swr"

const swrFetcher = (url: string) => fetch(url).then(r => r.json())

type Phase = "betting" | "dealing" | "result"
type RoadResult = "player" | "banker" | "tie"

interface Card {
  suit: string
  value: number
  label: string
  id: string
}

interface CasinoArenaProps {
  phase: Phase
  playerCards: Card[]
  bankerCards: Card[]
  pScore: number
  bScore: number
  result: "player" | "banker" | "tie" | null
  history: RoadResult[]
  roundCount: number
  roundSeed: number
  finalCard: Card | null
  secondsLeft?: number          // 배팅 타이머 (0~30)
  playerPercent?: number        // 배팅 비율 (0~100)
  bankerPercent?: number
  tiePercent?: number
}

// Big Road constants
const MAX_ROWS = 6
const CELL = 18
const GAP = 2

interface BigRoadCell {
  col: number
  row: number
  result: "player" | "banker"
  tieCount: number
}

function buildBigRoad(history: RoadResult[]): BigRoadCell[] {
  const cells: BigRoadCell[] = []
  let col = -1
  let row = 0
  let lastNonTie: "player" | "banker" | null = null

  for (const result of history) {
    if (result === "tie") {
      if (cells.length > 0) cells[cells.length - 1].tieCount += 1
      continue
    }
    if (result !== lastNonTie) {
      col += 1; row = 0; lastNonTie = result
    } else {
      row += 1
      if (row >= MAX_ROWS) { col += 1; row = MAX_ROWS - 1 }
    }
    cells.push({ col, row, result, tieCount: 0 })
  }
  return cells
}

function MiniCard({ card }: { card: Card }) {
  const isRed = card.suit === "♥" || card.suit === "♦"
  return (
    <div style={{
      width: 38, height: 54,
      background: "#fff",
      borderRadius: 5,
      border: "1.5px solid rgba(0,0,0,0.15)",
      boxShadow: "0 2px 8px rgba(0,0,0,0.35)",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      justifyContent: "flex-start",
      padding: "3px 4px",
      position: "relative",
    }}>
      <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1, color: isRed ? "#c0392b" : "#1a1a2e", fontFamily: "Georgia, serif" }}>
        {card.label}
      </span>
      <span style={{ fontSize: 11, lineHeight: 1, color: isRed ? "#c0392b" : "#1a1a2e" }}>
        {card.suit}
      </span>
    </div>
  )
}

// 딜러 캐릭터: aef- prefix 이미지 우선, 없으면 로컬 폴백
function DealerCharacter({ roundSeed, phase }: { roundSeed: number; phase: Phase }) {
  const { data } = useSWR<{ videos: Array<{ url: string; pathname: string; size: number }> }>(
    "/api/card-videos",
    swrFetcher,
    { refreshInterval: 60000, revalidateOnFocus: false }
  )
  const { data: imgData } = useSWR<{ images: Array<{ url: string; pathname: string }> }>(
    "/api/card-images",
    swrFetcher,
    { refreshInterval: 60000, revalidateOnFocus: false }
  )

  const videos = data?.videos ?? []
  // aef- prefix 이미지만 필터
  const aefImages = (imgData?.images ?? []).filter(img =>
    img.pathname.split("/").pop()?.startsWith("aef")
  )

  const hasVideo = videos.length > 0
  const selectedVideo = hasVideo ? videos[roundSeed % videos.length] : null
  const selectedAef = aefImages.length > 0 ? aefImages[roundSeed % aefImages.length] : null
  const fallbackSrc = "/images/aef-dealer.jpg"

  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (!selectedVideo || !videoRef.current) return
    if (phase === "betting") {
      videoRef.current.currentTime = 0
      videoRef.current.play().catch(() => {})
    }
  }, [phase, selectedVideo?.url])

  const imgSrc = selectedAef?.url ?? fallbackSrc

  return (
    <div style={{
      position: "absolute",
      bottom: "100%",
      left: "50%",
      transform: "translateX(-50%)",
      width: "min(260px, 45%)",
      aspectRatio: "3/4",
      overflow: "hidden",
      zIndex: 10,
    }}>
      {hasVideo && selectedVideo ? (
        <video
          ref={videoRef}
          src={selectedVideo.url}
          muted playsInline preload="auto"
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center" }}
        />
      ) : (
        <img
          src={imgSrc}
          alt="Dealer"
          style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top center", display: "block" }}
        />
      )}
      {/* subtle bottom fade into table */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: "30%",
        background: "linear-gradient(to top, rgba(120,80,20,0.85) 0%, transparent 100%)",
      }} />
    </div>
  )
}

// 타이머 원형
function TimerRing({ secondsLeft = 30, phase }: { secondsLeft?: number; phase: Phase }) {
  const total = 30
  const progress = Math.max(0, Math.min(1, secondsLeft / total))
  const r = 28
  const circ = 2 * Math.PI * r
  const dash = circ * progress

  const color = secondsLeft > 10 ? "#6ea8e8" : secondsLeft > 5 ? "#f59e0b" : "#ef4444"

  return (
    <div style={{
      position: "relative", width: 72, height: 72,
      display: "flex", alignItems: "center", justifyContent: "center",
    }}>
      <svg width={72} height={72} style={{ position: "absolute", top: 0, left: 0, transform: "rotate(-90deg)" }}>
        <circle cx={36} cy={36} r={r} fill="rgba(0,0,0,0.5)" stroke="rgba(255,255,255,0.1)" strokeWidth={4} />
        <circle
          cx={36} cy={36} r={r}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.5s linear, stroke 0.3s" }}
        />
      </svg>
      <span style={{ fontSize: 20, fontWeight: 800, color: color, position: "relative", zIndex: 1 }}>
        {phase === "dealing" ? "⟳" : secondsLeft}
      </span>
    </div>
  )
}

export function CasinoArena({
  phase,
  playerCards,
  bankerCards,
  pScore,
  bScore,
  result,
  history,
  roundCount,
  roundSeed,
  finalCard,
  secondsLeft = 30,
  playerPercent = 0,
  bankerPercent = 0,
  tiePercent = 0,
}: CasinoArenaProps) {
  const pCount = history.filter(h => h === "player").length
  const bCount = history.filter(h => h === "banker").length
  const tCount = history.filter(h => h === "tie").length

  // Big Road — last 30 for bottom panel
  const displayHistory = history.slice(-30)
  const cells = buildBigRoad(displayHistory)
  const maxCol = cells.length > 0 ? Math.max(...cells.map(c => c.col)) : 0
  const gridW = (maxCol + 1) * (CELL + GAP)
  const gridH = MAX_ROWS * (CELL + GAP)

  const resultLabel = result === "player" ? "PLAYER" : result === "banker" ? "BANKER" : result === "tie" ? "TIE" : null
  const resultColor = result === "player" ? "#4a9eff" : result === "banker" ? "#e05a5a" : "#3cb371"

  return (
    <div style={{
      fontFamily: "'Segoe UI', sans-serif",
      background: "#1a0f05",
      color: "#fff",
      userSelect: "none",
      overflow: "hidden",
      position: "relative",
    }}>

      {/* ── 상단 스탯 바 ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "6px 14px",
        background: "rgba(0,0,0,0.5)",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        fontSize: 12,
      }}>
        <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11 }}>#{roundCount}</span>
        <div style={{ display: "flex", gap: 14 }}>
          <span style={{ color: "#4a9eff", fontWeight: 700 }}>P {pCount}</span>
          <span style={{ color: "#e05a5a", fontWeight: 700 }}>B {bCount}</span>
          <span style={{ color: "#3cb371", fontWeight: 700 }}>T {tCount}</span>
        </div>
      </div>

      {/* ── 메인 테이블 영역 ── */}
      <div style={{
        position: "relative",
        paddingBottom: 20,
        paddingTop: 16,
        minHeight: 320,
      }}>

        {/* 반원형 테이블 felt */}
        <div style={{
          position: "absolute",
          bottom: 0, left: "50%",
          transform: "translateX(-50%)",
          width: "110%",
          height: "55%",
          background: "radial-gradient(ellipse at 50% 100%, #8B6914 0%, #6B4F0F 40%, #4a3508 100%)",
          borderRadius: "50% 50% 0 0 / 100% 100% 0 0",
          boxShadow: "0 -4px 32px rgba(0,0,0,0.6), inset 0 -2px 0 rgba(255,255,255,0.05)",
          zIndex: 1,
        }} />
        {/* 테이블 테두리 */}
        <div style={{
          position: "absolute",
          bottom: 0, left: "50%",
          transform: "translateX(-50%)",
          width: "112%",
          height: "57%",
          borderRadius: "50% 50% 0 0 / 100% 100% 0 0",
          border: "3px solid #8B6914",
          boxSizing: "border-box",
          zIndex: 0,
        }} />

        {/* 딜러 캐릭터 (테이블 위 중앙) */}
        <div style={{
          position: "absolute",
          bottom: "54%",
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 5,
          width: "min(260px, 50%)",
          aspectRatio: "3/4",
          overflow: "hidden",
        }}>
          <DealerCharacter roundSeed={roundSeed} phase={phase} />
        </div>

        {/* PLAYER / BANKER 레이블 */}
        <div style={{
          position: "absolute", zIndex: 3,
          bottom: "22%", left: 0, right: 0,
          display: "flex", justifyContent: "space-between",
          padding: "0 12%",
        }}>
          <span style={{
            fontSize: "clamp(14px, 3vw, 22px)", fontWeight: 900,
            color: "#c8a84b",
            letterSpacing: "0.12em",
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
            fontFamily: "Georgia, serif",
          }}>PLAYER</span>
          <span style={{
            fontSize: "clamp(14px, 3vw, 22px)", fontWeight: 900,
            color: "#c8a84b",
            letterSpacing: "0.12em",
            textShadow: "0 2px 8px rgba(0,0,0,0.8)",
            fontFamily: "Georgia, serif",
          }}>BANKER</span>
        </div>

        {/* 카드 영역 */}
        <div style={{
          position: "absolute", zIndex: 4,
          bottom: "5%", left: 0, right: 0,
          display: "flex", justifyContent: "space-between",
          padding: "0 6%",
          alignItems: "flex-end",
        }}>
          {/* Player cards */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {playerCards.map((c, i) => <MiniCard key={c.id ?? i} card={c} />)}
              {playerCards.length === 0 && phase !== "result" && (
                <div style={{ width: 38, height: 54, borderRadius: 5, border: "1.5px dashed rgba(200,168,75,0.3)", background: "rgba(255,255,255,0.04)" }} />
              )}
            </div>
            <span style={{ fontSize: 18, fontWeight: 800, color: playerCards.length > 0 ? "#4a9eff" : "rgba(255,255,255,0.2)" }}>
              {playerCards.length > 0 ? pScore : "-"}
            </span>
          </div>

          {/* Center timer */}
          <div style={{ position: "relative", zIndex: 6 }}>
            <TimerRing secondsLeft={secondsLeft} phase={phase} />
            {/* Result flash */}
            {resultLabel && phase === "result" && (
              <div style={{
                position: "absolute", top: "50%", left: "50%",
                transform: "translate(-50%, -50%)",
                background: resultColor,
                color: "#fff",
                fontWeight: 900,
                fontSize: 11,
                padding: "3px 8px",
                borderRadius: 20,
                whiteSpace: "nowrap",
                boxShadow: `0 0 20px ${resultColor}80`,
                zIndex: 10,
              }}>
                {resultLabel}
              </div>
            )}
          </div>

          {/* Banker cards */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ display: "flex", gap: 4 }}>
              {bankerCards.map((c, i) => <MiniCard key={c.id ?? i} card={c} />)}
              {bankerCards.length === 0 && phase !== "result" && (
                <div style={{ width: 38, height: 54, borderRadius: 5, border: "1.5px dashed rgba(200,168,75,0.3)", background: "rgba(255,255,255,0.04)" }} />
              )}
            </div>
            <span style={{ fontSize: 18, fontWeight: 800, color: bankerCards.length > 0 ? "#e05a5a" : "rgba(255,255,255,0.2)" }}>
              {bankerCards.length > 0 ? bScore : "-"}
            </span>
          </div>
        </div>

        {/* finalCard 오버레이 (카드 심볼 + 무늬) */}
        {finalCard && (
          <div style={{
            position: "absolute", top: 10, right: 12, zIndex: 8,
            background: "rgba(0,0,0,0.7)",
            border: "1.5px solid rgba(212,175,55,0.5)",
            borderRadius: 8,
            padding: "4px 10px",
            display: "flex", alignItems: "center", gap: 6,
          }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: "#fff", fontFamily: "Georgia, serif" }}>{finalCard.label}</span>
            <span style={{ fontSize: 20, color: (finalCard.suit === "♥" || finalCard.suit === "♦") ? "#e05a5a" : "#fff" }}>{finalCard.suit}</span>
          </div>
        )}
      </div>

      {/* ── 하단 통계 패널 ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr 1fr",
        borderTop: "1px solid rgba(255,255,255,0.08)",
      }}>
        {/* Player bet % */}
        <div style={{
          padding: "10px 12px",
          background: "rgba(74,158,255,0.08)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#4a9eff", fontWeight: 800, fontSize: 15 }}>Player</span>
            <span style={{ color: "#4a9eff", fontWeight: 700, fontSize: 13 }}>{playerPercent}%</span>
          </div>
          <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
            <div style={{ height: "100%", width: `${playerPercent}%`, background: "#4a9eff", borderRadius: 2, transition: "width 0.4s" }} />
          </div>
        </div>

        {/* Tie */}
        <div style={{
          padding: "10px 12px",
          background: "rgba(60,179,113,0.08)",
          borderRight: "1px solid rgba(255,255,255,0.06)",
          display: "flex", flexDirection: "column", gap: 4,
          alignItems: "center",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
            <span style={{ color: "#3cb371", fontWeight: 800, fontSize: 15 }}>Tie</span>
            <span style={{ color: "#3cb371", fontWeight: 700, fontSize: 13 }}>{tiePercent}%</span>
          </div>
          <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2, width: "100%" }}>
            <div style={{ height: "100%", width: `${tiePercent}%`, background: "#3cb371", borderRadius: 2, transition: "width 0.4s" }} />
          </div>
        </div>

        {/* Banker bet % */}
        <div style={{
          padding: "10px 12px",
          background: "rgba(224,90,90,0.08)",
          display: "flex", flexDirection: "column", gap: 4,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#e05a5a", fontWeight: 800, fontSize: 15 }}>Banker</span>
            <span style={{ color: "#e05a5a", fontWeight: 700, fontSize: 13 }}>{bankerPercent}%</span>
          </div>
          <div style={{ height: 3, background: "rgba(255,255,255,0.1)", borderRadius: 2 }}>
            <div style={{ height: "100%", width: `${bankerPercent}%`, background: "#e05a5a", borderRadius: 2, transition: "width 0.4s" }} />
          </div>
        </div>
      </div>

      {/* ── Big Road ── */}
      <div style={{
        padding: "8px 10px",
        background: "rgba(0,0,0,0.3)",
        borderTop: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)", marginBottom: 5, letterSpacing: "0.08em" }}>
          BIG ROAD
        </div>
        <div style={{ overflowX: "auto" }}>
          <svg
            width={Math.max(gridW + CELL + GAP, 200)}
            height={gridH + GAP}
            style={{ display: "block" }}
          >
            {cells.map((cell, i) => {
              const x = cell.col * (CELL + GAP)
              const y = cell.row * (CELL + GAP)
              const color = cell.result === "player" ? "#4a9eff" : "#e05a5a"
              return (
                <g key={i}>
                  <circle
                    cx={x + CELL / 2} cy={y + CELL / 2} r={CELL / 2 - 1}
                    fill="none" stroke={color} strokeWidth={1.8}
                  />
                  {cell.tieCount > 0 && (
                    <line
                      x1={x + 2} y1={y + CELL - 2}
                      x2={x + CELL - 2} y2={y + 2}
                      stroke="#3cb371" strokeWidth={1.5}
                    />
                  )}
                </g>
              )
            })}
          </svg>
        </div>
      </div>
    </div>
  )
}
