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

interface PriceEntry { time: number; price: number }

// 5분 라운드의 마감 기준가: 매 300초(5분) 경계 가격
// baka:closing(30초)을 구독하되, time % 300 === 0 인 것만 필터링
function is5MinBoundary(time: number) {
  return time % 300 === 0
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

function getBitCoin(price: number) {
  const dec = price.toFixed(2).split(".")[1] ?? "00"
  return {
    bit: parseInt(dec[0] ?? "0"),
    coin: parseInt(dec[1] ?? "0"),
  }
}

export function RaceClosingPrices() {
  const [prices, setPrices] = useState<PriceEntry[]>([])

  // 페이지 로드 시 DB에서 5분 단위 기록 조회
  useEffect(() => {
    fetch("/api/closing-price")
      .then(r => r.json())
      .then(({ prices: raw }) => {
        if (!Array.isArray(raw)) return
        const filtered = raw.filter((p: PriceEntry) => is5MinBoundary(p.time))
        setPrices(filtered.slice(-20))
      })
      .catch(() => {})
  }, [])

  // 30초 마감 이벤트에서 5분 경계만 필터링
  useEffect(() => {
    const onClosing = (e: Event) => {
      const { price, time } = (e as CustomEvent<{ price: number; time: number }>).detail
      if (!is5MinBoundary(time)) return
      setPrices(prev => {
        const last = prev[prev.length - 1]
        if (last?.time === time) return prev
        return [...prev, { time, price }].slice(-20)
      })
    }
    window.addEventListener("baka:closing", onClosing)
    return () => window.removeEventListener("baka:closing", onClosing)
  }, [])

  const display = [...prices].reverse().slice(0, 10)

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
        5분 마감 기준가 (최근 10개)
      </h3>

      {display.length === 0 && (
        <div style={{ textAlign: "center", color: GOLD_DIM, fontSize: 12, padding: "20px 0" }}>
          5분 마감 기록 대기 중...
        </div>
      )}

      {display.map((entry, i) => {
        const { bit, coin } = getBitCoin(entry.price)
        const winner = bit > coin ? "bit" : coin > bit ? "coin" : "tie"
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
            <span style={{ fontSize: 11, fontWeight: 700, color: BIT_COLOR, minWidth: 24 }}>B{bit}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: COIN_COLOR, minWidth: 28 }}>C{coin}</span>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: winner === "bit" ? BIT_COLOR : winner === "coin" ? COIN_COLOR : GOLD,
              background: winner === "bit" ? "rgba(59,130,246,0.12)" : winner === "coin" ? "rgba(249,115,22,0.12)" : "rgba(212,175,55,0.12)",
              padding: "1px 6px",
              borderRadius: 4,
            }}>
              {winner === "tie" ? "TIE" : winner === "bit" ? "BIT" : "COIN"}
            </span>
          </div>
        )
      })}
    </div>
  )
}
