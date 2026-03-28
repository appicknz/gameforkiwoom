"use client"

import { useEffect, useState } from "react"

const GOLD = "#d4af37"
const GOLD_DIM = "rgba(212,175,55,0.5)"
const ROW_BG = "rgba(212,175,55,0.04)"
const ROW_BORDER = "rgba(212,175,55,0.1)"
const CARD_BG = "rgba(5,13,10,0.85)"
const GOLD_BORDER = "rgba(212,175,55,0.18)"
const BIT_COLOR = "#3b82f6"
const COIN_COLOR = "#f97316"

// race:closing 이벤트에서 오는 라운드 결과 (토탈 누적 스코어)
interface RaceEntry {
  time: number
  price: number
  bit: number   // BIT팀 라운드 토탈 스코어
  coin: number  // COIN팀 라운드 토탈 스코어
  winner: "bit" | "coin" | "tie"
}

function fmtTime(ts: number) {
  if (!ts || isNaN(ts)) return "—"
  return new Date(ts * 1000).toLocaleTimeString("ko-KR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  })
}

function fmtPrice(p: number) {
  return "$" + p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function RaceClosingPrices() {
  const [entries, setEntries] = useState<RaceEntry[]>([])

  // race:closing 이벤트 구독 — 라운드 종료 시 race-betting-game이 발행
  // detail: { price, time, bit, coin, winner }
  useEffect(() => {
    const onClosing = (e: Event) => {
      const { price, time, bit, coin, winner } =
        (e as CustomEvent<{ price: number; time: number; bit: number; coin: number; winner: "bit" | "coin" | "tie" }>).detail
      setEntries(prev => {
        if (prev.find(p => p.time === time)) return prev
        return [...prev, { time, price, bit, coin, winner }].slice(-20)
      })
    }
    window.addEventListener("race:closing", onClosing)
    return () => window.removeEventListener("race:closing", onClosing)
  }, [])

  const display = [...entries].reverse().slice(0, 10)

  return (
    <div style={{
      background: CARD_BG,
      border: `1px solid ${GOLD_BORDER}`,
      borderRadius: 16,
      padding: "16px 14px",
      display: "flex",
      flexDirection: "column",
      gap: 8,
    }}>
      <h3 style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 4, letterSpacing: "0.04em" }}>
        5분 레이스 결과 (최근 10라운드)
      </h3>

      {display.length === 0 && (
        <div style={{ textAlign: "center", color: GOLD_DIM, fontSize: 12, padding: "20px 0" }}>
          라운드 기록 대기 중...
        </div>
      )}

      {display.map((entry, i) => {
        const isLatest = i === 0
        return (
          <div key={entry.time} style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 10px",
            borderRadius: 8,
            background: isLatest ? "rgba(212,175,55,0.08)" : ROW_BG,
            border: `1px solid ${isLatest ? "rgba(212,175,55,0.3)" : ROW_BORDER}`,
          }}>
            <span style={{ fontSize: 11, color: GOLD_DIM, fontVariantNumeric: "tabular-nums", minWidth: 58 }}>
              {fmtTime(entry.time)}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: GOLD, flex: 1, fontVariantNumeric: "tabular-nums" }}>
              {fmtPrice(entry.price)}
            </span>
            {/* 누적 토탈 스코어 */}
            <span style={{ fontSize: 11, fontWeight: 700, color: BIT_COLOR, minWidth: 30 }}>
              B{entry.bit}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: COIN_COLOR, minWidth: 34 }}>
              C{entry.coin}
            </span>
            {/* 승자 뱃지 */}
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: entry.winner === "bit" ? BIT_COLOR : entry.winner === "coin" ? COIN_COLOR : GOLD,
              background: entry.winner === "bit" ? "rgba(59,130,246,0.15)" : entry.winner === "coin" ? "rgba(249,115,22,0.15)" : "rgba(212,175,55,0.12)",
              border: `1px solid ${entry.winner === "bit" ? "rgba(59,130,246,0.3)" : entry.winner === "coin" ? "rgba(249,115,22,0.3)" : "rgba(212,175,55,0.25)"}`,
              padding: "2px 7px",
              borderRadius: 5,
              letterSpacing: "0.04em",
            }}>
              {entry.winner === "tie" ? "TIE" : entry.winner === "bit" ? "BIT" : "COIN"}
            </span>
          </div>
        )
      })}
    </div>
  )
}
