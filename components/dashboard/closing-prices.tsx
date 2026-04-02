"use client"

import { useEffect, useState } from "react"

interface PriceEntry {
  time: number
  price: number
  baccaratResult?: "player" | "banker" | "tie" | null
}

const GOLD = "#d4af37"
const GOLD_DIM = "rgba(212,175,55,0.5)"
const ROW_BG = "rgba(212,175,55,0.04)"
const ROW_BORDER = "rgba(212,175,55,0.1)"
const CARD_BG = "rgba(5,13,10,0.85)"
const GOLD_BORDER = "rgba(212,175,55,0.18)"

const PLAYER_COLOR = "#60a5fa"   // blue
const BANKER_COLOR = "#f97316"   // orange
const TIE_COLOR    = "#22c55e"   // green

function fmtTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString("ko-KR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  })
}

function fmtPrice(p: number) {
  return "$" + p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getComputedResult(price: number): "player" | "banker" | "tie" {
  const lastDigit = Math.floor(Math.abs(price * 100)) % 10
  return lastDigit <= 4 ? "player" : lastDigit <= 8 ? "banker" : "tie"
}

function BaccaratBadge({ result }: { result: "player" | "banker" | "tie" }) {
  const label = result === "player" ? "플레이어" : result === "banker" ? "뱅커" : "타이"
  const color = result === "player" ? PLAYER_COLOR : result === "banker" ? BANKER_COLOR : TIE_COLOR
  return (
    <span style={{
      padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700,
      background: `${color}22`, color, border: `1px solid ${color}55`,
      whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  )
}

function PriceRow({ entry }: { entry: PriceEntry }) {
  const truncated = Math.floor(entry.price * 100)
  const d1 = Math.floor(truncated / 10) % 10   // 소수점 첫째 (B)
  const d2 = truncated % 10                      // 소수점 둘째 (P)

  // baccarat_result: DB 저장값 우선, 없으면 가격에서 계산
  const baccaratResult = entry.baccaratResult ?? getComputedResult(entry.price)

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "7px 10px", borderRadius: 8,
      background: ROW_BG, border: `1px solid ${ROW_BORDER}`,
      fontSize: 12,
    }}>
      <span style={{ color: GOLD_DIM, fontFamily: "monospace", fontSize: 11, whiteSpace: "nowrap", minWidth: 60 }}>
        {fmtTime(entry.time)}
      </span>
      <span style={{ color: GOLD, fontWeight: 700, minWidth: 90, textAlign: "right" }}>
        {fmtPrice(entry.price)}
      </span>
      <span style={{ fontSize: 10, color: GOLD_DIM, minWidth: 36 }}>
        B{d1} P{d2}
      </span>
      <BaccaratBadge result={baccaratResult} />
    </div>
  )
}

export function ClosingPrices() {
  const [prices, setPrices] = useState<PriceEntry[]>([])
  const [expanded, setExpanded] = useState(false)

  // 페이지 로드 시 DB에서 기존 마감가 불러오기 (최근 50개)
  useEffect(() => {
    fetch("/api/closing-price?limit=50")
      .then(r => r.json())
      .then(({ prices: fetched }) => {
        if (Array.isArray(fetched) && fetched.length > 0) {
          setPrices(fetched as PriceEntry[])
        }
      })
      .catch(() => {})
  }, [])

  // 30초 마감: baka:closing 이벤트 구독
  useEffect(() => {
    const onClosing = (e: Event) => {
      const { price, time, baccaratResult } = (e as CustomEvent<{ price: number; time: number; baccaratResult?: "player" | "banker" | "tie" }>).detail
      setPrices(prev => {
        const last = prev[prev.length - 1]
        if (last?.time === time) return prev
        return [...prev, { time, price, baccaratResult: baccaratResult ?? null }].slice(-50)
      })
    }
    window.addEventListener("baka:closing", onClosing)
    return () => window.removeEventListener("baka:closing", onClosing)
  }, [])

  if (prices.length === 0) return null

  // 최신순 정렬 후 slice
  const sorted = [...prices].reverse()
  const displayCount = expanded ? 50 : 10
  const display = sorted.slice(0, displayCount)

  return (
    <div style={{
      background: CARD_BG, border: `1px solid ${GOLD_BORDER}`,
      borderRadius: 12, padding: "14px 14px 10px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: GOLD, letterSpacing: "0.04em" }}>
          30초 마감 기준가 (최근 {expanded ? "50개" : "10개"})
        </h3>
        <button
          onClick={() => setExpanded(v => !v)}
          style={{
            background: "rgba(212,175,55,0.08)", border: `1px solid ${GOLD_BORDER}`,
            color: GOLD_DIM, fontSize: 11, fontWeight: 700, padding: "3px 10px",
            borderRadius: 6, cursor: "pointer",
          }}
        >
          {expanded ? "접기" : "전체보기"}
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {display.map((entry) => (
          <PriceRow key={`closing-${entry.time}`} entry={entry} />
        ))}
      </div>
    </div>
  )
}
