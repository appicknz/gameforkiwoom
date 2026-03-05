"use client"

import { useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { usePriceWorker } from "@/hooks/use-price-worker"

interface ClosingPrice {
  time: number
  price: number
}

export function ClosingPrices() {
  const [closingPrices, setClosingPrices] = useState<ClosingPrice[]>([])

  // window 폴링 제거 — usePriceWorker 콜백으로 직접 업데이트
  usePriceWorker({
    onClosingPrice: useCallback((price: number, time: number) => {
      setClosingPrices((prev) => [...prev, { time, price }].slice(-100))
    }, []),
    onInitClosing: useCallback((prices: ClosingPrice[]) => {
      setClosingPrices(prices)
    }, []),
  })

  if (closingPrices.length === 0) return null

  const displayPrices = closingPrices.slice(-10).reverse()

  return (
    <Card className="p-4 bg-background border border-border/60">
      <h3 className="text-sm font-semibold text-foreground mb-3">30초 마감 기준가 (최근 10개)</h3>
      <div className="grid grid-cols-2 gap-3">
        {displayPrices.map((item, idx) => {
          const isUp = idx % 2 === 0
          return (
            <div
              key={`${item.time}-${idx}`}
              className={`p-3 rounded-lg border ${
                isUp
                  ? "bg-emerald-500/10 border-emerald-500/30"
                  : "bg-red-500/10 border-red-500/30"
              }`}
            >
              <div className="text-[10px] text-muted-foreground font-medium mb-1">
                {new Date(item.time * 1000).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </div>
              <div className="text-sm font-bold text-foreground">
                ${item.price.toLocaleString("en-US", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </div>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
