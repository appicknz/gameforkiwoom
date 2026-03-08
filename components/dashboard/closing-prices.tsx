"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"

interface ClosingPrice {
  time: number
  price: number
}

export function ClosingPrices() {
  const [closingPrices, setClosingPrices] = useState<ClosingPrice[]>([])

  // 새로고침 시 DB에서 초기 데이터 로드
  useEffect(() => {
    fetch("/api/closing-price")
      .then((r) => r.json())
      .then((data) => {
        if (data.prices && data.prices.length > 0) {
          // DB 데이터를 window에도 반영해서 다른 컴포넌트가 바로 사용 가능하게
          const existing: ClosingPrice[] = (window as any).__bitcoinClosingPrices ?? []
          if (existing.length === 0) {
            ;(window as any).__bitcoinClosingPrices = data.prices
            setClosingPrices(data.prices)
          }
        }
      })
      .catch(() => {})
  }, [])

  // 이후 실시간 업데이트는 window 폴링
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
    <Card className="p-4 bg-slate-950 border border-slate-800">
      <h3 className="text-sm font-bold text-slate-100 mb-4">30초 마감 기준가 (최근 10개)</h3>
      <div className="grid grid-cols-2 gap-3">
        {displayPrices.map((item, idx) => {
          const isUp = idx % 2 === 0
          return (
            <div
              key={`${item.time}-${idx}`}
              className={`p-3 rounded-lg border transition-all duration-300 hover:scale-105 ${
                isUp
                  ? "bg-emerald-500/10 border-emerald-500/40 hover:border-emerald-400/60"
                  : "bg-red-500/10 border-red-500/40 hover:border-red-400/60"
              }`}
            >
              <div className="text-xs text-slate-400 font-medium mb-1">
                오전 {new Date(item.time * 1000).toLocaleTimeString('ko-KR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </div>
              <div className={`text-sm font-bold ${isUp ? "text-emerald-400" : "text-red-400"}`}>
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
