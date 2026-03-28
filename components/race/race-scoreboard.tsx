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

// 트랙 아이콘: 스코어 컴포넌트 둘레를 이기는 팀 아이콘이 한 바퀴 도는 애니메이션
function OrbitTrack({
  phase,
  secondsInRound,
  leading,
}: {
  phase: string
  secondsInRound: number
  leading: "bit" | "coin" | "tie"
}) {
  const isActive = phase === "racing" || phase === "betting"
  const color = leading === "bit" ? BIT_COLOR : leading === "coin" ? COIN_COLOR : GOLD
  const icon = leading === "bit" ? "₿" : leading === "coin" ? "◎" : "="
  const angleDeg = isActive ? (secondsInRound / 300) * 360 : 0

  return (
    <div style={{ position: "absolute", inset: -3, pointerEvents: "none", borderRadius: 23, zIndex: 2 }}>
      <div style={{
        position: "absolute", inset: 0, borderRadius: 23,
        border: `1.5px dashed ${isActive ? `${color}44` : "rgba(255,255,255,0.06)"}`,
        transition: "border-color 0.5s",
      }} />
      {isActive && (
        <div style={{
          position: "absolute",
          top: "50%", left: "50%",
          width: 26, height: 26,
          marginLeft: -13, marginTop: -13,
          display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: "50%",
          background: color,
          fontSize: 12, fontWeight: 900, color: "#fff",
          boxShadow: `0 0 10px ${color}`,
          transform: `rotate(${angleDeg}deg) translateX(calc(50% + 2px))`,
          transition: "transform 1s linear",
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
      {/* 트랙 아이콘 */}
      <OrbitTrack phase={phase} secondsInRound={secondsInRound} leading={leading} />

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
