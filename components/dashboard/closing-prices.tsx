"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"

interface ClosingPrice {
  time: number
  price: number
}

export function ClosingPrices() {
  const [closingPrices, setClosingPrices] = useState<ClosingPrice[]>([])

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof window !== 'undefined' && (window as any).__bitcoinClosingPrices) {
        setClosingPrices((window as any).__bitcoinClosingPrices)
      }
    }, 500)

    return () => clearInterval(interval)
  }, [])

  if (closingPrices.length === 0) {
    return null
  }

  const displayPrices = closingPrices.slice(-10).reverse()

  return (
    <div className="p-4">
      <p className="text-[10px] mb-3" style={{ color: "rgba(0,255,200,0.45)" }}>30초 마감 기준가</p>
      <div className="grid grid-cols-2 gap-2">
        {displayPrices.map((item, idx) => {
          const nextItem = displayPrices[idx + 1]
          const isUp = nextItem ? item.price >= nextItem.price : true
          const c = isUp ? "#00ff88" : "#ff3355"
          return (
            <div
              key={`${item.time}-${idx}`}
              className="p-2.5 rounded-lg"
              style={{
                background: `${c}08`,
                border: `1px solid ${c}30`,
              }}
            >
              <div className="text-[9px] mb-0.5" style={{ color: "rgba(0,255,200,0.35)" }}>
                {new Date(item.time * 1000).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </div>
              <div className="text-xs font-bold tabular-nums" style={{ color: c }}>
                ${item.price.toLocaleString("en-US", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
