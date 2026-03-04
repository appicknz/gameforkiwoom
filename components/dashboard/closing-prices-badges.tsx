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

  return (
    <Card className="p-6 transition-all duration-500 hover:shadow-xl animate-slide-in-up" style={{ animationDelay: "500ms" }}>
      <h2 className="text-xl font-semibold text-foreground mb-6">30초 끝자리</h2>
      <div className="flex flex-wrap gap-2">
        {lastDigits.map((digit, idx) => (
          <div
            key={idx}
            className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm transition-all duration-300 hover:scale-110 hover:shadow-lg"
          >
            {digit}
          </div>
        ))}
      </div>
    </Card>
  )
}
