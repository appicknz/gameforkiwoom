"use client"

import { useState, useEffect, useCallback } from "react"
import { ChevronLeft, ChevronRight, RefreshCw, Filter } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// ── 유틸 ─────────────────────────────────────────────────────────
function getToken(): string | null {
  try { return localStorage.getItem("app_token") } catch { return null }
}

function toKSTDateStr(d: Date) {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
}

function fmt(n: number) {
  return "₩" + n.toLocaleString("ko-KR")
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "2-digit", day: "2-digit",
  })
}

const SIDE_LABEL: Record<string, string> = {
  player: "플레이어", banker: "뱅커", tie: "타이",
  race_bit: "BIT", race_coin: "COIN", race_tie: "타이",
  long: "상승", short: "하락", over: "5이상", under: "4이하",
  odd: "홀수", even: "짝수",
}

const SIDE_COLOR: Record<string, string> = {
  player: "text-blue-500", banker: "text-red-500", tie: "text-amber-500",
  race_bit: "text-blue-500", race_coin: "text-orange-500", race_tie: "text-amber-500",
  long: "text-emerald-500", short: "text-red-400",
}

type GameType = "all" | "baccarat" | "race"

interface BetLog {
  id: string
  created_at: string
  side: string
  amount: number
  payout: number
  result: "win" | "lose"
}

interface PageData {
  logs: BetLog[]
  total: number
  page: number
  totalPages: number
}

// ── 캘린더 ─────────────────────────────────────────────────────────
function getMonthDays(year: number, month: number) {
  const m      = String(month + 1).padStart(2, "0")
  const nextY  = month === 11 ? year + 1 : year
  const nextM  = String(month === 11 ? 1 : month + 2).padStart(2, "0")
  const first  = new Date(`${year}-${m}-01T00:00:00+09:00`)
  const nextMo = new Date(`${nextY}-${nextM}-01T00:00:00+09:00`)
  const last   = new Date(nextMo.getTime() - 1000)
  return {
    firstDay:    first.getDay(),
    daysInMonth: parseInt(last.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }).slice(-2), 10),
  }
}

function MiniCalendar({
  selected, onSelect,
}: { selected: string | null; onSelect: (d: string | null) => void }) {
  const today = toKSTDateStr(new Date())
  const [viewYear,  setViewYear]  = useState(() => parseInt(today.slice(0, 4)))
  const [viewMonth, setViewMonth] = useState(() => parseInt(today.slice(5, 7)) - 1)

  const { firstDay, daysInMonth } = getMonthDays(viewYear, viewMonth)
  const blanks = Array(firstDay).fill(null)
  const days   = Array.from({ length: daysInMonth }, (_, i) => i + 1)
  const cells  = [...blanks, ...days]

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-2">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-foreground">
          {viewYear}년 {viewMonth + 1}월
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
              else setViewMonth(m => m - 1)
            }}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-3 h-3" />
          </button>
          <button
            onClick={() => {
              if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
              else setViewMonth(m => m + 1)
            }}
            className="w-5 h-5 flex items-center justify-center rounded hover:bg-secondary text-muted-foreground hover:text-foreground"
          >
            <ChevronRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 요일 */}
      <div className="grid grid-cols-7 text-center">
        {["일","월","화","수","목","금","토"].map((d, i) => (
          <div key={d} className="text-[9px] font-medium"
            style={{ color: i === 0 ? "#ef4444" : i === 6 ? "#4a9eff" : "var(--muted-foreground)" }}>
            {d}
          </div>
        ))}
      </div>

      {/* 날짜 */}
      <div className="grid grid-cols-7 gap-px">
        {cells.map((day, idx) => {
          if (!day) return <div key={`b-${idx}`} />
          const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
          const isToday = dateStr === today
          const isSel   = dateStr === selected
          return (
            <button
              key={dateStr}
              onClick={() => onSelect(isSel ? null : dateStr)}
              className={cn(
                "h-6 w-full rounded text-[10px] font-medium transition-colors",
                isSel  ? "bg-primary text-primary-foreground font-bold" :
                isToday ? "ring-1 ring-primary text-primary" :
                "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {day}
            </button>
          )
        })}
      </div>

      {selected && (
        <button
          onClick={() => onSelect(null)}
          className="w-full text-[10px] text-muted-foreground hover:text-foreground text-center py-0.5 rounded hover:bg-secondary transition-colors"
        >
          전체 보기
        </button>
      )}
    </div>
  )
}

// ── 메인 페이지 ─────────────────────────────────────────────────────
export default function BettingStatusPage() {
  const [gameType,  setGameType]  = useState<GameType>("all")
  const [date,      setDate]      = useState<string | null>(null)
  const [page,      setPage]      = useState(1)
  const [data,      setData]      = useState<PageData | null>(null)
  const [loading,   setLoading]   = useState(false)

  const fetchLogs = useCallback(async (p = 1) => {
    const token = getToken()
    if (!token) return
    setLoading(true)
    try {
      const params = new URLSearchParams({
        page:  String(p),
        limit: "10",
        ...(date     ? { date }               : {}),
        ...(gameType !== "all" ? { game_type: gameType } : {}),
      })
      const res = await fetch(`/api/user/round-bet-logs?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const json = await res.json()
        setData(json)
        setPage(p)
      }
    } finally {
      setLoading(false)
    }
  }, [date, gameType])

  useEffect(() => { fetchLogs(1) }, [fetchLogs])

  // 날짜/게임타입 변경 시 1페이지로 리셋
  const handleDateSelect = (d: string | null) => { setDate(d); setPage(1) }
  const handleGameType   = (g: GameType)      => { setGameType(g); setPage(1) }

  const totalAmount = data?.logs.reduce((s, l) => s + l.amount, 0) ?? 0
  const totalPayout = data?.logs.reduce((s, l) => s + l.payout, 0) ?? 0
  const totalFee    = Math.floor(totalAmount * 0.20)

  return (
    <div className="min-h-screen bg-background pt-14 pb-8">
      <div className="max-w-7xl mx-auto px-4 space-y-4">

        {/* 헤더 */}
        <div className="flex items-center justify-between pt-4">
          <div>
            <h1 className="text-lg font-bold text-foreground">배팅 현황</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {date ? `${date} 배팅 내역` : "전체 배팅 내역"} · 최대 10건 표시
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => fetchLogs(page)} disabled={loading} className="h-7 gap-1 text-xs">
            <RefreshCw className={cn("w-3 h-3", loading && "animate-spin")} />
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-4 items-start">

          {/* 좌: 캘린더 + 게임 타입 필터 */}
          <div className="space-y-3">
            <MiniCalendar selected={date} onSelect={handleDateSelect} />

            {/* 게임 타입 필터 */}
            <div className="rounded-xl border border-border bg-card p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 mb-2">
                <Filter className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">게임 유형</span>
              </div>
              {(["all", "baccarat", "race"] as GameType[]).map(g => (
                <button
                  key={g}
                  onClick={() => handleGameType(g)}
                  className={cn(
                    "w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    gameType === g
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  {g === "all" ? "전체" : g === "baccarat" ? "바카라" : "레이스"}
                </button>
              ))}
            </div>

            {/* 요약 */}
            {data && data.logs.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-3 space-y-2">
                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">현재 페이지 합계</p>
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">배팅</span>
                    <span className="font-bold text-foreground tabular-nums">{fmt(totalAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">정산</span>
                    <span className={cn("font-bold tabular-nums", totalPayout >= totalAmount ? "text-emerald-500" : "text-red-400")}>
                      {fmt(totalPayout)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">수수료</span>
                    <span className="font-bold text-amber-500 tabular-nums">{fmt(totalFee)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 우: 배팅 목록 */}
          <div className="space-y-2">
            {loading ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center">
                <p className="text-xs text-muted-foreground">불러오는 중...</p>
              </div>
            ) : !data || data.logs.length === 0 ? (
              <div className="rounded-xl border border-border bg-card p-8 text-center">
                <p className="text-xs text-muted-foreground">
                  {date ? `${date}에 배팅 기록이 없습니다` : "배팅 기록이 없습니다"}
                </p>
              </div>
            ) : (
              <>
                {data.logs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-xl border border-border bg-card px-4 py-3 flex items-center gap-3"
                  >
                    {/* 시간 */}
                    <div className="shrink-0 text-right">
                      <p className="text-[9px] text-muted-foreground">{fmtDate(log.created_at)}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">{fmtTime(log.created_at)}</p>
                    </div>

                    {/* 구분선 */}
                    <div className="w-px h-8 bg-border shrink-0" />

                    {/* 사이드 */}
                    <div className="shrink-0 min-w-[52px]">
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted",
                        SIDE_COLOR[log.side] ?? "text-foreground"
                      )}>
                        {SIDE_LABEL[log.side] ?? log.side}
                      </span>
                    </div>

                    {/* 금액 정보 */}
                    <div className="flex-1 flex items-center justify-between gap-2 min-w-0">
                      <div>
                        <p className="text-[9px] text-muted-foreground">배팅</p>
                        <p className="text-xs font-bold text-foreground tabular-nums">{fmt(log.amount)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[9px] text-muted-foreground">정산</p>
                        <p className={cn(
                          "text-xs font-bold tabular-nums",
                          log.result === "win" ? "text-emerald-500" : "text-muted-foreground"
                        )}>
                          {log.payout > 0 ? fmt(log.payout) : "-"}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <span className={cn(
                          "text-[9px] font-semibold px-2 py-0.5 rounded-full",
                          log.result === "win"
                            ? "bg-emerald-500/15 text-emerald-500"
                            : "bg-red-500/10 text-red-400"
                        )}>
                          {log.result === "win" ? "WIN" : "LOSE"}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}

                {/* 페이징 */}
                {data.totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <Button
                      variant="outline" size="sm"
                      onClick={() => fetchLogs(page - 1)}
                      disabled={page <= 1 || loading}
                      className="h-7 w-7 p-0"
                    >
                      <ChevronLeft className="w-3 h-3" />
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {page} / {data.totalPages}
                    </span>
                    <Button
                      variant="outline" size="sm"
                      onClick={() => fetchLogs(page + 1)}
                      disabled={page >= data.totalPages || loading}
                      className="h-7 w-7 p-0"
                    >
                      <ChevronRight className="w-3 h-3" />
                    </Button>
                  </div>
                )}

                <p className="text-[10px] text-muted-foreground text-center">
                  전체 {data.total.toLocaleString()}건 · 페이��당 10건
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
