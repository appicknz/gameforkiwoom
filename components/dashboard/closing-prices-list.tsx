"use client"

import { useEffect, useRef, useState } from "react"

const PLAYER_COLOR = "#60a5fa"
const BANKER_COLOR = "#f97316"
const TIE_COLOR    = "#22c55e"

function getResult(price: number): "player" | "banker" | "tie" {
  const d = Math.floor(Math.abs(price * 100)) % 10
  return d <= 4 ? "player" : d <= 8 ? "banker" : "tie"
}

interface ClosingPrice {
  time: number
  price: number
  baccaratResult?: "player" | "banker" | "tie" | null
}

export function ClosingPricesList() {
  const [prices, setPrices] = useState<ClosingPrice[]>([])

  useEffect(() => {
    // 초기값
    const init: ClosingPrice[] = (window as any).__bitcoinClosingPrices ?? []
    if (init.length > 0) {
      setPrices([...init].sort((a, b) => b.time - a.time).slice(0, 10))
    }

    // baka:closing 이벤트로 30초마다 업데이트
    const onClosing = (e: Event) => {
      const { price, time, baccaratResult } = (e as CustomEvent<{ price: number; time: number; baccaratResult?: "player" | "banker" | "tie" }>).detail
      setPrices(prev => {
        const updated = [...prev, { time, price, baccaratResult: baccaratResult ?? null }]
        return updated.sort((a, b) => b.time - a.time).slice(0, 10)
      })
    }
    window.addEventListener("baka:closing", onClosing)
    return () => window.removeEventListener("baka:closing", onClosing)
  }, [])

  return (
    <div style={{
      background: "rgba(5,15,10,0.92)",
      border: "1px solid rgba(212,175,55,0.2)",
      borderRadius: 12,
      overflow: "hidden",
    }}>
      <div style={{ padding: "10px 14px", borderBottom: "1px solid rgba(212,175,55,0.1)" }}>
        <div style={{ fontSize: 9, color: "rgba(212,175,55,0.5)", letterSpacing: "0.1em", textTransform: "uppercase" }}>30초 끝자리 (최근 10개)</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxHeight: 200, overflowY: "auto" }}>
        {prices.length === 0 ? (
          <div style={{ padding: "10px 14px", color: "rgba(212,175,55,0.3)", fontSize: 12 }}>—</div>
        ) : (
          prices.map((p, i) => {
            const truncated = Math.floor(p.price * 100)
            const d1 = Math.floor(truncated / 10) % 10
            const d2 = truncated % 10
            const time = new Date(p.time * 1000).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
            const result = p.baccaratResult ?? getResult(p.price)
            const resultLabel = result === "player" ? "P" : result === "banker" ? "B" : "T"
            const resultColor = result === "player" ? PLAYER_COLOR : result === "banker" ? BANKER_COLOR : TIE_COLOR
            return (
              <div key={i} style={{
                padding: "8px 14px",
                borderBottom: i < prices.length - 1 ? "1px solid rgba(212,175,55,0.08)" : "none",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                fontSize: 12,
                gap: 8,
              }}>
                <span style={{ color: "rgba(212,175,55,0.5)", minWidth: 50 }}>{time}</span>
                <span style={{ color: "#d4af37", fontWeight: 600, fontVariantNumeric: "tabular-nums", flex: 1, textAlign: "right" }}>${p.price.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</span>
                <span style={{ color: "rgba(212,175,55,0.6)", fontSize: 11 }}>B{d1} P{d2}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 4,
                  background: `${resultColor}22`, color: resultColor, border: `1px solid ${resultColor}55`,
                }}>
                  {resultLabel}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
