"use client"

import { useState, useEffect, useCallback } from "react"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, ArrowUp, ArrowDown, Minus, RefreshCw } from "lucide-react"

type ClosingPrice = { time: number; price: number }

type Stats = {
  long: number; short: number; equal: number
  over: number; under: number
  odd: number; even: number
  total: number
}

const INTERVALS = [
  { label: "최근 20개", value: 20 },
  { label: "최근 50개", value: 50 },
  { label: "최근 100개", value: 100 },
  { label: "전체", value: 0 },
]

function pct(a: number, total: number) {
  if (total === 0) return 0
  return Math.round((a / total) * 100)
}

function calcStats(prices: ClosingPrice[]): Stats {
  const total = prices.length - 1
  if (total <= 0) return { long: 0, short: 0, equal: 0, over: 0, under: 0, odd: 0, even: 0, total: 0 }

  let long = 0, short = 0, equal = 0, over = 0, under = 0, odd = 0, even = 0

  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1].price
    const cur  = prices[i].price
    const lastDigit = Math.floor(Math.abs(cur * 100)) % 10

    if (cur > prev) long++
    else if (cur < prev) short++
    else equal++

    if (lastDigit >= 5) over++; else under++
    if (lastDigit % 2 === 0) even++; else odd++
  }

  return { long, short, equal, over, under, odd, even, total }
}

function RatioBar({ a, b, labelA, labelB, colorA, colorB }: {
  a: number; b: number; labelA: string; labelB: string; colorA: string; colorB: string
}) {
  const total = a + b
  const pctA = total > 0 ? Math.round((a / total) * 100) : 50
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className={colorA + " font-semibold"}>{labelA} {a}회 ({pctA}%)</span>
        <span className={colorB + " font-semibold"}>{labelB} {b}회 ({100 - pctA}%)</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden">
        <div className={`${pctA > 50 ? "bg-primary" : "bg-muted"} transition-all duration-500`} style={{ width: `${pctA}%` }} />
        <div className={`${100 - pctA > 50 ? "bg-destructive" : "bg-muted/50"} transition-all duration-500 flex-1`} />
      </div>
    </div>
  )
}

function StatCard({ title, icon: Icon, stat, items }: {
  title: string
  icon: any
  stat: Stats
  items: { label: string; value: number; color: string; bg: string }[]
}) {
  const total = items.reduce((s, i) => s + i.value, 0)
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="w-4 h-4 text-primary" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          {items.map((item) => (
            <div key={item.label} className={`flex-1 rounded-xl ${item.bg} p-3 text-center`}>
              <div className={`text-2xl font-bold ${item.color}`}>{pct(item.value, total)}%</div>
              <div className="text-xs text-muted-foreground mt-1">{item.label}</div>
              <div className="text-xs font-medium mt-0.5">{item.value}회</div>
            </div>
          ))}
        </div>
        {items.length === 2 && (
          <RatioBar
            a={items[0].value} b={items[1].value}
            labelA={items[0].label} labelB={items[1].label}
            colorA={items[0].color} colorB={items[1].color}
          />
        )}
      </CardContent>
    </Card>
  )
}

export default function TasksPage() {
  const [prices, setPrices] = useState<ClosingPrice[]>([])
  const [limit, setLimit] = useState(50)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    // window.__bitcoinClosingPrices 로부터 수집 (Price Server가 이미 올림)
    const raw: ClosingPrice[] = (window as any).__bitcoinClosingPrices ?? []
    const slice = limit > 0 ? raw.slice(-limit - 1) : raw
    setPrices(slice)
    setLoading(false)
  }, [limit])

  useEffect(() => { load() }, [load])

  // 매 5초마다 자동 갱신
  useEffect(() => {
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [load])

  const stats = calcStats(prices)

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-6 lg:ml-64">
        <Header
          title="마감가 분석"
          description="홀짝 · 언더/오버 · 롱/숏 비율을 분석합니다."
          actions={
            <Button variant="outline" size="sm" onClick={load} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
          }
        />

        {/* 구간 필터 */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {INTERVALS.map((iv) => (
            <Button
              key={iv.value}
              size="sm"
              variant={limit === iv.value ? "default" : "outline"}
              onClick={() => setLimit(iv.value)}
            >
              {iv.label}
            </Button>
          ))}
        </div>

        <div className="mt-4 mb-2 flex items-center gap-2">
          <Badge variant="outline">총 {stats.total}회 분석</Badge>
          {prices.length > 0 && (
            <span className="text-xs text-muted-foreground">
              마지막 마감가: ${prices[prices.length - 1]?.price.toFixed(1)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          {/* 롱/숏 */}
          <StatCard
            title="롱 / 숏"
            icon={TrendingUp}
            stat={stats}
            items={[
              { label: "롱", value: stats.long,  color: "text-primary",     bg: "bg-primary/10" },
              { label: "숏", value: stats.short, color: "text-destructive",  bg: "bg-destructive/10" },
            ]}
          />

          {/* 오버/언더 */}
          <StatCard
            title="오버 / 언더"
            icon={ArrowUp}
            stat={stats}
            items={[
              { label: "오버 (5~9)", value: stats.over,  color: "text-primary",    bg: "bg-primary/10" },
              { label: "언더 (0~4)", value: stats.under, color: "text-amber-500",  bg: "bg-amber-500/10" },
            ]}
          />

          {/* 홀/짝 */}
          <StatCard
            title="홀 / 짝"
            icon={Minus}
            stat={stats}
            items={[
              { label: "홀 (1·3·5·7·9)", value: stats.odd,  color: "text-primary",   bg: "bg-primary/10" },
              { label: "짝 (0·2·4·6·8)", value: stats.even, color: "text-sky-500",   bg: "bg-sky-500/10" },
            ]}
          />
        </div>

        {/* 최근 마감가 리스트 */}
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">최근 마감가 내역</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
              {[...prices].reverse().slice(0, 100).map((p, i, arr) => {
                const prev = arr[i + 1]
                const diff = prev ? p.price - prev.price : 0
                const lastDigit = Math.floor(Math.abs(p.price * 100)) % 10
                const isOver = lastDigit >= 5
                const isOdd = lastDigit % 2 !== 0
                const isLong = diff > 0
                return (
                  <div key={`${p.time}-${i}`} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-secondary/50 transition-colors text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-muted-foreground text-xs w-20 shrink-0">
                        {new Date(p.time * 1000).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                      <span className="font-mono font-semibold">${p.price.toFixed(1)}</span>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {prev && (
                        <Badge variant="outline" className={`text-[10px] px-1.5 ${diff > 0 ? "text-primary border-primary/30" : diff < 0 ? "text-destructive border-destructive/30" : ""}`}>
                          {diff > 0 ? <TrendingUp className="w-3 h-3" /> : diff < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                        </Badge>
                      )}
                      <Badge variant="outline" className={`text-[10px] px-1.5 ${isOver ? "text-primary border-primary/30" : "text-amber-500 border-amber-500/30"}`}>
                        {isOver ? "오버" : "언더"}
                      </Badge>
                      <Badge variant="outline" className={`text-[10px] px-1.5 ${isOdd ? "text-primary border-primary/30" : "text-sky-500 border-sky-500/30"}`}>
                        {isOdd ? "홀" : "짝"}
                      </Badge>
                      <Badge variant="outline" className="text-[10px] px-1.5 text-muted-foreground">
                        끝자리 {lastDigit}
                      </Badge>
                    </div>
                  </div>
                )
              })}
              {prices.length === 0 && (
                <div className="text-center text-muted-foreground py-8 text-sm">
                  마감가 데이터를 불러오는 중입니다...
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
