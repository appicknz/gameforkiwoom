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

// 라운드 직사각형 경로 위의 정확한 좌표 계산
// t=0: 상단 가운데(12시), 시계방향
function getRoundRectPoint(t: number, W: number, H: number, r: number): { x: number; y: number } {
  const seg = [
    { len: W / 2 - r, fn: (d: number) => ({ x: W / 2 + d, y: 0 }) },
    { len: (Math.PI / 2) * r, fn: (d: number) => {
      const a = -Math.PI / 2 + (d / ((Math.PI / 2) * r)) * (Math.PI / 2)
      return { x: W - r + Math.cos(a) * r, y: r + Math.sin(a) * r }
    }},
    { len: H - 2 * r, fn: (d: number) => ({ x: W, y: r + d }) },
    { len: (Math.PI / 2) * r, fn: (d: number) => {
      const a = (d / ((Math.PI / 2) * r)) * (Math.PI / 2)
      return { x: W - r + Math.cos(a) * r, y: H - r + Math.sin(a) * r }
    }},
    { len: W - 2 * r, fn: (d: number) => ({ x: W - r - d, y: H }) },
    { len: (Math.PI / 2) * r, fn: (d: number) => {
      const a = Math.PI / 2 + (d / ((Math.PI / 2) * r)) * (Math.PI / 2)
      return { x: r + Math.cos(a) * r, y: H - r + Math.sin(a) * r }
    }},
    { len: H - 2 * r, fn: (d: number) => ({ x: 0, y: H - r - d }) },
    { len: (Math.PI / 2) * r, fn: (d: number) => {
      const a = Math.PI + (d / ((Math.PI / 2) * r)) * (Math.PI / 2)
      return { x: r + Math.cos(a) * r, y: r + Math.sin(a) * r }
    }},
    { len: W / 2 - r, fn: (d: number) => ({ x: r + d, y: 0 }) },
  ]
  const total = seg.reduce((s, g) => s + g.len, 0)
  let d = (((t % 1) + 1) % 1) * total
  for (const g of seg) {
    if (d <= g.len) return g.fn(d)
    d -= g.len
  }
  return { x: W / 2, y: 0 }
}

// rAF 기반 단일 아이콘 — CSS transition 없이 매 프레임 직접 좌표 계산
function OrbitIcon({
  color,
  label,
  lapSec,       // 한 바퀴 걸리는 초 (이기는 팀: 6s, 지는 팀: 10s)
  offsetRatio,  // 시작 위상 오프셋 (0~1)
  boxRef,       // 돌 박스 ref
  outerRef,     // 외곽 컨테이너 ref (위치 기준)
  active,
}: {
  color: string
  label: string
  lapSec: number
  offsetRatio: number
  boxRef: React.RefObject<HTMLDivElement | null>
  outerRef: React.RefObject<HTMLDivElement | null>
  active: boolean
}) {
  const elRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (!active) {
      if (elRef.current) elRef.current.style.display = "none"
      return
    }

    function frame(now: number) {
      if (!startRef.current) startRef.current = now
      const elapsed = (now - startRef.current) / 1000 // 초 단위
      const t = ((elapsed / lapSec) % 1 + offsetRatio) % 1

      const box = boxRef.current
      const outer = outerRef.current
      const el = elRef.current
      if (!box || !outer || !el) {
        rafRef.current = requestAnimationFrame(frame)
        return
      }

      const outerR = outer.getBoundingClientRect()
      const boxR = box.getBoundingClientRect()
      const bx = boxR.left - outerR.left
      const by = boxR.top - outerR.top
      const bw = boxR.width
      const bh = boxR.height
      const br = 14 // 박스 border-radius px

      const pos = getRoundRectPoint(t, bw, bh, br)

      el.style.display = "flex"
      el.style.left = `${bx + pos.x}px`
      el.style.top = `${by + pos.y}px`

      rafRef.current = requestAnimationFrame(frame)
    }

    rafRef.current = requestAnimationFrame(frame)
    return () => {
      cancelAnimationFrame(rafRef.current)
      startRef.current = null
    }
  }, [active, lapSec, offsetRatio, boxRef, outerRef])

  return (
    <div ref={elRef} style={{
      position: "absolute",
      display: "none",
      transform: "translate(-50%, -50%)",
      width: 14,
      height: 14,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: "50%",
      background: color,
      fontSize: 7,
      fontWeight: 900,
      color: "#fff",
      boxShadow: `0 0 8px ${color}`,
      zIndex: 10,
      pointerEvents: "none",
      userSelect: "none",
    }}>
      {label}
    </div>
  )
}

function OrbitTrack({
  phase,
  leading,
  bitBoxRef,
  coinBoxRef,
  outerRef,
}: {
  phase: string
  leading: "bit" | "coin" | "tie"
  bitBoxRef: React.RefObject<HTMLDivElement | null>
  coinBoxRef: React.RefObject<HTMLDivElement | null>
  outerRef: React.RefObject<HTMLDivElement | null>
}) {
  const isRacing = phase === "racing"

  // 이기는 팀: 6초/바퀴, 지는 팀: 10초/바퀴
  const bitLap = leading === "bit" ? 6 : 10
  const coinLap = leading === "coin" ? 6 : 10

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5, overflow: "visible" }}>
      <OrbitIcon
        color={BIT_COLOR}
        label="₿"
        lapSec={bitLap}
        offsetRatio={0}
        boxRef={bitBoxRef}
        outerRef={outerRef}
        active={isRacing}
      />
      <OrbitIcon
        color={COIN_COLOR}
        label="◎"
        lapSec={coinLap}
        offsetRatio={0.5}
        boxRef={coinBoxRef}
        outerRef={outerRef}
        active={isRacing}
      />
    </div>
  )
}

// 마지막 득점 플래시 태그 — tickKey가 바뀔 때마다 리마운트로 재애니메이션
function DigitFlashInner({ digit, color, label }: { digit: number; color: string; label: string }) {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 1500)
    return () => clearTimeout(t)
  }, [])
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
        +{digit}
      </span>
    </div>
  )
}
function DigitFlash({ digit, color, label }: { digit: number | null; color: string; label: string }) {
  const tickRef = useRef(0)
  const [tick, setTick] = useState(0)
  const prevDigit = useRef<number | null>(null)

  useEffect(() => {
    if (digit === null) return
    // digit 값이 같아도 새 tick이면 항상 �����������애니메이션
    tickRef.current += 1
    setTick(tickRef.current)
    prevDigit.current = digit
  }, [digit])

  if (digit === null || tick === 0) return <div style={{ height: 24 }} />
  return <DigitFlashInner key={tick} digit={digit} color={color} label={label} />
}

// 3단계 카운트다운: 정산(10s) / 배팅(50s) / 게임중(120s) — 180초(3분) 라운드 기준
// secondsInRound: 0~9 정산, 10~59 배팅, 60~179 게임중
function PhaseCountdown({ secondsInRound }: { secondsInRound: number }) {
  const phases = [
    {
      label: "정산",
      duration: 10,
      active: secondsInRound < 10,
      countdown: secondsInRound < 10 ? 10 - secondsInRound : 10,
      color: "#60a5fa",
      pct: secondsInRound < 10 ? (10 - secondsInRound) / 10 : 0,
    },
    {
      label: "배팅",
      duration: 50,
      active: secondsInRound >= 10 && secondsInRound < 60,
      countdown: secondsInRound >= 10 && secondsInRound < 60 ? 60 - secondsInRound : 50,
      color: "#10b981",
      pct: secondsInRound >= 10 && secondsInRound < 60 ? (60 - secondsInRound) / 50 : 0,
    },
    {
      label: "게임중",
      duration: 120,
      active: secondsInRound >= 60,
      countdown: secondsInRound >= 60 ? 180 - secondsInRound : 120,
      color: secondsInRound >= 170 ? "#ef4444" : "#f97316",
      pct: secondsInRound >= 60 ? (180 - secondsInRound) / 120 : 0,
    },
  ]

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 4,
      flexShrink: 0,
    }}>
      {phases.map(p => (
        <div
          key={p.label}
          style={{
            padding: "4px 8px",
            borderRadius: 8,
            background: p.active ? `${p.color}18` : "rgba(255,255,255,0.03)",
            border: `1px solid ${p.active ? p.color + "55" : "rgba(255,255,255,0.07)"}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 2,
            minWidth: 44,
            transition: "background 0.3s, border-color 0.3s",
          }}
        >
          <span style={{
            fontSize: 8,
            fontWeight: 600,
            color: p.active ? p.color : "rgba(255,255,255,0.22)",
            letterSpacing: "0.04em",
            lineHeight: 1,
          }}>
            {p.label}
          </span>
          <span style={{
            fontSize: "clamp(13px, 3.5vw, 17px)",
            fontWeight: 800,
            color: p.active ? p.color : "rgba(255,255,255,0.15)",
            fontVariantNumeric: "tabular-nums",
            lineHeight: 1,
          }}>
            {p.active ? p.countdown : p.duration}
          </span>
          <div style={{ width: "100%", height: 3, borderRadius: 99, background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{
              height: "100%",
              width: `${p.pct * 100}%`,
              background: p.active ? p.color : "rgba(255,255,255,0.08)",
              borderRadius: 99,
              transition: "width 0.8s linear",
            }} />
          </div>
        </div>
      ))}
    </div>
  )
}

interface Props {
  state: RaceState
  flashes?: { bit: number; coin: number }[]
}

export function RaceScoreboard({ state, flashes = [] }: Props) {
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

        {/* 가운데: 3단계 카운트다운 */}
        <PhaseCountdown secondsInRound={secondsInRound} />

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

      {/* 득점 히스토리 + 프로그레스바 */}
      {(() => {
        const total = bitScore + coinScore
        const bitPct  = total === 0 ? 50 : Math.round((bitScore / total) * 100)
        const coinPct = 100 - bitPct
        const isTie   = bitScore === coinScore && total > 0
        // 각 팀 flash 히스토리: 해당 팀 점수가 0인 항목은 표시하지 않음
        const recentBit  = flashes.filter(f => f.bit  > 0).slice(0, 5).map(f => f.bit)
        const recentCoin = flashes.filter(f => f.coin > 0).slice(0, 5).map(f => f.coin)
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {/* BIT 히스토리 / 잭팟 / COIN 히스토리 */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1 }}>
                <span style={{ fontSize: 10, color: BIT_COLOR, fontWeight: 700, marginRight: 2 }}>BIT</span>
                {recentBit.length === 0
                  ? <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>—</span>
                  : recentBit.map((v, i) => (
                    <span key={i} style={{
                      fontSize: i === 0 ? 13 : 10, fontWeight: i === 0 ? 800 : 500,
                      color: i === 0 ? BIT_COLOR : `${BIT_COLOR}88`,
                      background: i === 0 ? "rgba(59,130,246,0.12)" : "transparent",
                      border: i === 0 ? `1px solid ${BIT_COLOR}55` : "none",
                      borderRadius: 5, padding: i === 0 ? "1px 6px" : "0",
                      fontVariantNumeric: "tabular-nums",
                    }}>+{v}</span>
                  ))
                }
              </div>
              <div style={{
                flex: "0 0 auto", padding: "3px 14px", borderRadius: 20,
                background: isTie ? "rgba(212,175,55,0.2)" : "rgba(255,255,255,0.04)",
                border: `1px solid ${isTie ? GOLD : "rgba(255,255,255,0.08)"}`,
                fontSize: 11, fontWeight: 800,
                color: isTie ? GOLD : "rgba(255,255,255,0.3)",
                letterSpacing: "0.08em", transition: "all 0.3s",
                textShadow: isTie ? `0 0 12px ${GOLD}` : "none",
              }}>잭팟</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flex: 1, justifyContent: "flex-end" }}>
                {recentCoin.length === 0
                  ? <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>—</span>
                  : [...recentCoin].reverse().map((v, i) => {
                    const ri = recentCoin.length - 1 - i
                    return (
                      <span key={i} style={{
                        fontSize: ri === 0 ? 13 : 10, fontWeight: ri === 0 ? 800 : 500,
                        color: ri === 0 ? COIN_COLOR : `${COIN_COLOR}88`,
                        background: ri === 0 ? "rgba(249,115,22,0.12)" : "transparent",
                        border: ri === 0 ? `1px solid ${COIN_COLOR}55` : "none",
                        borderRadius: 5, padding: ri === 0 ? "1px 6px" : "0",
                        fontVariantNumeric: "tabular-nums",
                      }}>+{v}</span>
                    )
                  })
                }
                <span style={{ fontSize: 10, color: COIN_COLOR, fontWeight: 700, marginLeft: 2 }}>COIN</span>
              </div>
            </div>
            {/* 프로그레스바 */}
            <div style={{ position: "relative", height: 10, borderRadius: 6, background: "rgba(255,255,255,0.07)", overflow: "hidden" }}>
              <div style={{
                position: "absolute", left: 0, top: 0, bottom: 0,
                width: `${bitPct}%`,
                background: isTie ? `linear-gradient(90deg, ${BIT_COLOR}, ${GOLD})` : BIT_COLOR,
                borderRadius: "6px 0 0 6px", transition: "width 0.5s ease",
              }} />
              <div style={{
                position: "absolute", right: 0, top: 0, bottom: 0,
                width: `${coinPct}%`,
                background: isTie ? `linear-gradient(90deg, ${GOLD}, ${COIN_COLOR})` : COIN_COLOR,
                borderRadius: "0 6px 6px 0", transition: "width 0.5s ease",
              }} />
              <div style={{
                position: "absolute", left: "50%", top: 0, bottom: 0,
                width: 2, background: "rgba(0,0,0,0.6)", transform: "translateX(-50%)",
              }} />
            </div>
            {/* 비율 */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: BIT_COLOR, fontVariantNumeric: "tabular-nums" }}>
                {bitScore.toLocaleString()} ({bitPct}%)
              </span>
              <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>누적 점수</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: COIN_COLOR, fontVariantNumeric: "tabular-nums" }}>
                ({coinPct}%) {coinScore.toLocaleString()}
              </span>
            </div>
          </div>
        )
      })()}

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
