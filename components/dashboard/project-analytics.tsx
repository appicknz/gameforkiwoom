"use client"

import { Card } from "@/components/ui/card"
import { useState, useEffect } from "react"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts"

interface ClosingPrice {
  time: number
  price: number
}

export function ProjectAnalytics() {
  const [chartData, setChartData] = useState<Array<{ digit: string; count: number }>>([])
  const [hoveredBar, setHoveredBar] = useState<number | null>(null)

  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof window !== 'undefined' && (window as any).__bitcoinClosingPrices) {
        const closingPrices: ClosingPrice[] = (window as any).__bitcoinClosingPrices

        // 최근 100개 중에서 끝자리 분포 계산
        const recentPrices = closingPrices.slice(-100)
        const digitCounts = Array(10).fill(0)

        recentPrices.forEach((item) => {
          const lastDigit = Math.floor(item.price * 10) % 10
          digitCounts[lastDigit]++
        })

        const newChartData = digitCounts.map((count, digit) => ({
          digit: digit.toString(),
          count: count,
        }))

        setChartData(newChartData)
      }
    }, 500)

    return () => clearInterval(interval)
  }, [])

  const maxValue = chartData.length > 0 ? Math.max(...chartData.map((d) => d.count)) : 0
  const average = chartData.length > 0 ? Math.round(chartData.reduce((acc, d) => acc + d.count, 0) / chartData.length) : 0
  const totalCount = chartData.reduce((acc, d) => acc + d.count, 0)

  const barColors = ["#059669", "#047857", "#10b981", "#065f46", "#059669", "#047857", "#10b981", "#059669", "#047857", "#10b981"]

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const count = payload[0].value
      const percentage = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0
      return (
        <div style={{ background: "rgba(5,13,10,0.97)", border: "1px solid rgba(212,175,55,0.25)", borderRadius: 8, padding: "6px 12px" }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: "#d4af37", margin: 0 }}>{count}개</p>
          <p style={{ fontSize: 11, color: "rgba(212,175,55,0.55)", margin: 0 }}>{percentage}%</p>
        </div>
      )
    }
    return null
  }

  const GOLD = "#d4af37"
  const GOLD_DIM = "rgba(212,175,55,0.5)"
  const GOLD_BORDER = "rgba(212,175,55,0.18)"
  const CARD_BG = "rgba(5,13,10,0.85)"

  return (
    <div
      style={{
        background: CARD_BG,
        border: `1px solid ${GOLD_BORDER}`,
        borderRadius: 14,
        padding: "16px",
        boxShadow: "0 2px 24px rgba(0,0,0,0.5)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h3 style={{ fontSize: 13, fontWeight: 700, color: GOLD, letterSpacing: "0.04em" }}>끝자리 분포</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: GOLD_DIM }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e" }} />
          끝자리 분포 (최근 100개)
        </div>
      </div>

      <div style={{ height: 220, marginBottom: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 4, left: -24, bottom: 0 }}>
            <defs>
              <linearGradient id="bakaBarGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" />
                <stop offset="100%" stopColor="#15803d" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(212,175,55,0.08)" />
            <XAxis
              dataKey="digit"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(212,175,55,0.5)", fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "rgba(212,175,55,0.5)", fontSize: 11 }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(212,175,55,0.04)" }} />
            <Bar
              dataKey="count"
              fill="url(#bakaBarGrad)"
              radius={[6, 6, 6, 6]}
              maxBarSize={48}
              onMouseEnter={(_, index) => setHoveredBar(index)}
              onMouseLeave={() => setHoveredBar(null)}
            >
              {chartData.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={hoveredBar === index ? "#4ade80" : "url(#bakaBarGrad)"}
                  style={{ filter: hoveredBar === index ? "drop-shadow(0 0 6px rgba(34,197,94,0.5))" : "none" }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ paddingTop: 10, borderTop: `1px solid rgba(212,175,55,0.12)`, display: "flex", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12 }}>
          <span style={{ color: GOLD_DIM }}>평균: </span>
          <span style={{ fontWeight: 700, color: "rgba(232,213,163,0.9)" }}>{average}개</span>
        </div>
        <div style={{ fontSize: 12 }}>
          <span style={{ color: GOLD_DIM }}>최대: </span>
          <span style={{ fontWeight: 700, color: "#22c55e" }}>{maxValue}개</span>
        </div>
      </div>
    </div>
  )
}
