"use client"

import { useEffect, useState } from "react"

interface PriceEntry {
  time: number
  price: number
}

const GOLD = "#d4af37"
const GOLD_DIM = "rgba(212,175,55,0.5)"
const ROW_BG = "rgba(212,175,55,0.04)"
const ROW_BORDER = "rgba(212,175,55,0.1)"
const CARD_BG = "rgba(5,13,10,0.85)"
const GOLD_BORDER = "rgba(212,175,55,0.18)"

function Tag({ label }: { label: string }) {
  return (
    <span style={{ padding: "1px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700, background: "rgba(212,175,55,0.08)", color: GOLD_DIM }}>
      {label}
    </span>
  )
}

function fmtTime(ts: number) {
  return new Date(ts * 1000).toLocaleTimeString("ko-KR", {
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  })
}

function fmtPrice(p: number) {
  return "$" + p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getTags(price: number) {
  const truncated = Math.floor(price * 100)
  const lastDigit = truncated % 10
  const d1 = Math.floor(truncated / 10) % 10  // 소수점 첫째 (뱅커)
  const d2 = truncated % 10                    // 소수점 둘째 (플레이어)
  return {
    lastDigit,
    direction: null as string | null,         // 방향은 다음 봉과 비교 필요
    digitLabel: lastDigit <= 4 ? "언더" : "오버",
    parityLabel: lastDigit % 2 === 0 ? "짝" : "홀",
    bankerDigit: d1,
    playerDigit: d2,
  }
}

function PriceRow({
  entry,
  prev,
  isRoundBoundary,
  showBaccarat,
}: {
  entry: PriceEntry
  prev: PriceEntry | undefined
  isRoundBoundary: boolean
  showBaccarat: boolean
}) {
  const { digitLabel, parityLabel, bankerDigit, playerDigit } = getTags(entry.price)
  const diff = prev ? entry.price - prev.price : 0
  const directionLabel = diff > 0 ? "롱" : diff < 0 ? "숏" : "—"

  const bg = isRoundBoundary ? "rgba(34,197,94,0.15)" : ROW_BG
  const border = isRoundBoundary ? "rgba(34,197,94,0.3)" : ROW_BORDER

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      gap: 8, padding: "7px 10px", borderRadius: 8,
      background: bg, border: `1px solid ${border}`,
      fontSize: 12, transition: "background 0.2s",
    }}>
      <span style={{ color: GOLD_DIM, fontFamily: "monospace", fontSize: 11, whiteSpace: "nowrap" }}>
        {fmtTime(entry.time)}
      </span>
      <span style={{ color: GOLD, fontWeight: 700, flex: 1, textAlign: "right", marginRight: 8 }}>
        {fmtPrice(entry.price)}
      </span>
      {showBaccarat && isRoundBoundary && (
        <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 700, marginRight: 4 }}>
          B{bankerDigit} P{playerDigit}
        </span>
      )}
      <div style={{ display: "flex", gap: 4 }}>
        <Tag label={directionLabel} />
        <Tag label={digitLabel} />
        <Tag label={parityLabel} />
      </div>
    </div>
  )
}

export function ClosingPrices() {
  // 1초 실시간 — baka:price 이벤트 (Railway 1초 단위 가격)
  const [realtimePrices, setRealtimePrices] = useState<PriceEntry[]>([])
  // 30초 마감 — baka:closing 이벤트 (Railway 30초 마감가)
  const [boundaryPrices, setBoundaryPrices] = useState<PriceEntry[]>([])
  const [showAllRealtime, setShowAllRealtime] = useState(false)

  // 페이지 로드 시 DB에서 기존 30초 마감가 불러오기
  useEffect(() => {
    fetch("/api/closing-price")
      .then(r => r.json())
      .then(({ prices }) => {
        if (Array.isArray(prices) && prices.length > 0) {
          setBoundaryPrices(prices.slice(-20))
        }
      })
      .catch(() => {})
  }, [])

  // 1초 실시간: baka:price 이벤트 구독
  useEffect(() => {
    const onPrice = (e: Event) => {
      const { price, time } = (e as CustomEvent<{ price: number; time: number }>).detail
      setRealtimePrices(prev => {
        const last = prev[prev.length - 1]
        if (last?.time === time) return prev
        return [...prev, { time, price }].slice(-100)
      })
    }
    window.addEventListener("baka:price", onPrice)
    return () => window.removeEventListener("baka:price", onPrice)
  }, [])

  // 30초 마감: baka:closing 이벤트 구독
  useEffect(() => {
    const onClosing = (e: Event) => {
      const { price, time } = (e as CustomEvent<{ price: number; time: number }>).detail
      setBoundaryPrices(prev => {
        const last = prev[prev.length - 1]
        if (last?.time === time) return prev
        return [...prev, { time, price }].slice(-20)
      })
    }
    window.addEventListener("baka:closing", onClosing)
    return () => window.removeEventListener("baka:closing", onClosing)
  }, [])

  if (realtimePrices.length === 0) return null

  const realtimeDisplay = showAllRealtime
    ? [...realtimePrices].reverse()
    : [...realtimePrices].reverse().slice(0, 10)

  const boundaryDisplay = [...boundaryPrices].reverse().slice(0, 10)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* 30초 마감 기준가 — 최근 2개 */}
      {boundaryDisplay.length > 0 && (
        <div style={{
          background: CARD_BG, border: `1px solid ${GOLD_BORDER}`,
          borderRadius: 12, padding: "14px 14px 10px",
        }}>
          <h3 style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 10, letterSpacing: "0.04em" }}>
            30초 마감 기준가 (최근 10개)
          </h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {boundaryDisplay.map((entry, idx) => {
              const prev = boundaryDisplay[idx + 1]
              return (
                <PriceRow
                  key={`boundary-${entry.time}`}
                  entry={entry}
                  prev={prev}
                  isRoundBoundary={true}
                  showBaccarat={true}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* 1초 실시간 */}
      <div style={{
        background: CARD_BG, border: `1px solid ${GOLD_BORDER}`,
        borderRadius: 12, padding: "14px 14px 10px",
      }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 10, letterSpacing: "0.04em" }}>
          1초 실시간 (최근 {showAllRealtime ? realtimePrices.length : 10}개)
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {realtimeDisplay.map((entry, idx, arr) => {
            const prev = arr[idx + 1]
            const sec = new Date(entry.time * 1000).getSeconds()
            const isRoundBoundary = sec === 0 || sec === 30
            return (
              <PriceRow
                key={`rt-${entry.time}-${idx}`}
                entry={entry}
                prev={prev}
                isRoundBoundary={isRoundBoundary}
                showBaccarat={false}
              />
            )
          })}
        </div>
        {realtimePrices.length > 10 && (
          <button
            onClick={() => setShowAllRealtime(v => !v)}
            style={{
              width: "100%", marginTop: 8, padding: "8px 0",
              background: "rgba(212,175,55,0.06)", border: `1px solid ${GOLD_BORDER}`,
              borderRadius: 8, color: GOLD_DIM, fontSize: 12, cursor: "pointer",
            }}
          >
            {showAllRealtime ? "접기 ∧" : "더보기 ∨"}
          </button>
        )}
      </div>

    </div>
  )
}
