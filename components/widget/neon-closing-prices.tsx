"use client"

import { useEffect, useState } from "react"

interface ClosingPrice {
  time: number
  price: number
}

function extractDigit(price: number): number {
  const s = price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return parseInt(s[s.length - 1]) || 0
}

function getParity(digit: number) {
  return digit % 2 === 0 ? "짝" : "홀"
}

function getOverUnder(digit: number) {
  return digit >= 5 ? "오버" : "언더"
}

// 연속된 두 마감가를 비교해서 롱/숏 결정
function getDirection(price: number, prevPrice: number | null): "롱" | "숏" | null {
  if (prevPrice === null) return null
  return price > prevPrice ? "롱" : "숏"
}

export function NeonClosingPrices() {
  const [closingPrices, setClosingPrices] = useState<ClosingPrice[]>([])

  useEffect(() => {
    fetch("/api/closing-price")
      .then(r => r.json())
      .then(data => {
        if (data.prices?.length > 0) {
          const existing: ClosingPrice[] = (window as any).__bitcoinClosingPrices ?? []
          if (existing.length === 0) {
            ;(window as any).__bitcoinClosingPrices = data.prices
          }
          setClosingPrices(data.prices)
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const t = setInterval(() => {
      const prices: ClosingPrice[] = (window as any).__bitcoinClosingPrices ?? []
      if (prices.length > 0) setClosingPrices(prices)
    }, 500)
    return () => clearInterval(t)
  }, [])

  if (closingPrices.length === 0) return null

  // 최근 10개, 최신 순
  const display = closingPrices.slice(-10).reverse()

  return (
    <div className="p-4" style={{ background: "#0d1526" }}>
      <p className="text-[11px] font-semibold tracking-widest uppercase mb-3" style={{ color: "rgba(255,255,255,0.3)" }}>
        30초 마감 기준가
      </p>
      <div className="space-y-1.5">
        {display.map((item, idx) => {
          const digit = extractDigit(item.price)
          const parity = getParity(digit)
          const overUnder = getOverUnder(digit)
          // 이전 가격 (시간순으로 바로 앞 = display에서 idx+1)
          const prevPrice = display[idx + 1]?.price ?? null
          const direction = getDirection(item.price, prevPrice)
          // 라운드 번호: 타임스탬프 기반 (30초 단위 인덱스)
          const roundNum = Math.floor(item.time / 30)

          return (
            <div
              key={item.time}
              className="flex items-center justify-between rounded-lg px-3 py-2.5"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
            >
              {/* 왼쪽: 라운드 + 시간 */}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[9px] font-mono" style={{ color: "rgba(255,255,255,0.2)" }}>
                    #{roundNum}
                  </span>
                  <span className="text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {new Date(item.time * 1000).toLocaleTimeString("ko-KR", {
                      hour: "2-digit", minute: "2-digit", second: "2-digit",
                    })}
                  </span>
                </div>
                <span
                  className="text-sm font-black tabular-nums"
                  style={{ color: "#e2e8f0", fontFamily: "var(--font-orbitron, monospace)" }}
                >
                  ${item.price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
              </div>

              {/* 오른쪽: 방향 배지들 */}
              <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                {/* 롱/숏 */}
                {direction && (
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    style={{
                      background: direction === "롱" ? "rgba(0,200,100,0.15)" : "rgba(255,80,80,0.15)",
                      color: direction === "롱" ? "#4ade80" : "#f87171",
                      border: `1px solid ${direction === "롱" ? "rgba(0,200,100,0.25)" : "rgba(255,80,80,0.25)"}`,
                    }}
                  >
                    {direction}
                  </span>
                )}
                {/* 오버/언더 */}
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{
                    background: overUnder === "오버" ? "rgba(251,191,36,0.12)" : "rgba(147,197,253,0.12)",
                    color: overUnder === "오버" ? "#fbbf24" : "#93c5fd",
                    border: `1px solid ${overUnder === "오버" ? "rgba(251,191,36,0.2)" : "rgba(147,197,253,0.2)"}`,
                  }}
                >
                  {overUnder}
                </span>
                {/* 홀/짝 */}
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    color: "rgba(255,255,255,0.5)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                >
                  {parity}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
