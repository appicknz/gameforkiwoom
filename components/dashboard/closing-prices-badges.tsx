"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"

function extractDigit(price: number): number {
  const priceStr = price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return parseInt(priceStr[priceStr.length - 1]) || 0
}

export function ClosingPricesBadges() {
  const [lastDigits, setLastDigits] = useState<number[]>([])

  useEffect(() => {
    // 초기값: window.__bitcoinClosingPrices
    const initPrices: { price: number }[] = (window as any).__bitcoinClosingPrices ?? []
    if (initPrices.length > 0) {
      setLastDigits(initPrices.slice(-10).reverse().map(i => extractDigit(i.price)))
    }

    // baka:closing 이벤트 구독 — Railway 단일 소스
    const onClosing = () => {
      const prices: { price: number }[] = (window as any).__bitcoinClosingPrices ?? []
      setLastDigits(prices.slice(-10).reverse().map(i => extractDigit(i.price)))
    }
    window.addEventListener("baka:closing", onClosing)
    return () => window.removeEventListener("baka:closing", onClosing)
  }, [])

  const GOLD = "#d4af37"
  const GOLD_BORDER = "rgba(212,175,55,0.18)"
  const CARD_BG = "rgba(5,13,10,0.85)"

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
        30초 끝자리
      </h3>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {lastDigits.map((digit, idx) => (
          <div
            key={idx}
            style={{
              width: 38, height: 38, borderRadius: "50%",
              background: "rgba(34,197,94,0.15)",
              border: "1px solid rgba(34,197,94,0.35)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 700, fontSize: 15,
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
