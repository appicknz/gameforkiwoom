"use client"

import { useEffect, useRef, useState } from "react"
import type { RaceState } from "./race-game"

const BIT_COLOR = "#3b82f6"
const COIN_COLOR = "#f97316"
const GOLD = "#d4af37"
const GOLD_DIM = "rgba(212,175,55,0.5)"

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
      fontSize: 72,
      fontWeight: 900,
      lineHeight: 1,
      color: flash ? "#fff" : color,
      textShadow: flash ? `0 0 32px ${color}, 0 0 8px ${color}` : "none",
      transition: "color 0.15s, text-shadow 0.15s",
      letterSpacing: "-2px",
      fontFamily: "Georgia, 'Times New Roman', serif",
    }}>
      {value.toLocaleString()}
    </span>
  )
}

// 진행 바: BIT vs COIN 비율
function ScoreBar({ bit, coin }: { bit: number; coin: number }) {
  const total = bit + coin
  const bitPct = total === 0 ? 50 : Math.round((bit / total) * 100)
  const coinPct = 100 - bitPct

  return (
    <div style={{ width: "100%", position: "relative" }}>
      {/* 배경 */}
      <div style={{
        height: 12,
        borderRadius: 6,
        overflow: "hidden",
        display: "flex",
        background: "rgba(255,255,255,0.06)",
      }}>
        <div style={{
          width: `${bitPct}%`,
          background: BIT_COLOR,
          transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)",
          borderRadius: "6px 0 0 6px",
        }} />
        <div style={{
          width: `${coinPct}%`,
          background: COIN_COLOR,
          transition: "width 0.6s cubic-bezier(0.34,1.56,0.64,1)",
          borderRadius: "0 6px 6px 0",
        }} />
      </div>
      {/* % 레이블 */}
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
        <span style={{ fontSize: 11, color: BIT_COLOR, fontWeight: 700 }}>{bitPct}%</span>
        <span style={{ fontSize: 11, color: COIN_COLOR, fontWeight: 700 }}>{coinPct}%</span>
      </div>
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
      display: "flex",
      alignItems: "center",
      gap: 6,
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0)" : "translateY(6px)",
      transition: "opacity 0.2s, transform 0.2s",
      height: 28,
    }}>
      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", letterSpacing: "0.06em" }}>{label}</span>
      <span style={{
        fontSize: 18,
        fontWeight: 900,
        color,
        textShadow: `0 0 12px ${color}`,
        fontFamily: "Georgia, serif",
      }}>+{displayDigit}</span>
    </div>
  )
}

interface Props {
  state: RaceState
}

export function RaceScoreboard({ state }: Props) {
  const { phase, bitScore, coinScore, winner, lastPrice, lastBitDigit, lastCoinDigit, timeLeft, secondsInRound } = state

  const phaseLabel =
    phase === "betting" ? "배팅 가능"
    : phase === "racing" ? "레이싱 중"
    : "결과"

  const phaseColor =
    phase === "betting" ? "#10b981"
    : phase === "racing" ? COIN_COLOR
    : GOLD

  // 타이머 원형 진행률
  const maxSec = phase === "betting" ? 60 : 240
  const elapsed = phase === "betting" ? 60 - timeLeft : 240 - timeLeft
  const pct = Math.min(elapsed / maxSec, 1)
  const R = 28, C = 2 * Math.PI * R
  const dash = C * (1 - pct)

  return (
    <div style={{
      background: "rgba(5,13,10,0.95)",
      border: `1px solid rgba(212,175,55,0.2)`,
      borderRadius: 20,
      padding: "24px 20px",
      display: "flex",
      flexDirection: "column",
      gap: 20,
    }}>
      {/* 헤더: 타이머 + 페이즈 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 11, color: GOLD_DIM, letterSpacing: "0.08em", marginBottom: 2 }}>BTC RACE</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: phaseColor }}>{phaseLabel}</div>
        </div>
        {/* 원형 타이머 */}
        <div style={{ position: "relative", width: 72, height: 72 }}>
          <svg width="72" height="72" style={{ transform: "rotate(-90deg)" }}>
            <circle cx="36" cy="36" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="4" />
            <circle
              cx="36" cy="36" r={R} fill="none"
              stroke={phaseColor}
              strokeWidth="4"
              strokeDasharray={C}
              strokeDashoffset={dash}
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 0.5s linear" }}
            />
          </svg>
          <div style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 18, fontWeight: 800, color: phaseColor, fontVariantNumeric: "tabular-nums",
          }}>
            {timeLeft}
          </div>
        </div>
      </div>

      {/* 스코어 메인 */}
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {/* BIT팀 */}
        <div style={{
          flex: 1,
          background: winner === "bit" ? "rgba(59,130,246,0.15)" : "rgba(59,130,246,0.06)",
          border: `1px solid ${winner === "bit" ? BIT_COLOR : "rgba(59,130,246,0.25)"}`,
          borderRadius: 16,
          padding: "16px 12px",
          textAlign: "center",
          transition: "all 0.4s",
          boxShadow: winner === "bit" ? `0 0 30px rgba(59,130,246,0.3)` : "none",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: BIT_COLOR, letterSpacing: "0.12em", marginBottom: 4 }}>
            BIT 팀
            {winner === "bit" && <span style={{ marginLeft: 6, background: BIT_COLOR, color: "#fff", padding: "1px 6px", borderRadius: 3, fontSize: 9 }}>WIN</span>}
          </div>
          <div style={{ fontSize: 9, color: "rgba(59,130,246,0.6)", marginBottom: 8 }}>소수점 첫째 자리</div>
          <AnimatedScore value={bitScore} color={BIT_COLOR} />
          <DigitFlash digit={lastBitDigit} color={BIT_COLOR} label="+BIT" />
        </div>

        {/* VS */}
        <div style={{ flexShrink: 0, textAlign: "center" }}>
          <div style={{ fontSize: 14, fontWeight: 900, color: GOLD, letterSpacing: "0.1em" }}>VS</div>
        </div>

        {/* COIN팀 */}
        <div style={{
          flex: 1,
          background: winner === "coin" ? "rgba(249,115,22,0.15)" : "rgba(249,115,22,0.06)",
          border: `1px solid ${winner === "coin" ? COIN_COLOR : "rgba(249,115,22,0.25)"}`,
          borderRadius: 16,
          padding: "16px 12px",
          textAlign: "center",
          transition: "all 0.4s",
          boxShadow: winner === "coin" ? `0 0 30px rgba(249,115,22,0.3)` : "none",
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: COIN_COLOR, letterSpacing: "0.12em", marginBottom: 4 }}>
            COIN 팀
            {winner === "coin" && <span style={{ marginLeft: 6, background: COIN_COLOR, color: "#fff", padding: "1px 6px", borderRadius: 3, fontSize: 9 }}>WIN</span>}
          </div>
          <div style={{ fontSize: 9, color: "rgba(249,115,22,0.6)", marginBottom: 8 }}>소수점 둘째 자리</div>
          <AnimatedScore value={coinScore} color={COIN_COLOR} />
          <DigitFlash digit={lastCoinDigit} color={COIN_COLOR} label="+COIN" />
        </div>
      </div>

      {/* 진행 바 */}
      <ScoreBar bit={bitScore} coin={coinScore} />

      {/* 현재 기준 가격 */}
      {lastPrice && (
        <div style={{
          textAlign: "center",
          fontSize: 12,
          color: GOLD_DIM,
          fontVariantNumeric: "tabular-nums",
        }}>
          기준가: <span style={{ color: GOLD, fontWeight: 700 }}>
            ${lastPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          {lastBitDigit !== null && (
            <span style={{ marginLeft: 8 }}>
              <span style={{ color: BIT_COLOR }}>BIT+{lastBitDigit}</span>
              <span style={{ color: "rgba(255,255,255,0.3)", margin: "0 4px" }}>/</span>
              <span style={{ color: COIN_COLOR }}>COIN+{lastCoinDigit}</span>
            </span>
          )}
        </div>
      )}

      {/* 결과 배너 */}
      {phase === "result" && winner && (
        <div style={{
          textAlign: "center",
          padding: "16px",
          background: winner === "tie" ? "rgba(212,175,55,0.1)" : winner === "bit" ? "rgba(59,130,246,0.15)" : "rgba(249,115,22,0.15)",
          border: `1px solid ${winner === "tie" ? GOLD : winner === "bit" ? BIT_COLOR : COIN_COLOR}`,
          borderRadius: 12,
          animation: "winnerPulse 1s ease-in-out infinite alternate",
        }}>
          <div style={{ fontSize: 24, fontWeight: 900, color: winner === "tie" ? GOLD : winner === "bit" ? BIT_COLOR : COIN_COLOR }}>
            {winner === "tie" ? "TIE" : winner === "bit" ? "BIT 팀 승리!" : "COIN 팀 승리!"}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>
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
