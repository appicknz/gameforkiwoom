"use client"

import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"

interface ClosingPrice {
  time: number
  price: number
}

export function ClosingPrices() {
  const [closingPrices, setClosingPrices] = useState<ClosingPrice[]>([])
  const [showAll, setShowAll] = useState(false)


  useEffect(() => {
    const initPrices: ClosingPrice[] = (window as any).__bitcoinClosingPrices ?? []
    if (initPrices.length > 0) setClosingPrices(initPrices)

    const onClosing = (e: Event) => {
      const { price, time } = (e as CustomEvent<{ price: number; time: number }>).detail
      setClosingPrices(prev => {
        const last = prev[prev.length - 1]
        if (last?.time === time) return prev
        return [...prev, { time, price }].slice(-100)
      })
    }
    window.addEventListener("baka:closing", onClosing)
    return () => window.removeEventListener("baka:closing", onClosing)
  }, [])

  if (closingPrices.length === 0) return null

  const displayLimit = showAll ? 100 : 10
  const displayPrices = closingPrices.slice(-displayLimit).reverse()

  const getLastDigit = (price: number) => {
    const priceStr = price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return parseInt(priceStr[priceStr.length - 1]) || 0
  }
  const getDigitType = (digit: number) => (digit <= 4 ? "언더" : "오버")
  const getParityType = (digit: number) => (digit % 2 === 0 ? "짝" : "홀")

  const GOLD = "#d4af37"
  const GOLD_DIM = "rgba(212,175,55,0.5)"
  const GOLD_BORDER = "rgba(212,175,55,0.18)"
  const CARD_BG = "rgba(5,13,10,0.85)"
  const ROW_BG = "rgba(212,175,55,0.04)"
  const ROW_BORDER = "rgba(212,175,55,0.1)"

  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${GOLD_BORDER}`,
        borderRadius: 14,
        padding: "16px",
        boxShadow: "0 2px 24px rgba(0,0,0,0.5)",
      }}
    >
      <h3 style={{ fontSize: 13, fontWeight: 700, color: GOLD, marginBottom: 12, letterSpacing: "0.04em" }}>
        30초 마감 기준가 (최근 {displayLimit}개)
      </h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 400, overflowY: "auto" }}>
        {displayPrices.map((item, idx) => {
          const digit = getLastDigit(item.price)
          const prevPrice = displayPrices[idx + 1]?.price ?? null
          const resultDirection = prevPrice != null
            ? (item.price >= prevPrice ? "롱" : "숏")
            : null
          const resultDigit = getDigitType(digit)
          const resultParity = getParityType(digit)

          const Tag = ({ label }: { label: string }) => (
            <span style={{
              padding: "1px 7px", borderRadius: 4, fontSize: 10, fontWeight: 700,
              background: "rgba(212,175,55,0.08)", color: GOLD_DIM,
            }}>{label}</span>
          )

          return (
            <div
              key={`${item.time}-${idx}`}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 8, padding: "7px 10px", borderRadius: 8,
                background: ROW_BG, border: `1px solid ${ROW_BORDER}`,
                fontSize: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: GOLD_DIM, fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                  {new Date(item.time * 1000).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })}
                </span>
                <span style={{ fontWeight: 700, color: "rgba(232,213,163,0.9)", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                  ${item.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <Tag label={resultDirection ?? "—"} />
                <Tag label={resultDigit} />
                <Tag label={resultParity} />
              </div>
            </div>
          )
        })}
      </div>

      {!showAll && closingPrices.length > 10 && (
        <button
          onClick={() => setShowAll(true)}
          style={{
            width: "100%", marginTop: 8, padding: "7px 0", borderRadius: 8,
            fontSize: 12, fontWeight: 600, color: GOLD_DIM,
            background: "transparent", border: `1px solid ${GOLD_BORDER}`,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
            transition: "color 0.2s, border-color 0.2s",
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = GOLD; (e.currentTarget as HTMLElement).style.borderColor = "rgba(212,175,55,0.4)" }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = GOLD_DIM; (e.currentTarget as HTMLElement).style.borderColor = GOLD_BORDER }}
        >
          더보기 <ChevronDown size={13} />
        </button>
      )}
    </div>
  )
}
