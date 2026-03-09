"use client"

import { useEffect, useState } from "react"
import { ChevronDown } from "lucide-react"

interface ClosingPrice {
  time: number
  price: number
}

interface RoundData {
  id: string
  base_price: number
  result_price: number
  result_digit: number
  started_at: string
  ended_at: string
}

export function NeonClosingPrices() {
  const [closingPrices, setClosingPrices] = useState<ClosingPrice[]>([])
  const [rounds, setRounds] = useState<RoundData[]>([])
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

    fetch("/api/rounds")
      .then((r) => r.json())
      .then((data) => {
        if (data.rounds) {
          setRounds(data.rounds)
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

  const getRoundInfo = (idx: number) => {
    const roundIndex = closingPrices.length - displayLimit + idx
    if (roundIndex < 0 || roundIndex >= rounds.length) return null
    return rounds[roundIndex]
  }

  return (
    <div className="p-4" style={{ background: "#0d1526" }}>
      <h3 className="text-sm font-bold mb-4" style={{ color: "#e2e8f0" }}>
        30초 마감 기준가 (최근 {displayLimit}개)
      </h3>
      <div className="space-y-2 max-h-96 overflow-y-auto">
        {displayPrices.map((item, idx) => {
          const digit = getLastDigit(item.price)
          const digitType = getDigitType(digit)
          const parityType = getParityType(digit)
          const roundInfo = getRoundInfo(idx)
          const roundNum = roundInfo ? parseInt(roundInfo.id) : idx + 1

          return (
            <div
              key={`${item.time}-${idx}`}
              className="p-3 rounded-lg transition-all duration-200 hover:scale-[1.01] flex items-center justify-between text-xs"
              style={{
                background: "rgba(0,232,122,0.08)",
                border: "1px solid rgba(0,232,122,0.2)",
              }}
            >
              <div className="flex items-center gap-3 flex-1">
                <div style={{ color: "#00e87a", fontWeight: "bold", minWidth: "40px" }}>
                  #{roundNum}
                </div>
                <div style={{ color: "rgba(255,255,255,0.5)" }}>
                  {new Date(item.time * 1000).toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </div>
                <div style={{ color: "#00e87a", fontWeight: "bold" }}>
                  ${item.price.toLocaleString("en-US", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className="px-2 py-1 rounded text-[10px] font-semibold"
                  style={{
                    background: "rgba(0,232,122,0.15)",
                    color: "#00e87a",
                  }}
                >
                  끝자리 {digit}
                </span>
                <span
                  className="px-2 py-1 rounded text-[10px] font-semibold"
                  style={{
                    background: "rgba(0,232,122,0.15)",
                    color: "#00e87a",
                  }}
                >
                  {digitType}
                </span>
                <span
                  className="px-2 py-1 rounded text-[10px] font-semibold"
                  style={{
                    background: "rgba(0,232,122,0.15)",
                    color: "#00e87a",
                  }}
                >
                  {parityType}
                </span>
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

