"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { RefreshCw, TrendingUp, TrendingDown } from "lucide-react"

interface RoundStats {
  round: string
  gameType: "baccarat" | "race"
  timestamp: string
  pools: Record<string, number>
  userCount: number
  totalBet: number
  lpAmount: number
  mode: "lp-dominant" | "hybrid" | "pari"
  prediction: Record<string, number>
}

export function RoundMonitor() {
  const [gameType, setGameType] = useState<"baccarat" | "race">("baccarat")
  const [stats, setStats] = useState<RoundStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [totalStats, setTotalStats] = useState({
    totalRounds: 0,
    totalBet: 0,
    totalProfit: 0,
  })

  const getToken = () => {
    try {
      return localStorage.getItem("sb-token")
    } catch {
      return null
    }
  }

  const loadStats = async () => {
    setLoading(true)
    const token = getToken()
    if (!token) return

    try {
      const res = await fetch(`/api/admin/round-stats?type=${gameType}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (error) {
      console.error("[round-monitor] Load error:", error)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadStats()
    const iv = setInterval(loadStats, 2000) // 2초 주기 갱신
    return () => clearInterval(iv)
  }, [gameType])

  if (!stats) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        데이터 로딩 중...
      </div>
    )
  }

  const isBaccarat = gameType === "baccarat"
  const sides = isBaccarat
    ? [
        { key: "player", label: "플레이어", color: "text-blue-500" },
        { key: "banker", label: "뱅커", color: "text-red-500" },
        { key: "tie", label: "타이", color: "text-amber-500" },
      ]
    : [
        { key: "bit", label: "BIT팀", color: "text-blue-500" },
        { key: "coin", label: "COIN팀", color: "text-red-500" },
        { key: "tie", label: "TIE", color: "text-amber-500" },
      ]

  return (
    <div className="space-y-5">
      {/* 게임 선택 탭 */}
      <div className="flex gap-2">
        {(["baccarat", "race"] as const).map((type) => (
          <button
            key={type}
            onClick={() => setGameType(type)}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all ${
              gameType === type
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {type === "baccarat" ? "바카라" : "레이스"}
          </button>
        ))}
        <Button
          variant="outline"
          size="sm"
          onClick={loadStats}
          disabled={loading}
          className="gap-1.5 ml-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>

      {/* 라운드 기본 정보 */}
      <Card className="p-5 bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-xs text-muted-foreground">현재 라운드</p>
            <p className="text-2xl font-bold text-foreground">#{stats.round}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">모드</p>
            <p className={`text-lg font-semibold ${
              stats.mode === "pari" ? "text-emerald-500" : 
              stats.mode === "hybrid" ? "text-amber-500" : 
              "text-blue-500"
            }`}>
              {stats.mode === "pari" ? "파리뮤추얼" : 
               stats.mode === "hybrid" ? "하이브리드" : 
               "LP 주도"}
            </p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-3 text-sm">
          <div className="bg-background rounded-lg p-3">
            <p className="text-muted-foreground text-xs">참여 유저</p>
            <p className="font-bold text-lg text-foreground mt-1">{stats.userCount}</p>
          </div>
          <div className="bg-background rounded-lg p-3">
            <p className="text-muted-foreground text-xs">총 배팅액</p>
            <p className="font-bold text-lg text-foreground tabular-nums mt-1">
              ₩{stats.totalBet.toLocaleString()}
            </p>
          </div>
          <div className="bg-background rounded-lg p-3">
            <p className="text-muted-foreground text-xs">시스템 LP</p>
            <p className="font-bold text-lg text-blue-500 tabular-nums mt-1">
              ₩{stats.lpAmount.toLocaleString()}
            </p>
          </div>
          <div className="bg-background rounded-lg p-3">
            <p className="text-muted-foreground text-xs">시간</p>
            <p className="font-bold text-lg text-foreground tabular-nums mt-1">
              {new Date(stats.timestamp).toLocaleTimeString("ko-KR", { second: "2-digit" })}
            </p>
          </div>
        </div>
      </Card>

      {/* 배팅 사이드별 현황 */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">배팅 방향별 집계</h3>
        <div className="space-y-3">
          {sides.map(({ key, label, color }) => {
            const bet = (stats.pools as Record<string, number>)[key] || 0
            const profit = (stats.prediction as Record<string, number>)[`${key}Profit`] || 0
            const percentage = stats.totalBet > 0 ? ((bet / stats.totalBet) * 100).toFixed(1) : "0.0"
            return (
              <div key={key} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-foreground">{label}</span>
                    <span className={`text-xs font-bold ${color}`}>{percentage}%</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>배팅: ₩{bet.toLocaleString()}</span>
                    <span className={profit >= 0 ? "text-emerald-500" : "text-red-500"}>
                      {profit >= 0 ? "+" : "-"}₩{Math.abs(profit).toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="w-24 h-6 bg-background rounded-full overflow-hidden">
                    <div
                      className={`h-full flex items-center justify-end pr-2 transition-all ${
                        profit >= 0 ? "bg-emerald-500/20" : "bg-red-500/20"
                      }`}
                      style={{ width: `${Math.min(100, (bet / (stats.totalBet / 100)) || 0)}%` }}
                    >
                      {bet > 0 && <span className="text-xs font-bold">{percentage}%</span>}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* 예상 손익 요약 */}
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4" /> 예상 손익 시나리오
        </h3>
        <div className="bg-background rounded-lg p-4 space-y-2 text-sm">
          <p className="text-muted-foreground">
            각 사이드별 우승 시 시스템의 손익:
          </p>
          <div className="grid grid-cols-3 gap-2">
            {sides.map(({ key, label }) => {
              const profit = (stats.prediction as Record<string, number>)[`${key}Profit`] || 0
              return (
                <div key={key} className="bg-muted rounded p-2 text-center">
                  <p className="text-xs text-muted-foreground mb-1">{label} 우승 시</p>
                  <p className={`font-bold tabular-nums ${profit >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {profit >= 0 ? "+" : "-"}₩{Math.abs(profit).toLocaleString()}
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      {/* 참고: 이 모니터는 예상치이며, 실제 결과는 다를 수 있음 */}
      <p className="text-xs text-muted-foreground bg-muted rounded-lg p-3">
        ℹ️ <strong>참고:</strong> 표시되는 손익은 현재 배팅 기준 예상치입니다. LP 배치, 파리뮤추얼 수수료, 배당 조정에 따라 실제 결과는 상이할 수 있습니다.
      </p>
    </div>
  )
}
