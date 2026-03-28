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

// 직사각형 라운드 코너 경로를 따라 progress(0→1) 위치 좌표 반환
// W×H viewBox, r=코너 반지름, 12시(상단 가운데)에서 시계방향 출발
function getRoundRectPoint(t: number, W: number, H: number, r: number): { x: number; y: number } {
  // 세그먼트 길이 계산 (비율 단위)
  const halfTop = W / 2 - r   // 12시→우상단 직선
  const cTR = (Math.PI / 2) * r
  const rightV = H - 2 * r
  const cBR = (Math.PI / 2) * r
  const bottomH = W - 2 * r
  const cBL = (Math.PI / 2) * r
  const leftV = H - 2 * r
  const cTL = (Math.PI / 2) * r
  const topLeft = W / 2 - r   // 좌상단→12시 복귀

  const total = halfTop + cTR + rightV + cBR + bottomH + cBL + leftV + cTL + topLeft
  let d = ((t % 1) + 1) % 1 * total

  if (d <= halfTop) return { x: W / 2 + d, y: 0 }
  d -= halfTop
  if (d <= cTR) {
    const a = -Math.PI / 2 + (d / cTR) * (Math.PI / 2)
    return { x: W - r + Math.cos(a) * r, y: r + Math.sin(a) * r }
  }
  d -= cTR
  if (d <= rightV) return { x: W, y: r + d }
  d -= rightV
  if (d <= cBR) {
    const a = (d / cBR) * (Math.PI / 2)
    return { x: W - r + Math.cos(a) * r, y: H - r + Math.sin(a) * r }
  }
  d -= cBR
  if (d <= bottomH) return { x: W - r - d, y: H }
  d -= bottomH
  if (d <= cBL) {
    const a = Math.PI / 2 + (d / cBL) * (Math.PI / 2)
    return { x: r + Math.cos(a) * r, y: H - r + Math.sin(a) * r }
  }
  d -= cBL
  if (d <= leftV) return { x: 0, y: H - r - d }
  d -= leftV
  if (d <= cTL) {
    const a = Math.PI + (d / cTL) * (Math.PI / 2)
    return { x: r + Math.cos(a) * r, y: r + Math.sin(a) * r }
  }
  d -= cTL
  return { x: r + d, y: 0 }
}

// 아이콘 하나: 지정된 래퍼(outer/inner) 위를 도는 아이콘
function TrackIcon({
  progress,
  color,
  icon,
  W,
  H,
  r,
  inset,
}: {
  progress: number
  color: string
  icon: string
  W: number
  H: number
  r: number
  inset: number
}) {
  const pos = getRoundRectPoint(progress, W, H, r)
  return (
    <div style={{
      position: "absolute",
      left: `calc(${inset < 0 ? `${-inset}px` : "0px"} + ${pos.x / W * 100}%)`,
      top: `calc(${inset < 0 ? `${-inset}px` : "0px"} + ${pos.y / H * 100}%)`,
      transform: "translate(-50%, -50%)",
      width: 18,
      height: 18,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "50%",
      background: color,
      fontSize: 9,
      fontWeight: 900,
      color: "#fff",
      boxShadow: `0 0 10px ${color}`,
      transition: "left 0.9s linear, top 0.9s linear",
      zIndex: 10,
      pointerEvents: "none",
    }}>
      {icon}
    </div>
  )
}

// 외곽 트랙 오버레이 (스코어보드 전체 감싸는 컨테이너에 붙음)
// leading 팀 아이콘 → 해당 팀 스코어 박스 내 트랙
// losing 팀 아이콘  → 전체 외곽 트랙
// 스코어 박스의 relative 위치를 ref로 받아서 정확히 박스 테두리를 돌게 함
function OrbitTrack({
  phase,
  timeLeft,
  leading,
  bitBoxRef,
  coinBoxRef,
  outerRef,
}: {
  phase: string
  timeLeft: number
  leading: "bit" | "coin" | "tie"
  bitBoxRef: React.RefObject<HTMLDivElement | null>
  coinBoxRef: React.RefObject<HTMLDivElement | null>
  outerRef: React.RefObject<HTMLDivElement | null>
}) {
  const isRacing = phase === "racing"
  const elapsed = isRacing ? Math.max(0, 240 - timeLeft) : 0
  const progress = (elapsed % 10) / 10

  const [outerSize, setOuterSize] = useState({ w: 400, h: 200 })
  const [bitSize, setBitSize] = useState({ x: 0, y: 0, w: 150, h: 150 })
  const [coinSize, setCoinSize] = useState({ x: 0, y: 0, w: 150, h: 150 })

  useEffect(() => {
    function measure() {
      const outer = outerRef.current
      const bit = bitBoxRef.current
      const coin = coinBoxRef.current
      if (!outer || !bit || !coin) return
      const outerR = outer.getBoundingClientRect()
      const bitR = bit.getBoundingClientRect()
      const coinR = coin.getBoundingClientRect()
      setOuterSize({ w: outerR.width, h: outerR.height })
      setBitSize({ x: bitR.left - outerR.left, y: bitR.top - outerR.top, w: bitR.width, h: bitR.height })
      setCoinSize({ x: coinR.left - outerR.left, y: coinR.top - outerR.top, w: coinR.width, h: coinR.height })
    }
    measure()
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [outerRef, bitBoxRef, coinBoxRef])

  if (!isRacing) return null

  // 이기는 팀 → 해당 박스 테두리, 지는 팀 → 외곽
  // tie일 때 둘 다 외곽
  const bitLeading = leading === "bit"
  const coinLeading = leading === "coin"

  // 아이콘 위치 계산
  // BIT 아이콘
  const bitTrack = bitLeading
    ? { x: bitSize.x, y: bitSize.y, w: bitSize.w, h: bitSize.h, r: 14 }
    : { x: 0, y: 0, w: outerSize.w, h: outerSize.h, r: 20 }
  const bitPos = getRoundRectPoint(progress, bitTrack.w, bitTrack.h, bitTrack.r)

  // COIN 아이콘 (반대편: +0.5)
  const coinTrack = coinLeading
    ? { x: coinSize.x, y: coinSize.y, w: coinSize.w, h: coinSize.h, r: 14 }
    : { x: 0, y: 0, w: outerSize.w, h: outerSize.h, r: 20 }
  const coinProgress = (progress + 0.5) % 1
  const coinPos = getRoundRectPoint(coinProgress, coinTrack.w, coinTrack.h, coinTrack.r)

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5, overflow: "visible" }}>
      {/* 외곽 점선 트랙 */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }} viewBox={`0 0 ${outerSize.w} ${outerSize.h}`} preserveAspectRatio="none">
        <path
          d={`M ${outerSize.w/2} 0 L ${outerSize.w-20} 0 Q ${outerSize.w} 0 ${outerSize.w} 20 L ${outerSize.w} ${outerSize.h-20} Q ${outerSize.w} ${outerSize.h} ${outerSize.w-20} ${outerSize.h} L 20 ${outerSize.h} Q 0 ${outerSize.h} 0 ${outerSize.h-20} L 0 20 Q 0 0 20 0 Z`}
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="1"
          strokeDasharray="3 4"
        />
      </svg>

      {/* BIT 아이콘 */}
      <div style={{
        position: "absolute",
        left: bitTrack.x + bitPos.x,
        top: bitTrack.y + bitPos.y,
        transform: "translate(-50%, -50%)",
        width: 18, height: 18,
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: "50%",
        background: BIT_COLOR,
        fontSize: 9, fontWeight: 900, color: "#fff",
        boxShadow: `0 0 10px ${BIT_COLOR}`,
        transition: "left 0.9s linear, top 0.9s linear",
        zIndex: 10,
      }}>₿</div>

      {/* COIN 아이콘 */}
      <div style={{
        position: "absolute",
        left: coinTrack.x + coinPos.x,
        top: coinTrack.y + coinPos.y,
        transform: "translate(-50%, -50%)",
        width: 18, height: 18,
        display: "flex", alignItems: "center", justifyContent: "center",
        borderRadius: "50%",
        background: COIN_COLOR,
        fontSize: 9, fontWeight: 900, color: "#fff",
        boxShadow: `0 0 10px ${COIN_COLOR}`,
        transition: "left 0.9s linear, top 0.9s linear",
        zIndex: 10,
      }}>◎</div>
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
      {/* 세로 막대 — 모래시계: 아래쪽이 채워짐 (pct=남은비율, 줄어들수록 아래 채움) */}
      <div style={{
        width: 6,
        height: 80,
        borderRadius: 3,
        background: "rgba(255,255,255,0.06)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
      }}>
        {/* 아래에서부터 채워짐: 시간이 줄어들수록 높이가 커짐 */}
        <div style={{
          width: "100%",
          height: `${(1 - pct) * 100}%`,
          background: phaseColor,
          borderRadius: 3,
          transition: "height 0.8s linear",
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

  const outerRef = useRef<HTMLDivElement>(null)
  const bitBoxRef = useRef<HTMLDivElement>(null)
  const coinBoxRef = useRef<HTMLDivElement>(null)

  return (
    <div ref={outerRef} style={{
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
      overflow: "visible",
    }}>
      {/* 트랙 아이콘: 이기는 팀→스코어 박스, 지는 팀→외곽 */}
      <OrbitTrack
        phase={phase}
        timeLeft={timeLeft}
        leading={leading}
        bitBoxRef={bitBoxRef}
        coinBoxRef={coinBoxRef}
        outerRef={outerRef}
      />

      {/* 스코어 + 타이머 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: "clamp(6px, 2vw, 16px)",
        width: "100%",
      }}>
        {/* BIT팀 */}
        <div ref={bitBoxRef} style={{
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
        <div ref={coinBoxRef} style={{
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
