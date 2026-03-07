"use client"

import { useEffect, useState } from "react"

function extractDigit(price: number): number {
  const s = price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return parseInt(s[s.length - 1]) || 0
}

export function NeonClosingPricesBadges() {
  const [lastDigits, setLastDigits] = useState<number[]>([])

  useEffect(() => {
    fetch("/api/closing-price")
      .then(r => r.json())
      .then(data => {
        if (data.prices?.length > 0) {
          const existing: any[] = (window as any).__bitcoinClosingPrices ?? []
          if (existing.length === 0) {
            ;(window as any).__bitcoinClosingPrices = data.prices
          }
          const digits = data.prices.map((item: { price: number }) => extractDigit(item.price))
          setLastDigits(digits.slice(-10).reverse())
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const update = () => {
      const prices: any[] = (window as any).__bitcoinClosingPrices || []
      const digits = prices.map((item: { price: number }) => extractDigit(item.price))
      setLastDigits(digits.slice(-10).reverse())
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="p-4" style={{ background: "#0d1526" }}>
      <p className="text-[11px] font-semibold tracking-widest uppercase mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>
        30초 끝자리
      </p>
      <div className="flex flex-wrap gap-2">
        {lastDigits.length === 0
          ? <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>대기 중...</span>
          : lastDigits.map((digit, idx) => (
            <div
              key={idx}
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.05)",
                border: "1px solid rgba(255,255,255,0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 700,
                color: "#e2e8f0",
                fontFamily: "var(--font-orbitron, monospace)",
              }}
            >
              {digit}
            </div>
          ))
        }
      </div>
    </div>
  )
}
