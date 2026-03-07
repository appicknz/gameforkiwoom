"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"

export function ClosingPricesBadges() {
  const [lastDigits, setLastDigits] = useState<number[]>([])

  useEffect(() => {
    const updateDigits = () => {
      const closingPrices = (window as any).__bitcoinClosingPrices || []
      const digits = closingPrices.map((item: { price: number }) => {
        const priceStr = item.price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
        const lastChar = priceStr[priceStr.length - 1]
        return parseInt(lastChar) || 0
      })
      setLastDigits(digits.slice(-10).reverse()) // 최근 10개
    }

    updateDigits()
    const interval = setInterval(updateDigits, 1000)
    return () => clearInterval(interval)
  }, [])

  const digitColor = (d: number) => {
    if (d <= 4) return "#00aaff"  // 언더
    return "#ff3355"              // 오버
  }

  return (
    <div className="p-4">
      <p className="text-[10px] mb-3" style={{ color: "rgba(0,255,200,0.45)" }}>30초 끝자리</p>
      <div className="flex flex-wrap gap-2">
        {lastDigits.map((digit, idx) => (
          <div
            key={idx}
            className="w-9 h-9 rounded-lg flex items-center justify-center font-black text-sm transition-all duration-200"
            style={{
              background: `${digitColor(digit)}15`,
              border: `1.5px solid ${digitColor(digit)}60`,
              color: digitColor(digit),
              boxShadow: `0 0 8px ${digitColor(digit)}30`,
              opacity: 1 - idx * 0.06,
            }}
          >
            {digit}
          </div>
        ))}
      </div>
    </div>
  )
}
