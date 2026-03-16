"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"

function extractDigit(price: number): number {
  const priceStr = price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return parseInt(priceStr[priceStr.length - 1]) || 0
}

export function ClosingPricesBadges({ compact = false }: { compact?: boolean }) {
  const [lastDigits, setLastDigits] = useState<number[]>([])

  // 새로고침 시 DB에서 초기 끝자리 데이터 로드
  useEffect(() => {
    fetch("/api/closing-price")
      .then((r) => r.json())
      .then((data) => {
        if (data.prices && data.prices.length > 0) {
          const existing: any[] = (window as any).__bitcoinClosingPrices ?? []
          if (existing.length === 0) {
            ;(window as any).__bitcoinClosingPrices = data.prices
          }
          const digits = data.prices.map((item: { price: number }) => extractDigit(item.price))
          setLastDigits(digits.slice(-18).reverse())
        }
      })
      .catch(() => {})
  }, [])

  // 이후 실시간 업데이트는 window 폴링
  useEffect(() => {
    const updateDigits = () => {
      const closingPrices = (window as any).__bitcoinClosingPrices || []
      const digits = closingPrices.map((item: { price: number }) => extractDigit(item.price))
      setLastDigits(digits.slice(-18).reverse())
    }

    updateDigits()
    const interval = setInterval(updateDigits, 1000)
    return () => clearInterval(interval)
  }, [])

  const GOLD = "#d4af37"
  const GOLD_BORDER = "rgba(212,175,55,0.18)"
  const CARD_BG = "rgba(5,13,10,0.85)"

  const badgeSize  = compact ? 30 : 38
  const badgeFont  = compact ? 12 : 15
  const gap        = compact ? 5  : 8
  const padding    = compact ? "10px 12px" : "16px"
  const titleSize  = compact ? 10 : 13
  const titleGap   = compact ? 8  : 12

  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${GOLD_BORDER}`,
        borderRadius: 12,
        padding,
        boxShadow: "0 2px 24px rgba(0,0,0,0.5)",
      }}
    >
      <h3 style={{ fontSize: titleSize, fontWeight: 700, color: GOLD, marginBottom: titleGap, letterSpacing: "0.04em" }}>
        30초 끝자리
      </h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap }}>
        {lastDigits.map((digit, idx) => (
          <div
            key={idx}
            style={{
              width: badgeSize, height: badgeSize, borderRadius: "50%",
              background: "rgba(34,197,94,0.15)",
              border: "1px solid rgba(34,197,94,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: badgeFont,
              color: "#22c55e",
              boxShadow: "0 0 8px rgba(34,197,94,0.15)",
              transition: "transform 0.2s, box-shadow 0.2s",
              cursor: "default",
              flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1.12)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 0 14px rgba(34,197,94,0.35)" }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = "scale(1)"; (e.currentTarget as HTMLElement).style.boxShadow = "0 0 8px rgba(34,197,94,0.15)" }}
          >
            {digit}
          </div>
        ))}
      </div>
    </div>
  )
}
