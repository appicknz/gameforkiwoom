"use client"

import { useEffect, useState } from "react"

interface ClosingPrice {
  time: number
  price: number
}

export function NeonClosingPrices() {
  const [closingPrices, setClosingPrices] = useState<ClosingPrice[]>([])

  useEffect(() => {
    fetch("/api/closing-price")
      .then((r) => r.json())
      .then((data) => {
        if (data.prices && data.prices.length > 0) {
          const existing: ClosingPrice[] = (window as any).__bitcoinClosingPrices ?? []
          if (existing.length === 0) {
            ;(window as any).__bitcoinClosingPrices = data.prices
            setClosingPrices(data.prices)
          }
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof window !== "undefined" && (window as any).__bitcoinClosingPrices) {
        setClosingPrices((window as any).__bitcoinClosingPrices)
      }
    }, 500)
    return () => clearInterval(interval)
  }, [])

  if (closingPrices.length === 0) return null

  const displayPrices = closingPrices.slice(-10).reverse()

  return (
    <div className="p-4" style={{ background: "#0d1526" }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: "#e2e8f0" }}>
        30초 마감 기준가 (최근 10개)
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {displayPrices.map((item, idx) => {
          const isUp = idx % 2 === 0
          return (
            <div
              key={`${item.time}-${idx}`}
              className="p-3 rounded-xl transition-all duration-200 hover:scale-[1.02]"
              style={{
                background: isUp ? "rgba(0,232,122,0.07)" : "rgba(255,77,79,0.07)",
                border: isUp
                  ? "1px solid rgba(0,232,122,0.25)"
                  : "1px solid rgba(255,77,79,0.25)",
              }}
            >
              <div className="text-[10px] font-medium mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                {new Date(item.time * 1000).toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </div>
              <div
                className="text-sm font-bold"
                style={{ color: isUp ? "#00e87a" : "#ff4d4f" }}
              >
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
