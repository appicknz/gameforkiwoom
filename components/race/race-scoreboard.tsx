"use client"

import { useEffect, useRef, useState } from "react"
import type { RaceState } from "./race-game"

const BIT_COLOR = "#3b82f6"
const COIN_COLOR = "#f97316"
const GOLD = "#d4af37"

// 숫자가 올라갈 때 애니메이션
function AnimatedScore({ value, color }: { value: number; color: string }) {
  const prevRef = useRef(value)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    if (value !== prevRef.current) {
      prevRef.current = value
      setFlash(true)
      const t = setTimeout(() => setFlash(false), 400)
      return () => clearTimeout(t)
    }
  }, [value])

  return (
    <span style={{
      fontVariantNumeric: "tabular-nums",
      // clamp: 모바일(375px=아이폰미니) ~ 데스크탑까지 반응형
      fontSize: "clamp(40px, 10vw, 80px)",
      fontWeight: 900,
      lineHeight: 1,
      color: flash ? "#fff" : color,
      textShadow: flash ? `0 0 32px ${color}, 0 0 8px ${color}` : "none",
      transition: "color 0.15s, text-shadow 0.15s",
      letterSpacing: "-1px",
      fontFamily: "Georgia, 'Times New Roman', serif",
      display: "block",
    }}>
      {value.toLocaleString()}
    </span>
  )
}

// SVG 외곽 트랙: 전체 컴포넌트 테두리를 따라 아이콘이 한 바퀴
// 레이싱 240초 기준, 상단 가운데(12시 방향)에서 출발 → 시계방향
function OrbitTrack({
  phase,
  timeLeft,
  leading,
}: {
  phase: string
  timeLeft: number
  leading: "bit" | "coin" | "tie"
}) {
  const isRacing = phase === "racing"
  const color = leading === "bit" ? BIT_COLOR : leading === "coin" ? COIN_COLOR : GOLD
  const icon = leading === "bit" ? "₿" : leading === "coin" ? "◎" : "="

  // 240초 중 경과 비율 (0→1)
  const elapsed = isRacing ? Math.max(0, 240 - timeLeft) : 0
  const progress = elapsed / 240 // 0=출발, 1=한바퀴 완료

  // SVG 경로: 외곽 rect (상단 가운데 12시 방향 시작, 시계방향)
  // viewBox는 실제 컴포넌트 크기와 무관하게 100×100으로 정규화
  // r=18 (border-radius 약 20px)
  const r = 8 // rounded corner radius (normalized)
  const W = 100, H = 100

  // 직사각형 둘레 길이 (r 코너 포함)
  // 상단 가운데(50, 0)에서 시계방향: 오른쪽→하단→왼쪽→상단 복귀
  // motion-path: 'M 50 0 L (W-r) 0 Q W 0 W r L W (H-r) Q W H (W-r) H L r H Q 0 H 0 (H-r) L 0 r Q 0 0 r 0 Z'
  // stroke-dashoffset으로 진행도 표현
  const pathD = `M 50 0 L ${W - r} 0 Q ${W} 0 ${W} ${r} L ${W} ${H - r} Q ${W} ${H} ${W - r} ${H} L ${r} ${H} Q 0 ${H} 0 ${H - r} L 0 ${r} Q 0 0 ${r} 0 Z`

  // 둘레 길이 근사치 (직선 + 코너)
  const perimeter = 2 * (W - 2 * r) + 2 * (H - 2 * r) + 2 * Math.PI * r
  const dashOffset = perimeter * (1 - progress)

  // 아이콘 위치: progress에 따라 경로 위 좌표 계산
  // 상단 직선(50→W-r), 오른쪽 코너, 오른쪽 수직, 하단 코너, 하단 직선, 좌측 코너, 좌측 수직, 상단 코너, 상단 직선(r→50)
  function getPoint(t: number): { x: number; y: number; } {
    // 각 세그먼트 길이
    const topRight = W - r - 50       // 50→(W-r)
    const cornerTR = (Math.PI / 2) * r
    const rightV = H - 2 * r
    const cornerBR = (Math.PI / 2) * r
    const bottomL = W - 2 * r
    const cornerBL = (Math.PI / 2) * r
    const leftV = H - 2 * r
    const cornerTL = (Math.PI / 2) * r
    const topLeft = W - r - 50        // r→50

    const total = topRight + cornerTR + rightV + cornerBR + bottomL + cornerBL + leftV + cornerTL + topLeft
    let d = t * total

    // 1. 상단 우측 직선
    if (d <= topRight) return { x: 50 + d, y: 0 }
    d -= topRight
    // 2. 오른쪽 상단 코너 (90도, 시계방향)
    if (d <= cornerTR) {
      const a = -Math.PI / 2 + (d / cornerTR) * (Math.PI / 2)
      return { x: W - r + Math.cos(a) * r, y: r + Math.sin(a) * r }
    }
    d -= cornerTR
    // 3. 오른쪽 수직
    if (d <= rightV) return { x: W, y: r + d }
    d -= rightV
    // 4. 오른쪽 하단 코너
    if (d <= cornerBR) {
      const a = 0 + (d / cornerBR) * (Math.PI / 2)
      return { x: W - r + Math.cos(a) * r, y: H - r + Math.sin(a) * r }
    }
    d -= cornerBR
    // 5. 하단 수평
    if (d <= bottomL) return { x: W - r - d, y: H }
    d -= bottomL
    // 6. 왼쪽 하단 코너
    if (d <= cornerBL) {
      const a = Math.PI / 2 + (d / cornerBL) * (Math.PI / 2)
      return { x: r + Math.cos(a) * r, y: H - r + Math.sin(a) * r }
    }
    d -= cornerBL
    // 7. 왼쪽 수직
    if (d <= leftV) return { x: 0, y: H - r - d }
    d -= leftV
    // 8. 왼쪽 상단 코너
    if (d <= cornerTL) {
      const a = Math.PI + (d / cornerTL) * (Math.PI / 2)
      return { x: r + Math.cos(a) * r, y: r + Math.sin(a) * r }
    }
    d -= cornerTL
    // 9. 상단 좌측 직선
    return { x: r + d, y: 0 }
  }

  const iconPos = getPoint(progress)

  return (
    <div style={{
      position: "absolute",
      inset: -2,
      pointerEvents: "none",
      zIndex: 2,
      borderRadius: 20,
    }}>
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}
      >
        {/* 배경 점선 트랙 */}
        <path
          d={pathD}
          fill="none"
          stroke={`${color}28`}
          strokeWidth="0.8"
          strokeDasharray="3 2"
        />
        {/* 진행된 트랙 (밝은 색) */}
        {isRacing && progress > 0 && (
          <path
            d={pathD}
            fill="none"
            stroke={color}
            strokeWidth="1.2"
            strokeDasharray={`${perimeter} ${perimeter}`}
            strokeDashoffset={dashOffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.9s linear" }}
          />
        )}
      </svg>

      {/* 아이콘: viewBox 좌표 → % 로 환산하여 배치 */}
      {isRacing && (
        <div style={{
          position: "absolute",
          left: `${iconPos.x}%`,
          top: `${iconPos.y}%`,
          transform: "translate(-50%, -50%)",
          width: 26,
          height: 26,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: "50%",
          background: color,
          fontSize: 12,
          fontWeight: 900,
          color: "#fff",
          boxShadow: `0 0 14px ${color}, 0 0 4px ${color}`,
          transition: "left 0.9s linear, top 0.9s linear",
          zIndex: 3,
        }}>
          {icon}
        </div>
      )}
    </div>
  )
}

// 마지막 득점 플래시 태그
function DigitFlash({ digit, color, label }: { digit: number | null; color: string; label: string }) {
  const [visible, setVisible] = useState(false)
  const [displayDigit, setDisplayDigit] = useState<number>(0)

  useEffect(() => {
    if (digit === null) return
    setDisplayDigit(digit)
    setVisible(true)
    const t = setTimeout(() => setVisible(false), 1500)
    return () => clearTimeout(t)
  }, [digit])

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 4,
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(6px)",
      transition: "opacity 0.2s, transform 0.2s",
      height: 24,
      justifyContent: "center",
    }}>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>{label}</span>
      <span style={{ fontSize: "clamp(14px, 4vw, 18px)", fontWeight: 900, color, textShadow: `0 0 10px ${color}`, fontFamily: "Georgia, serif" }}>
        +{displayDigit}
      </span>
    </div>
  )
}

// 세로 타이머: /baka의 딜링중 스타일 — 가운데 배치, 위에서 아래로 채워진 바가 줄어드는 방식
function VerticalTimer({
  timeLeft,
  phase,
}: {
  timeLeft: number
  phase: string
}) {
  const maxSec = phase === "betting" ? 60 : 240
  const pct = Math.min(timeLeft / maxSec, 1) // 남은 시간 비율 (1→0으로 줄어듦)
  const phaseColor = phase === "betting" ? "#10b981" : COIN_COLOR
  const phaseLabel = phase === "betting" ? "배팅" : phase === "racing" ? "레이싱" : "결과"

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      gap: 6,
      flexShrink: 0,
    }}>
      {/* 세로 막대 */}
      <div style={{
        width: 6,
        height: 80,
        borderRadius: 3,
        background: "rgba(255,255,255,0.06)",
        overflow: "hidden",
        position: "relative",
        display: "flex",
        flexDirection: "column",
      }}>
        {/* 위→아래 채워진 바가 줄어드는 효과: 남은 비율만큼 위부터 채움 */}
        <div style={{
          width: "100%",
          height: `${pct * 100}%`,
          background: phaseColor,
          borderRadius: 3,
          transition: "height 0.8s linear",
          flexShrink: 0,
        }} />
      </div>

      {/* 레이블 */}
      <div style={{
        fontSize: 9,
        fontWeight: 700,
        color: phaseColor,
        letterSpacing: "0.08em",
        writingMode: "vertical-rl",
        textOrientation: "mixed",
        lineHeight: 1,
      }}>
        {phaseLabel}
      </div>

      {/* 숫자 */}
      <div style={{
        fontSize: "clamp(14px, 4vw, 20px)",
        fontWeight: 800,
        color: phaseColor,
        fontVariantNumeric: "tabular-nums",
        lineHeight: 1,
      }}>
        {timeLeft}
      </div>
    </div>
  )
}

interface Props {
  state: RaceState
}

export function RaceScoreboard({ state }: Props) {
  const { phase, bitScore, coinScore, winner, lastBitDigit, lastCoinDigit, timeLeft, secondsInRound } = state

  const leading: "bit" | "coin" | "tie" =
    bitScore > coinScore ? "bit" : coinScore > bitScore ? "coin" : "tie"

  return (
    <div style={{
      background: "rgba(5,13,10,0.95)",
      border: "1px solid rgba(212,175,55,0.2)",
      borderRadius: 20,
      padding: "clamp(12px, 3vw, 24px) clamp(10px, 2.5vw, 20px)",
      display: "flex",
      flexDirection: "column",
      gap: "clamp(12px, 3vw, 20px)",
      position: "relative",
      width: "100%",
      boxSizing: "border-box",
      overflow: "hidden",
    }}>
      {/* 외곽 트랙 아이콘: 레이싱 240초 한 바퀴, 상단 가운데 출발 */}
      <OrbitTrack phase={phase} timeLeft={timeLeft} leading={leading} />

      {/* 스코어 + 타이머 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "clamp(6px, 2vw, 16px)",
        width: "100%",
      }}>
        {/* BIT팀 */}
        <div style={{
          flex: 1,
          minWidth: 0,
          background: winner === "bit" ? "rgba(59,130,246,0.15)" : "rgba(59,130,246,0.06)",
          border: `1px solid ${winner === "bit" ? BIT_COLOR : "rgba(59,130,246,0.25)"}`,
          borderRadius: 14,
          padding: "clamp(10px, 2.5vw, 16px) clamp(8px, 2vw, 12px)",
          textAlign: "center",
          transition: "all 0.4s",
          boxShadow: winner === "bit" ? "0 0 30px rgba(59,130,246,0.3)" : "none",
        }}>
          <div style={{ fontSize: "clamp(9px, 2.2vw, 11px)", fontWeight: 700, color: BIT_COLOR, letterSpacing: "0.1em", marginBottom: 3 }}>
            BIT 팀
            {winner === "bit" && <span style={{ marginLeft: 5, background: BIT_COLOR, color: "#fff", padding: "1px 5px", borderRadius: 3, fontSize: 8 }}>WIN</span>}
          </div>
          <div style={{ fontSize: "clamp(8px, 1.8vw, 10px)", color: "rgba(59,130,246,0.6)", marginBottom: 6 }}>소수점 첫째</div>
          <AnimatedScore value={bitScore} color={BIT_COLOR} />
          <DigitFlash digit={lastBitDigit} color={BIT_COLOR} label="+BIT" />
        </div>

        {/* 가운데: 타이머 */}
        <VerticalTimer timeLeft={timeLeft} phase={phase} />

        {/* COIN팀 */}
        <div style={{
          flex: 1,
          minWidth: 0,
          background: winner === "coin" ? "rgba(249,115,22,0.15)" : "rgba(249,115,22,0.06)",
          border: `1px solid ${winner === "coin" ? COIN_COLOR : "rgba(249,115,22,0.25)"}`,
          borderRadius: 14,
          padding: "clamp(10px, 2.5vw, 16px) clamp(8px, 2vw, 12px)",
          textAlign: "center",
          transition: "all 0.4s",
          boxShadow: winner === "coin" ? "0 0 30px rgba(249,115,22,0.3)" : "none",
        }}>
          <div style={{ fontSize: "clamp(9px, 2.2vw, 11px)", fontWeight: 700, color: COIN_COLOR, letterSpacing: "0.1em", marginBottom: 3 }}>
            COIN 팀
            {winner === "coin" && <span style={{ marginLeft: 5, background: COIN_COLOR, color: "#fff", padding: "1px 5px", borderRadius: 3, fontSize: 8 }}>WIN</span>}
          </div>
          <div style={{ fontSize: "clamp(8px, 1.8vw, 10px)", color: "rgba(249,115,22,0.6)", marginBottom: 6 }}>소수점 둘째</div>
          <AnimatedScore value={coinScore} color={COIN_COLOR} />
          <DigitFlash digit={lastCoinDigit} color={COIN_COLOR} label="+COIN" />
        </div>
      </div>

      {/* 결과 배너 */}
      {phase === "result" && winner && (
        <div style={{
          textAlign: "center",
          padding: "clamp(10px, 3vw, 16px)",
          background: winner === "tie" ? "rgba(212,175,55,0.1)" : winner === "bit" ? "rgba(59,130,246,0.15)" : "rgba(249,115,22,0.15)",
          border: `1px solid ${winner === "tie" ? GOLD : winner === "bit" ? BIT_COLOR : COIN_COLOR}`,
          borderRadius: 12,
          animation: "winnerPulse 1s ease-in-out infinite alternate",
        }}>
          <div style={{ fontSize: "clamp(16px, 5vw, 24px)", fontWeight: 900, color: winner === "tie" ? GOLD : winner === "bit" ? BIT_COLOR : COIN_COLOR }}>
            {winner === "tie" ? "TIE" : winner === "bit" ? "BIT 팀 승리!" : "COIN 팀 승리!"}
          </div>
          <div style={{ fontSize: "clamp(11px, 3vw, 14px)", color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
            {bitScore} : {coinScore}
          </div>
        </div>
      )}

      <style>{`
        @keyframes winnerPulse {
          from { opacity: 0.85; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  )
}
