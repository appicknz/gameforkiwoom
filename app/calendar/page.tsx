"use client"

import { useState, useEffect, useCallback } from "react"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Hash, RefreshCw, BarChart3 } from "lucide-react"

type ClosingPrice = { time: number; price: number }

const INTERVALS = [
  { label: "최근 20개", value: 20 },
  { label: "최근 50개", value: 50 },
  { label: "최근 100개", value: 100 },
  { label: "전체", value: 0 },
]

const DIGIT_COLORS: Record<number, string> = {
  0: "bg-slate-500",
  1: "bg-blue-500",
  2: "bg-cyan-500",
  3: "bg-teal-500",
  4: "bg-emerald-500",
  5: "bg-green-500",
  6: "bg-yellow-500",
  7: "bg-orange-500",
  8: "bg-red-500",
  9: "bg-pink-500",
}

const DIGIT_TEXT: Record<number, string> = {
  0: "text-slate-500",
  1: "text-blue-500",
  2: "text-cyan-500",
  3: "text-teal-500",
  4: "text-emerald-500",
  5: "text-green-500",
  6: "text-yellow-500",
  7: "text-orange-500",
  8: "text-red-500",
  9: "text-pink-500",
}

export default function CalendarPage() {
  const [prices, setPrices] = useState<ClosingPrice[]>([])
  const [limit, setLimit] = useState(50)
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    const raw: ClosingPrice[] = (window as any).__bitcoinClosingPrices ?? []
    const slice = limit > 0 ? raw.slice(-limit - 1) : raw
    setPrices(slice)
    setLoading(false)
  }, [limit])

  useEffect(() => { load() }, [load])
  // window 메모리 폴링 (서버 요청 없음 — 로컬 배열만 읽음)
  useEffect(() => {
    const t = setInterval(load, 1000)
    return () => clearInterval(t)
  }, [load])

  // 끝자리 0~9 빈도 계산
  const digitCount: Record<number, number> = Object.fromEntries(
    Array.from({ length: 10 }, (_, i) => [i, 0])
  )
  prices.forEach((p) => {
    const d = Math.floor(Math.abs(p.price * 10)) % 10
    digitCount[d]++
  })
  const total = prices.length
  const maxCount = Math.max(...Object.values(digitCount), 1)

  // 연속 패턴 분석 (최근 20개)
  const recent = [...prices].slice(-20).map((p) => Math.floor(Math.abs(p.price * 10)) % 10)

  // 가장 많이 / 적게 나온 끝자리
  const sortedDigits = Array.from({ length: 10 }, (_, i) => ({ digit: i, count: digitCount[i] }))
    .sort((a, b) => b.count - a.count)

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-6 lg:ml-64">
        <Header
          title="끝자리 분석"
          description="마감가 소수점 첫째 자리(0~9) 출현 빈도를 분석합니다."
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

        <div className="mt-4 mb-2">
          <Badge variant="outline">총 {total}회 분석</Badge>
        </div>

        {/* 끝자리 분포 바 차트 */}
        <Card className="mt-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 className="w-4 h-4 text-primary" />
              끝자리 출현 빈도 (0~9)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-2 h-40">
              {Array.from({ length: 10 }, (_, d) => {
                const cnt = digitCount[d]
                const heightPct = total > 0 ? (cnt / maxCount) * 100 : 0
                const pct = total > 0 ? Math.round((cnt / total) * 100) : 0
                return (
                  <div key={d} className="flex-1 flex flex-col items-center gap-1">
                    <span className={`text-[10px] font-bold ${DIGIT_TEXT[d]}`}>{pct}%</span>
                    <div className="w-full flex flex-col justify-end" style={{ height: "100px" }}>
                      <div
                        className={`w-full rounded-t-md ${DIGIT_COLORS[d]} transition-all duration-500 opacity-80`}
                        style={{ height: `${heightPct}%`, minHeight: cnt > 0 ? "4px" : "0" }}
                      />
                    </div>
                    <span className="text-xs font-bold text-foreground">{d}</span>
                    <span className="text-[10px] text-muted-foreground">{cnt}회</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {/* 순위 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Hash className="w-4 h-4 text-primary" />
                끝자리 순위
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {sortedDigits.map((item, idx) => (
                  <div key={item.digit} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4">{idx + 1}</span>
                    <div className={`w-7 h-7 rounded-full ${DIGIT_COLORS[item.digit]} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                      {item.digit}
                    </div>
                    <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className={`h-full ${DIGIT_COLORS[item.digit]} transition-all duration-500`}
                        style={{ width: `${total > 0 ? (item.count / total) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold w-10 text-right">{item.count}회</span>
                    <span className="text-xs text-muted-foreground w-8 text-right">
                      {total > 0 ? Math.round((item.count / total) * 100) : 0}%
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* 최근 20개 연속 패턴 */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">최근 20개 끝자리 패턴</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {recent.length === 0 && (
                  <span className="text-sm text-muted-foreground">데이터 없음</span>
                )}
                {recent.map((d, i) => (
                  <div
                    key={i}
                    className={`w-9 h-9 rounded-full ${DIGIT_COLORS[d]} flex items-center justify-center text-white text-sm font-bold shadow`}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* 짝/홀 표시 */}
              <div className="mt-4 space-y-1">
                <div className="flex flex-wrap gap-1">
                  {recent.map((d, i) => (
                    <span
                      key={i}
                      className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                        d % 2 === 0
                          ? "bg-sky-500/20 text-sky-600"
                          : "bg-primary/20 text-primary"
                      }`}
                    >
                      {d % 2 === 0 ? "짝" : "홀"}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {recent.map((d, i) => (
                    <span
                      key={i}
                      className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                        d >= 5
                          ? "bg-primary/20 text-primary"
                          : "bg-amber-500/20 text-amber-600"
                      }`}
                    >
                      {d >= 5 ? "오버" : "언더"}
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
