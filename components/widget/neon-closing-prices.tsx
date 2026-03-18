"use client"

import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"

interface ClosingPrice {
  time: number
  price: number
}

export function NeonClosingPrices() {
  const [closingPrices, setClosingPrices] = useState<ClosingPrice[]>([])
  const [showAll, setShowAll] = useState(false)

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

  const displayLimit = showAll ? 100 : 10
  const displayPrices = closingPrices.slice(-displayLimit).reverse()

  const getLastDigit = (price: number) => Math.floor(Math.abs(price * 10)) % 10
  const getDigitType = (digit: number) => (digit <= 4 ? "언더" : "오버")
  const getParityType = (digit: number) => (digit % 2 === 0 ? "짝" : "홀")

  return (
    <div className="p-4" style={{ background: "#0d1526" }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: "#e2e8f0" }}>
        30초 마감 기준가 (최근 {displayLimit}개)
      </h3>
      <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
        {displayPrices.map((item, idx) => {
          const digit = getLastDigit(item.price)
          const prevPrice = displayPrices[idx + 1]?.price ?? null
          const resultDirection = prevPrice != null
            ? (item.price >= prevPrice ? "롱" : "숏")
            : null
          const resultDigit = getDigitType(digit)
          const resultParity = getParityType(digit)

          const Tag = ({ label }: { label: string }) => (
            <span
              className="px-1.5 py-0.5 rounded text-[10px] font-semibold"
              style={{ background: "rgba(255,255,255,0.07)", color: "rgba(255,255,255,0.4)" }}
            >
              {label}
            </span>
          )

          return (
            <div
              key={`${item.time}-${idx}`}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              {/* 왼쪽: 시간 + 가격 */}
              <div className="flex items-center gap-2 min-w-0">
                <span className="tabular-nums shrink-0" style={{ color: "rgba(255,255,255,0.4)" }}>
                  {new Date(item.time * 1000).toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                    hour12: false,
                  })}
                </span>
                <span className="font-bold tabular-nums shrink-0" style={{ color: "#e2e8f0" }}>
                  ${item.price.toLocaleString("en-US", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                </span>
              </div>

              {/* 오른쪽: 롱/숏 · 오버/언더 · 홀/짝 */}
              <div className="flex items-center gap-1 shrink-0">
                <Tag label={resultDirection ?? "—"} />
                <Tag label={resultDigit} />
                <Tag label={resultParity} />
              </div>
            </div>
          )
        })}
      </div>

      {!showAll && closingPrices.length > 10 && (
        <button
          onClick={() => setShowAll(true)}
          className="w-full mt-3 py-2 px-3 rounded-lg text-sm font-semibold transition-all duration-200 hover:scale-[1.02] flex items-center justify-center gap-2"
          style={{
            background: "rgba(0,232,122,0.1)",
            border: "1px solid rgba(0,232,122,0.3)",
            color: "#00e87a",
          }}
        >
          더보기
          <ChevronDown size={16} />
        </button>
      )}
    </div>
  )
}

