"use client"

import { useState, useEffect, useCallback } from "react"
import { Sidebar } from "@/components/dashboard/sidebar"
import { Header } from "@/components/dashboard/header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { RefreshCw, Layers } from "lucide-react"

// ── 타입 ──────────────────────────────────────────────────────────────────────
type Result = "player" | "banker" | "tie"

interface RoundRow {
  result: Result
  digit: number
  ended_at: string
}

interface Stats {
  total: number
  player: number
  banker: number
  tie: number
  playerPct: number
  bankerPct: number
  tiePct: number
}

// ── BigRoad 로직 ──────────────────────────────────────────────────────────────
const CELL = 22
const GAP  = 2
const MAX_ROWS = 6

interface Cell { result: Result; col: number; row: number; isTie: boolean }

function buildBigRoad(history: Result[]): Cell[] {
  const cells: Cell[] = []
  let col = -1
  let row = 0
  let lastNonTie: Result | null = null

  for (const result of history) {
    if (result === "tie") {
      if (cells.length > 0) {
        const last = cells[cells.length - 1]
        cells.push({ result: "tie", col: last.col, row: last.row, isTie: true })
      }
      continue
    }
    if (result !== lastNonTie) {
      col++
      row = 0
      lastNonTie = result
    } else {
      row++
      if (row >= MAX_ROWS) {
        col++
        row = 0
      }
    }
    cells.push({ result, col, row, isTie: false })
  }
  return cells
}

// ── 구간 필터 옵션 ─────────────────────────────────────────────────────────────
const LIMIT_OPTIONS = [
  { label: "최근 20개", value: 20 },
  { label: "최근 50개", value: 50 },
  { label: "최근 100개", value: 100 },
  { label: "전체", value: 0 },
]

// ── 오늘 날짜 헬퍼 ─────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

// ── BigRoad 컴포넌트 ───────────────────────────────────────────────────────────
function BigRoadGrid({ history }: { history: Result[] }) {
  const cells = buildBigRoad(history)
  const maxCol    = cells.length > 0 ? Math.max(...cells.map(c => c.col)) : 0
  const totalCols = Math.max(maxCol + 1, 14)
  const width  = totalCols * (CELL + GAP)
  const height = MAX_ROWS  * (CELL + GAP)

  return (
    <div style={{ overflowX: "auto", borderRadius: 8, border: "1px solid rgba(212,175,55,0.12)", background: "rgba(0,0,0,0.25)", padding: 4 }}>
      <div style={{ position: "relative", width, height, flexShrink: 0 }}>
        {Array.from({ length: MAX_ROWS }).map((_, r) =>
          Array.from({ length: totalCols }).map((_, c) => (
            <div key={`g-${r}-${c}`} style={{
              position: "absolute",
              left: c * (CELL + GAP), top: r * (CELL + GAP),
              width: CELL, height: CELL,
              border: "1px solid rgba(212,175,55,0.06)", borderRadius: 3,
            }} />
          ))
        )}
        {cells.map((cell, i) => {
          const color = cell.result === "banker" ? "#ef4444" : "#3b82f6"
          return (
            <div key={i} style={{
              position: "absolute",
              left: cell.col * (CELL + GAP), top: cell.row * (CELL + GAP),
              width: CELL, height: CELL,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              {cell.isTie ? (
                <div style={{ position: "relative", width: CELL - 4, height: CELL - 4 }}>
                  <div style={{
                    position: "absolute", inset: 0,
                    borderRadius: "50%", border: `2px solid ${color}`,
                  }} />
                  <div style={{
                    position: "absolute", inset: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <div style={{
                      width: "100%", height: "2px",
                      background: "#22c55e",
                      transform: "rotate(-45deg)",
                    }} />
                  </div>
                </div>
              ) : (
                <div style={{
                  width: CELL - 4, height: CELL - 4,
                  borderRadius: "50%",
                  border: `2px solid ${color}`,
                  background: "transparent",
                }} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── 메인 페이지 ────────────────────────────────────────────────────────────────
export default function BaccaratStatsPage() {
  const [road,    setRoad]    = useState<Result[]>([])
  const [rows,    setRows]    = useState<RoundRow[]>([])
  const [stats,   setStats]   = useState<Stats | null>(null)
  const [limit,   setLimit]   = useState(50)
  const [date,    setDate]    = useState("")        // "" = 날짜 필터 없음
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (limit > 0) params.set("limit", String(limit))
      if (date)      params.set("date", date)
      const res  = await fetch(`/api/baccarat/road?${params}`)
      const data = await res.json()
      setRoad(data.road  ?? [])
      setRows(data.rows  ?? [])
      setStats(data.stats ?? null)
    } finally {
      setLoading(false)
    }
  }, [limit, date])

  useEffect(() => { load() }, [load])

  // 30초마다 자동 갱신
  useEffect(() => {
    const t = setInterval(load, 30_000)
    return () => clearInterval(t)
  }, [load])

  const G = {
    gold: "#d4af37",
    goldDim: "rgba(212,175,55,0.5)",
    goldBorder: "rgba(212,175,55,0.2)",
    player: "#3b82f6",
    banker: "#ef4444",
    tie: "#22c55e",
  }

  const resultLabel = (r: Result) =>
    r === "player" ? "플레이어" : r === "banker" ? "뱅커" : "타이"
  const resultColor = (r: Result) =>
    r === "player" ? G.player : r === "banker" ? G.banker : G.tie

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 p-4 lg:p-6 lg:ml-64">
        <Header
          title="바카라 통계"
          description="BIG ROAD · P/B/T 비율 · 라운드 내역을 확인합니다."
          actions={
            <Button variant="outline" size="sm" onClick={load} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
          }
        />

        {/* 필터 영역 */}
        <div className="flex flex-wrap gap-3 mt-4 items-center">
          {/* 구간 필터 */}
          <div className="flex gap-2 flex-wrap">
            {LIMIT_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                size="sm"
                variant={limit === opt.value && !date ? "default" : "outline"}
                onClick={() => { setLimit(opt.value); setDate("") }}
              >
                {opt.label}
              </Button>
            ))}
          </div>

          {/* 날짜 필터 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">날짜</span>
            <input
              type="date"
              value={date}
              max={todayStr()}
              onChange={(e) => { setDate(e.target.value); setLimit(0) }}
              className="text-xs border border-border rounded-md px-2 py-1 bg-background text-foreground"
            />
            {date && (
              <Button size="sm" variant="ghost" onClick={() => { setDate(""); setLimit(50) }}>
                초기화
              </Button>
            )}
          </div>
        </div>

        <div className="mt-3 mb-2">
          <Badge variant="outline">총 {stats?.total ?? 0}라운드</Badge>
        </div>

        {/* P / B / T 비율 카드 */}
        {stats && (
          <div className="grid grid-cols-3 gap-3 mt-3">
            {(["player", "banker", "tie"] as Result[]).map((r) => {
              const cnt = stats[r]
              const pct = stats[`${r}Pct` as keyof Stats] as number
              const color = resultColor(r)
              return (
                <Card key={r}>
                  <CardContent className="pt-4 pb-3 text-center">
                    <div style={{ fontSize: 22, fontWeight: 800, color }}>{pct}%</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{resultLabel(r)}</div>
                    <div className="text-xs font-semibold mt-1">{cnt}회</div>
                    {/* 비율 바 */}
                    <div className="mt-2 h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* BIG ROAD */}
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Layers className="w-4 h-4 text-primary" />
              BIG ROAD
              <div className="flex gap-3 ml-2">
                {[["P", G.player], ["B", G.banker], ["T", G.tie]].map(([l, c]) => (
                  <span key={l} className="flex items-center gap-1" style={{ fontSize: 11 }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", border: `1.5px solid ${c}`, display: "inline-block" }} />
                    <span style={{ color: c as string, fontWeight: 700 }}>{l}</span>
                  </span>
                ))}
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {road.length === 0 ? (
              <div className="text-center text-muted-foreground py-8 text-sm">
                {loading ? "불러오는 중..." : "아직 기록된 라운드가 없습니다"}
              </div>
            ) : (
              <BigRoadGrid history={road} />
            )}
          </CardContent>
        </Card>

        {/* 라운드 내역 */}
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">라운드 내역</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
              {[...rows].reverse().map((row, i) => {
                const color = resultColor(row.result)
                const label = resultLabel(row.result)
                const time  = new Date(row.ended_at).toLocaleString("ko-KR", {
                  month: "2-digit", day: "2-digit",
                  hour: "2-digit", minute: "2-digit", second: "2-digit",
                })
                return (
                  <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded-lg hover:bg-secondary/50 transition-colors text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-xs w-32 shrink-0">{time}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 800,
                        color,
                        border: `1px solid ${color}44`,
                        background: `${color}14`,
                        padding: "1px 8px", borderRadius: 4,
                      }}>
                        {label.toUpperCase()}
                      </span>
                    </div>
                    <Badge variant="outline" className="text-[10px] px-1.5">
                      끝자리 {row.digit}
                    </Badge>
                  </div>
                )
              })}
              {rows.length === 0 && (
                <div className="text-center text-muted-foreground py-8 text-sm">
                  {loading ? "불러오는 중..." : "데이터가 없습니다"}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
