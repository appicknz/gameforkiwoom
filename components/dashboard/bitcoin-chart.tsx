"use client"

import { Card } from "@/components/ui/card"
import { useEffect, useState } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts"
import { TrendingUp } from "lucide-react"

interface PriceData {
  time: string
  price: number
}

export function BitcoinChart() {
  const [data, setData] = useState<PriceData[]>([])
  const [currentPrice, setCurrentPrice] = useState<number | null>(null)
  const [priceChange, setPriceChange] = useState<number>(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchBitcoinData = async () => {
      try {
        // CoinGecko API를 사용하여 지난 24시간의 비트코인 가격 데이터 가져오기
        const response = await fetch(
          "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=1&interval=hourly"
        )
        const jsonData = await response.json()

        if (jsonData.prices && Array.isArray(jsonData.prices)) {
          const formattedData: PriceData[] = jsonData.prices.map((price: [number, number], index: number) => {
            const date = new Date(price[0])
            const hours = date.getHours().toString().padStart(2, "0")
            const minutes = date.getMinutes().toString().padStart(2, "0")

            return {
              time: `${hours}:${minutes}`,
              price: Math.round(price[1]),
            }
          })

          setData(formattedData)

          // 현재 가격과 변화율 계산
          if (formattedData.length > 0) {
            const latest = formattedData[formattedData.length - 1].price
            const earliest = formattedData[0].price
            const change = ((latest - earliest) / earliest) * 100

            setCurrentPrice(latest)
            setPriceChange(parseFloat(change.toFixed(2)))
          }
        }
      } catch (error) {
        console.error("Failed to fetch Bitcoin data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchBitcoinData()

    // 5분마다 새로운 데이터 가져오기
    const interval = setInterval(fetchBitcoinData, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [])

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-foreground text-background px-3 py-2 rounded-lg text-xs font-semibold shadow-lg">
          <p className="font-bold">${payload[0].value.toLocaleString()}</p>
          <p className="text-[10px] opacity-80">{payload[0].payload.time}</p>
        </div>
      )
    }
    return null
  }

  const isPositive = priceChange >= 0

  return (
    <Card
      className="p-6 transition-all duration-500 hover:shadow-xl animate-slide-in-up bg-gradient-to-br from-background to-muted/20"
      style={{ animationDelay: "200ms" }}
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
            <span className="text-lg font-bold">₿</span>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-foreground">Bitcoin Price</h2>
            <p className="text-xs text-muted-foreground">24-hour market data</p>
          </div>
        </div>
        <div className="text-right">
          {currentPrice !== null && (
            <>
              <p className="text-2xl font-bold text-foreground">${currentPrice.toLocaleString()}</p>
              <div
                className={`flex items-center justify-end gap-1 text-sm font-semibold ${
                  isPositive ? "text-emerald-600" : "text-red-600"
                }`}
              >
                <TrendingUp className={`w-4 h-4 ${!isPositive ? "rotate-180" : ""}`} />
                <span>{isPositive ? "+" : ""}{priceChange}%</span>
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="text-muted-foreground">Loading market data...</div>
        </div>
      ) : (
        <div className="h-64 mb-4 relative">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="lineGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-muted/20" />
              <XAxis
                dataKey="time"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "currentColor", fontSize: 12 }}
                className="text-muted-foreground"
                interval={Math.floor(data.length / 6)}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "currentColor", fontSize: 12 }}
                className="text-muted-foreground"
                domain="dataMin - 500"
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "transparent" }} />
              <Line
                type="monotone"
                dataKey="price"
                stroke="#f97316"
                strokeWidth={2.5}
                dot={false}
                isAnimationActive={true}
                animationDuration={800}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="pt-4 border-t border-muted/50 flex items-center justify-between text-xs text-muted-foreground">
        <span>Data from CoinGecko API • Updates every 5 minutes</span>
        <span>24-hour chart</span>
      </div>
    </Card>
  )
}
