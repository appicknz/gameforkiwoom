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
        <div className="bg-foreground text-background px-3 py-2 rounded-lg text-xs font-semibold shadow-lg">
          <p className="font-bold">{count}개</p>
          <p className="text-[10px] opacity-80">{percentage}%</p>
        </div>
      )
    }
    return null
  }

  return (
    <Card
      className="p-6 transition-all duration-500 hover:shadow-xl animate-slide-in-up bg-gradient-to-br from-background to-muted/20"
      style={{ animationDelay: "400ms" }}
    >
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold text-foreground">끝자리 분포</h2>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="w-2 h-2 rounded-full bg-emerald-600"></div>
          <span>끝자리 분포 (최근 100개)</span>
        </div>
      </div>

      <div className="h-64 mb-4 relative">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#047857" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-muted/20" />
            <XAxis
              dataKey="digit"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "currentColor", fontSize: 14 }}
              className="text-muted-foreground"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "currentColor", fontSize: 12 }}
              className="text-muted-foreground"
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "transparent" }} />
            <Bar
              dataKey="count"
              fill="url(#barGradient)"
              radius={[12, 12, 12, 12]}
              maxBarSize={60}
              onMouseEnter={(data, index) => setHoveredBar(index)}
              onMouseLeave={() => setHoveredBar(null)}
            >
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={barColors[index]}
                  className="transition-all duration-300"
                  style={{
                    filter:
                      hoveredBar === index ? "brightness(1.2) drop-shadow(0 4px 8px rgba(5, 150, 105, 0.4))" : "none",
                    transformOrigin: "center bottom",
                  }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Summary stats */}
      <div className="pt-4 border-t border-muted/50 flex items-center justify-between">
        <div className="text-sm">
          <span className="text-muted-foreground">평균: </span>
          <span className="font-semibold text-foreground">{average}개</span>
        </div>
        <div className="text-sm">
          <span className="text-muted-foreground">최대: </span>
          <span className="font-semibold text-emerald-600">{maxValue}개</span>
        </div>
      </div>
    </Card>
  )
}
