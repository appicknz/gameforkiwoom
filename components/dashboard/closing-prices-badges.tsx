"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"

function extractDigit(price: number): number {
  const priceStr = price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return parseInt(priceStr[priceStr.length - 1]) || 0
}

export function ClosingPricesBadges() {
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
          setLastDigits(digits.slice(-10).reverse())
        }
      })
      .catch(() => {})
  }, [])

  // 이후 실시간 업데이트는 window 폴링
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
    <Card className="p-6 transition-all duration-500 hover:shadow-xl animate-slide-in-up" style={{ animationDelay: "500ms" }}>
      <h2 className="text-xl font-semibold text-foreground mb-3">30초 끝자리</h2>
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
