"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { RefreshCw, Trophy, Medal, Award, TrendingUp, TrendingDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

function getToken(): string | null {
  try { return localStorage.getItem("app_token") } catch { return null }
}

function fmt(n: number) {
  const sign = n > 0 ? "+" : ""
  return sign + "₩" + Math.round(n).toLocaleString("ko-KR")
}

// KST 기준 오늘 날짜 (로컬 자정 Date — .getDate()/.getMonth() 안전)
function kstToday(): Date {
  const kstStr = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
  const [y, m, d] = kstStr.split("-").map(Number)
  return new Date(y, m - 1, d)
}

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

interface RankingRow {
  rank: number
  userId: string
  username: string
  gamePnl: number
  gameCount: number
  tradingPnl: number
  tradingCount: number
  totalPnl: number
  isMe: boolean
}

interface RankingData {
  ranking: RankingRow[]
  myRank: number | null
}

function maskUsername(name: string) {
  if (name.length <= 2) return name[0] + "*"
  return name.slice(0, 1) + "*".repeat(name.length - 2) + name.slice(-1)
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Trophy className="w-5 h-5 text-amber-400" aria-label="1위" />
  if (rank === 2) return <Medal className="w-5 h-5 text-slate-300" aria-label="2위" />
  if (rank === 3) return <Award className="w-5 h-5 text-orange-400" aria-label="3위" />
  return <span className="text-sm font-semibold text-muted-foreground tabular-nums">{rank}</span>
}

// ── 날짜별 랭킹 기록 스트립 ──────────────────────────────────────────
function RankingDateStrip({
  selected, onSelect,
}: { selected: string | null; onSelect: (d: string | null) => void }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const today = kstToday()
  const todayStr = toDateStr(today)

  const DAYS_BACK = 29
  const days: Date[] = []
  for (let i = DAYS_BACK; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    days.push(d)
  }
  const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"]

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    el.scrollLeft = el.scrollWidth
  }, [])

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <div ref={scrollRef} className="flex overflow-x-auto" style={{ scrollbarWidth: "none" }}>
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            "flex flex-col items-center justify-center gap-1.5 shrink-0 w-14 py-2.5 border-r border-border transition-colors",
            selected === null ? "bg-primary/10" : "hover:bg-secondary",
          )}
        >
          <span className="text-[9px] font-medium text-muted-foreground">누적</span>
          <span
            className={cn(
              "w-7 h-7 flex items-center justify-center rounded-full text-[10px] font-bold border-2",
              selected === null ? "border-primary text-primary" : "border-transparent text-muted-foreground",
            )}
          >
            전체
          </span>
        </button>
        {days.map((d) => {
          const dateStr = toDateStr(d)
          const isToday = dateStr === todayStr
          const isSel = dateStr === selected
          const isSun = d.getDay() === 0
          const isSat = d.getDay() === 6
          const dayColor = isSat ? "text-blue-400" : isSun ? "text-red-400" : "text-muted-foreground"
          return (
            <button
              key={dateStr}
              type="button"
              onClick={() => onSelect(dateStr)}
              className="flex flex-col items-center gap-1.5 shrink-0 w-12 py-2.5"
            >
              <span className={cn("text-[9px] font-medium", dayColor)}>{DAY_KO[d.getDay()]}</span>
              <span
                className={cn(
                  "w-7 h-7 flex items-center justify-center rounded-full text-xs font-bold border-2 transition-colors",
                  isToday
                    ? "border-emerald-500 text-foreground"
                    : isSel
                      ? "border-primary/60 bg-primary/10 text-foreground"
                      : "border-transparent text-muted-foreground",
                )}
              >
                {d.getDate()}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function RankingPage() {
  const [data, setData] = useState<RankingData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loggedIn, setLoggedIn] = useState(true)
  const [selectedDate, setSelectedDate] = useState<string | null>(() => toDateStr(kstToday()))

  const fetchRanking = useCallback(async (date: string | null) => {
    const token = getToken()
    if (!token) { setLoggedIn(false); return }
    setLoading(true)
    setError(null)
    try {
      const params = date ? `?date=${date}` : ""
      const res = await fetch(`/api/ranking${params}`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) {
        setData(await res.json())
      } else {
        const j = await res.json().catch(() => null)
        setError(j?.error ?? "랭킹을 불러오지 못했습니다.")
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchRanking(selectedDate) }, [fetchRanking, selectedDate])

  const top3 = data?.ranking.slice(0, 3) ?? []
  const rest = data?.ranking.slice(3) ?? []

  return (
    <div className="min-h-screen bg-background pt-14 pb-8">
      <div className="max-w-7xl mx-auto px-4 space-y-4">

        {/* 헤더 */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-lg font-bold text-foreground">랭킹</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              바카라 · 레이스 · 트레이딩 통합 손익 순위 · {selectedDate ? `${selectedDate} 기록` : "전체 누적"}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchRanking(selectedDate)}
            disabled={loading}
            className="h-7 gap-1 text-xs"
          >
            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
          </Button>
        </div>

        {/* 날짜별 랭킹 기록 */}
        <RankingDateStrip selected={selectedDate} onSelect={setSelectedDate} />

        {!loggedIn && (
          <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            로그인 후 랭킹을 확인할 수 있습니다.
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {!error && data && data.ranking.length === 0 && (
          <div className="rounded-xl border border-border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
            {selectedDate ? `${selectedDate}에 집계된 랭킹 데이터가 없습니다.` : "아직 집계된 랭킹 데이터가 없습니다."}
          </div>
        )}

        {/* 내 순위 */}
        {data?.myRank && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">내 순위</span>
            <span className="text-sm font-bold text-primary">{data.myRank}위</span>
          </div>
        )}

        {/* TOP 3 */}
        {top3.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            {top3.map((row) => (
              <div
                key={row.userId}
                className={cn(
                  "rounded-xl border bg-card p-3 flex flex-col items-center gap-1.5 text-center",
                  row.isMe ? "border-primary/50 ring-1 ring-primary/30" : "border-border",
                )}
              >
                <RankBadge rank={row.rank} />
                <span className="text-xs font-semibold text-foreground truncate w-full">
                  {row.isMe ? row.username : maskUsername(row.username)}
                </span>
                <span
                  className={cn(
                    "text-xs font-bold tabular-nums",
                    row.totalPnl >= 0 ? "text-emerald-500" : "text-red-500",
                  )}
                >
                  {fmt(row.totalPnl)}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 4위 이하 */}
        {rest.length > 0 && (
          <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
            {rest.map((row) => (
              <div
                key={row.userId}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5",
                  row.isMe && "bg-primary/5",
                )}
              >
                <div className="w-6 flex items-center justify-center shrink-0">
                  <RankBadge rank={row.rank} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {row.isMe ? row.username : maskUsername(row.username)}
                    {row.isMe && <span className="ml-1.5 text-[10px] text-primary font-normal">나</span>}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    게임 {row.gameCount}건 · 트레이딩 {row.tradingCount}건
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p
                    className={cn(
                      "text-sm font-bold tabular-nums flex items-center justify-end gap-1",
                      row.totalPnl >= 0 ? "text-emerald-500" : "text-red-500",
                    )}
                  >
                    {row.totalPnl >= 0
                      ? <TrendingUp className="w-3 h-3" />
                      : <TrendingDown className="w-3 h-3" />}
                    {fmt(row.totalPnl)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
