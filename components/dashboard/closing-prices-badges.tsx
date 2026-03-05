"use client"

import { useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { usePriceWorker } from "@/hooks/use-price-worker"

export function ClosingPricesBadges() {
  const [lastDigits, setLastDigits] = useState<number[]>([])

  // window 폴링 제거 — usePriceWorker 콜백으로 직접 업데이트
  usePriceWorker({
    onClosingPrice: useCallback((price: number, _time: number) => {
      const digit = Math.floor(price * 10) % 10
      setLastDigits((prev) => [...prev, digit].slice(-10).reverse().slice(0, 10))
    }, []),
    onInitClosing: useCallback((prices: Array<{ time: number; price: number }>) => {
      const digits = prices
        .slice(-10)
        .reverse()
        .map((item) => Math.floor(item.price * 10) % 10)
      setLastDigits(digits)
    }, []),
  })

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
