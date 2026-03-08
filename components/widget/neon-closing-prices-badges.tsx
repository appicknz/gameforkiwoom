"use client"

import { useEffect, useState } from "react"

function extractDigit(price: number): number {
  const s = price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return parseInt(s[s.length - 1]) || 0
}

export function NeonClosingPricesBadges() {
  const [lastDigits, setLastDigits] = useState<number[]>([])

  useEffect(() => {
    fetch("/api/closing-price")
      .then(r => r.json())
      .then(data => {
        if (data.prices?.length > 0) {
          const existing: any[] = (window as any).__bitcoinClosingPrices ?? []
          if (existing.length === 0) {
            ;(window as any).__bitcoinClosingPrices = data.prices
          }
          const digits = data.prices.map((item: { price: number }) => extractDigit(item.price))
          setLastDigits(digits.slice(-14).reverse())
        }
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const update = () => {
      const prices: any[] = (window as any).__bitcoinClosingPrices || []
      const digits = prices.map((item: { price: number }) => extractDigit(item.price))
      setLastDigits(digits.slice(-14).reverse())
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [])

  // 홀: 청록(teal), 짝: 핑크/로즈, 0은 짝으로 취급
  const getStyle = (digit: number) => {
    const isOdd = digit % 2 !== 0
    return isOdd
      ? { bg: "rgba(20,184,166,0.18)", border: "1px solid rgba(20,184,166,0.45)", color: "#2dd4bf" }   // 홀 — teal
      : { bg: "rgba(244,63,94,0.15)",  border: "1px solid rgba(244,63,94,0.4)",  color: "#fb7185" }    // 짝 — rose
  }

  return (
    <div className="p-4" style={{ background: "#0d1526" }}>
      <div className="flex items-center justify-between mb-3">
        <p className="text-[11px] font-semibold tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.3)" }}>
          30초 끝자리
        </p>
        <div className="flex items-center gap-2.5 text-[10px]" style={{ color: "rgba(255,255,255,0.25)" }}>
          <span style={{ color: "#2dd4bf" }}>● 홀</span>
          <span style={{ color: "#fb7185" }}>● 짝</span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {lastDigits.length === 0
          ? <span className="text-xs" style={{ color: "rgba(255,255,255,0.2)" }}>대기 중...</span>
          : lastDigits.map((digit, idx) => {
            const s = getStyle(digit)
            return (
              <div
                key={idx}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: "50%",
                  background: s.bg,
                  border: s.border,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 14,
                  fontWeight: 700,
                  color: s.color,
                  fontFamily: "var(--font-orbitron, monospace)",
                }}
              >
                {digit}
              </div>
            )
          })
        }
      </div>
    </div>
  )
}
