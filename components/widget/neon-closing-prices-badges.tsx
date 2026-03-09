"use client"

import { useEffect, useState } from "react"

function extractDigit(price: number): number {
  const priceStr = price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return parseInt(priceStr[priceStr.length - 1]) || 0
}

export function NeonClosingPricesBadges() {
  const [lastDigits, setLastDigits] = useState<number[]>([])

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
          setLastDigits(digits.slice(-10).reverse())
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const updateDigits = () => {
      const closingPrices = (window as any).__bitcoinClosingPrices || []
      const digits = closingPrices.map((item: { price: number }) => extractDigit(item.price))
      setLastDigits(digits.slice(-10).reverse())
    }
    updateDigits()
    const interval = setInterval(updateDigits, 1000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="p-5" style={{ background: "#0d1526" }}>
      <h2 className="text-base font-bold mb-4" style={{ color: "#e2e8f0" }}>30초 끝자리</h2>
      <div className="flex flex-wrap gap-2">
        {lastDigits.map((digit, idx) => (
          <div
            key={idx}
            className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-base transition-transform duration-200 hover:scale-110"
            style={{
              background: "#1a2d4a",
              color: "#00e87a",
              border: "1px solid rgba(0,232,122,0.3)",
            }}
          >
            {digit}
          </div>
        ))}
      </div>
    </div>
  )
}
