"use client"

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import useSWR from "swr"
import { ArrowDownRight, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Database, RefreshCw, Search } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"
import { useFuturesMiniTickers, type FuturesTickerConnection } from "@/hooks/use-futures-mini-tickers"

const fetcher = (url: string) => fetch(url).then(async (response) => {
  if (!response.ok) throw new Error("데이터를 불러오지 못했습니다.")
  return response.json()
})

const horizons = [5, 15, 30, 60, 240]
const LEVERAGE = 10
const chartConfig = {
  winRate: { label: "승률", color: "var(--chart-2)" },
  averageReturn: { label: "평균 수익률", color: "var(--chart-1)" },
} satisfies ChartConfig

type Outcome = {
  exitPrice: number | null
  priceReturnPercent: number | null
  directionalReturnPercent: number | null
  result: "win" | "loss" | "flat" | null
  status: "pending" | "complete" | "unavailable"
}

type Prediction = {
  predictedAt: string
  trainingCutoffAt: string
  modelVersion: string
  expectedWinRate: number
  expectedDirectionalReturnPercent: number
  confidenceLevel: "insufficient" | "low" | "medium" | "high"
  confidenceScore: number
  effectiveSampleSize: number
}

type Entry = {
  id: string
  signalTime: string
  symbol: string
  signalType: string
  direction: "long" | "short"
  entryPrice: number
  duplicateGroupKey: string
  duplicateIndex: number
  duplicateLabel: string
  processingStatus: string | null
  cci: number | null
  cciSignal: string | null
  confluence: string | null
  volumeRatio24h: number | null
  fireCount: number | null
  signalState: string | null
  signalGrade: string | null
  tradeGuide: string | null
  riskFlags: string[]
  bollinger: { position: string | null; trend: string | null; expansion: boolean | null; squeeze: boolean | null; width: number | null }
  outcomes: Record<string, Outcome>
  predictions: Record<string, Prediction>
}

type Breakdown = { label: string; samples: number; winRate: number; averageReturn: number | null; medianReturn: number | null }
type Summary = {
  total: number
  autoPositionTotal: number
  linkedPositionTotal: number
  missingStatisticsTotal: number
  complete: number
  completionRate: number
  wins: number
  losses: number
  flats: number
  winRate: number
  averageReturn: number | null
  medianReturn: number | null
  oldestSignalAt: string | null
  newestSignalAt: string | null
  lastCalculatedAt: string | null
  averageVolumeRatio: number | null
  medianVolumeRatio: number | null
  enrichedTotal: number
  fireDistribution: Breakdown[]
  stateBreakdown: Breakdown[]
  gradeBreakdown: Breakdown[]
  guideBreakdown: Breakdown[]
  breakdowns: { cci: Breakdown[]; bollinger: Breakdown[]; confluence: Breakdown[]; signalType: Breakdown[] }
}

type EntriesResponse = { entries: Entry[]; total: number; page: number; pageSize: number }
type Validation = {
  todaySamples: number
  totalSamples: number
  todayEvaluatedSamples: number
  evaluatedSamples: number
  accuracy: number | null
  flatRate: number | null
  brierScore: number | null
  averagePredictedReturn: number | null
  averageActualReturn: number | null
  modelVersion: string
  calibration: Array<{ label: string; samples: number; predictedWinRate: number | null; actualWinRate: number | null }>
}

const numberFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 8 })
const kstTime = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
const liveTime = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false })
const connectionLabels: Record<FuturesTickerConnection, string> = {
  idle: "시세 대기",
  connecting: "시세 연결 중",
  live: "실시간 시세",
  reconnecting: "시세 재연결 중",
  offline: "네트워크 오프라인",
}
type CciSort = "none" | "asc" | "desc"
type OutcomeSort = "asc" | "desc"

function guideLines(guide: string | null) {
  const value = guide ?? "데이터 부족"
  const words = value.split(" ")
  return words.length > 1 ? [words.slice(0, -1).join(" "), words.at(-1)!] : [value]
}

type TableFilterMenuProps = {
  label: string
  active?: boolean
  children: ReactNode
}

function TableFilterMenu({ label, active, children }: TableFilterMenuProps) {
  return <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className={cn("inline-flex items-center gap-1 rounded px-1.5 py-1 font-medium transition-colors hover:bg-muted hover:text-foreground", active && "bg-primary/10 text-primary")} aria-label={`${label} 필터`}>{label}<span aria-hidden="true" className="text-[10px]">▾</span></button></DropdownMenuTrigger><DropdownMenuContent align="start">{children}</DropdownMenuContent></DropdownMenu>
}

function OutcomeSortButton({ label, direction, onClick }: { label: string; direction?: OutcomeSort; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={cn("inline-flex items-center gap-1 rounded px-1.5 py-1 font-medium transition-colors hover:bg-muted hover:text-foreground", direction && "bg-primary/10 text-primary")} aria-label={`${label} 수익률 정렬`}>{label}<span aria-hidden="true" className="text-[11px]">{direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕"}</span></button>
}

const confidenceLabels: Record<Prediction["confidenceLevel"], string> = {
  insufficient: "데이터 부족",
  low: "낮음",
  medium: "보통",
  high: "높음",
}
const weekdays = ["일", "월", "화", "수", "목", "금", "토"]
const KST_OFFSET = 9 * 60 * 60 * 1000

function kstDateString(date = new Date()) {
  return new Date(date.getTime() + KST_OFFSET).toISOString().slice(0, 10)
}

function dateFromKey(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`)
}

function shiftDateKey(dateKey: string, days: number) {
  const date = dateFromKey(dateKey)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function formatSelectedDate(dateKey: string) {
  const date = dateFromKey(dateKey)
  return `${date.getUTCFullYear()}년 ${date.getUTCMonth() + 1}월 ${date.getUTCDate()}일 (${weekdays[date.getUTCDay()]})`
}

function Percent({ value, signed = true }: { value: number | null | undefined; signed?: boolean }) {
  if (value == null) return <span className="text-muted-foreground">—</span>
  return <span className={cn("font-[inherit] tabular-nums", value > 0 && "text-primary", value < 0 && "text-destructive")}>{signed && value > 0 ? "+" : ""}{value.toFixed(2)}%</span>
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="border-b border-border py-5 lg:border-r lg:border-b-0 lg:px-6 first:lg:pl-0 last:lg:border-r-0">
      <p className="text-xs font-medium tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 font-[inherit] text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  )
}

function BreakdownChart({ title, data }: { title: string; data: Breakdown[] }) {
  const visible = data.slice(0, 7).map((item) => ({ ...item, displayLabel: `${item.label} (n=${item.samples})` }))
  const totalSamples = data.reduce((total, item) => total + item.samples, 0)
  return (
    <section className="border-t border-border pt-5">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title} <span className="font-[inherit] text-muted-foreground">(총 {totalSamples.toLocaleString()}개)</span></h2>
          <p className="mt-1 text-xs text-muted-foreground">실제 완료 표본 기준 · 괄호 안은 그룹별 표본 수 · 막대는 승률</p>
        </div>
        <span className="font-[inherit] text-xs text-muted-foreground">표본 ≥ 1</span>
      </div>
      {visible.length ? (
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <BarChart data={visible} margin={{ left: -20, right: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="displayLabel" tickLine={false} axisLine={false} tickMargin={10} interval={0} tick={{ fontSize: 11 }} tickFormatter={(value) => String(value).slice(0, 18)} />
            <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tickFormatter={(value) => `${value}%`} />
            <ChartTooltip content={<ChartTooltipContent formatter={(value, name, item) => (
              <div className="flex min-w-36 items-center justify-between gap-4"><span>{String(name)}</span><span className="font-[inherit]">{Number(value).toFixed(1)}% · n={item.payload.samples}</span></div>
            )} />} />
            <Bar dataKey="winRate" fill="var(--color-winRate)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ChartContainer>
      ) : <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">완료된 실제 표본이 아직 없습니다.</div>}
    </section>
  )
}

export function SignalStatisticsDashboard() {
  const today = useMemo(() => kstDateString(), [])
  const [selectedDate, setSelectedDate] = useState(today)
  const [horizon, setHorizon] = useState(5)
  const [search, setSearch] = useState("")
  const [direction, setDirection] = useState("all")
  const [duplicates, setDuplicates] = useState("all")
  const [cciSort, setCciSort] = useState<CciSort>("none")
  const [bbFilter, setBbFilter] = useState("all")
  const [outcomeSorts, setOutcomeSorts] = useState<Record<string, OutcomeSort>>({})
  const [realtimeSort, setRealtimeSort] = useState<OutcomeSort | undefined>(undefined)
  const dateStripRef = useRef<HTMLDivElement>(null)
  const availableDates = useMemo(() => Array.from({ length: 30 }, (_, index) => shiftDateKey(today, index - 29)), [today])

  useEffect(() => {
    dateStripRef.current?.querySelector<HTMLElement>(`[data-date="${selectedDate}"]`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })
  }, [selectedDate])

  const query = useMemo(() => {
    const params = new URLSearchParams({ horizon: String(horizon), pageSize: "1000", duplicates, from: selectedDate, to: selectedDate })
    if (search.trim()) params.set("q", search.trim())
    if (direction !== "all") params.set("direction", direction)
    return params.toString()
  }, [horizon, search, direction, duplicates, selectedDate])
  const summaryQuery = useMemo(() => {
    const params = new URLSearchParams({ horizon: String(horizon), duplicates, from: selectedDate, to: selectedDate })
    if (search.trim()) params.set("q", search.trim())
    if (direction !== "all") params.set("direction", direction)
    return params.toString()
  }, [horizon, search, direction, duplicates, selectedDate])

  const { data: entriesData, error: entriesError, isLoading: entriesLoading, mutate: mutateEntries } = useSWR<EntriesResponse>(`/api/signal-statistics/entries?${query}`, fetcher, { refreshInterval: 30_000 })
  const { data: summary, error: summaryError, isLoading: summaryLoading, mutate: mutateSummary } = useSWR<Summary>(`/api/signal-statistics/summary?${summaryQuery}`, fetcher, { refreshInterval: 30_000 })
  const { data: validation, mutate: mutateValidation } = useSWR<Validation>(`/api/signal-statistics/validation?horizon=${horizon}`, fetcher, { refreshInterval: 30_000 })
  const entries = entriesData?.entries ?? []
  const visibleEntries = useMemo(() => {
    const filtered = entries.filter((entry) => {
      const bbValue = [entry.bollinger.position, entry.bollinger.trend].filter(Boolean).join(" · ") || "none"
      const result = entry.outcomes[String(horizon)]?.result ?? "pending"
      return (bbFilter === "all" || bbValue === bbFilter)
    })
    const sorted = cciSort === "none" ? [...filtered] : [...filtered].sort((a, b) => {
      const left = a.cci ?? (cciSort === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
      const right = b.cci ?? (cciSort === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
      return cciSort === "asc" ? left - right : right - left
    })
    const activeOutcomeSort = Object.entries(outcomeSorts).find(([, direction]) => direction)
    if (!activeOutcomeSort) return sorted
    const [timeframe, sortDirection] = activeOutcomeSort
    return sorted.sort((a, b) => {
const left = a.outcomes[timeframe]?.directionalReturnPercent == null ? null : a.outcomes[timeframe]!.directionalReturnPercent! * LEVERAGE
    const right = b.outcomes[timeframe]?.directionalReturnPercent == null ? null : b.outcomes[timeframe]!.directionalReturnPercent! * LEVERAGE
      const leftValue = left == null ? (sortDirection === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : left
      const rightValue = right == null ? (sortDirection === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY) : right
      return sortDirection === "asc" ? leftValue - rightValue : rightValue - leftValue
    })
  }, [entries, horizon, bbFilter, outcomeSorts, cciSort])
  const visibleSymbols = useMemo(() => visibleEntries.map((entry) => entry.symbol), [visibleEntries])
  const liveTickers = useFuturesMiniTickers(visibleSymbols)
  const displayedEntries = useMemo(() => {
    if (!realtimeSort) return visibleEntries
    return [...visibleEntries].sort((a, b) => {
    const getReturn = (entry: Entry) => {
      const currentPrice = liveTickers.prices.get(entry.symbol)
      if (currentPrice == null) return null
      const priceReturn = ((currentPrice - entry.entryPrice) / entry.entryPrice) * 100
      return entry.direction === "short" ? -priceReturn : priceReturn
    }
    const left = getReturn(a) ?? (realtimeSort === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
    const right = getReturn(b) ?? (realtimeSort === "asc" ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY)
    return realtimeSort === "asc" ? left - right : right - left
    })
  }, [visibleEntries, liveTickers.prices, realtimeSort])
  const loading = entriesLoading || summaryLoading

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-7 md:px-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
                <span className={cn("size-1.5 rounded-full", liveTickers.status === "live" ? "bg-primary" : "bg-muted-foreground")} />
                <span className={cn("font-[inherit] text-xs tracking-widest", liveTickers.status === "live" ? "text-primary" : "text-muted-foreground")}>{connectionLabels[liveTickers.status]}</span>
                {liveTickers.lastMessageAt && <span className="text-xs text-muted-foreground">· {liveTime.format(new Date(liveTickers.lastMessageAt))}</span>}
              </div>
              <h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight md:text-3xl">실시간 모니터링</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">멀티프레임 데이터 통계, 전 주문 수집</p>
            </div>
          <Button variant="outline" size="sm" className="w-fit gap-2" onClick={() => { void mutateEntries(); void mutateSummary(); void mutateValidation() }}><RefreshCw className="size-3.5" />새로고침</Button>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px] flex-col gap-8 px-4 py-6 md:px-8">
        <section aria-labelledby="date-picker-heading" className="border-y border-border bg-card/30">
          <div className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 text-primary" />
              <div>
                <h2 id="date-picker-heading" className="text-sm font-semibold">{formatSelectedDate(selectedDate)}</h2>
                <p className="text-xs text-muted-foreground">선택 일자의 신호와 집계만 표시</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="이전 날짜" disabled={selectedDate <= availableDates[0]} onClick={() => setSelectedDate((value) => shiftDateKey(value, -1))}><ChevronLeft className="size-4" /></Button>
              <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="다음 날짜" disabled={selectedDate >= today} onClick={() => setSelectedDate((value) => shiftDateKey(value, 1))}><ChevronRight className="size-4" /></Button>
            </div>
          </div>
          <div ref={dateStripRef} className="flex snap-x snap-mandatory gap-1 overflow-x-auto px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {availableDates.map((dateKey) => {
              const date = dateFromKey(dateKey)
              const day = date.getUTCDay()
              const selected = dateKey === selectedDate
              const startsMonth = date.getUTCDate() === 1
              return (
                <button
                  key={dateKey}
                  type="button"
                  data-date={dateKey}
                  aria-pressed={selected}
                  aria-label={`${formatSelectedDate(dateKey)} 선택`}
                  onClick={() => { setSelectedDate(dateKey) }}
                  className={cn("flex min-w-20 snap-center flex-col items-center gap-2 rounded-md px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected ? "bg-primary/10" : "hover:bg-muted/60")}
                >
                  <span className={cn("text-xs", day === 0 ? "text-destructive" : day === 6 ? "text-blue-400" : "text-muted-foreground")}>{weekdays[day]}{startsMonth ? ` · ${date.getUTCMonth() + 1}월` : ""}</span>
                  <span className={cn("flex size-10 items-center justify-center rounded-full text-lg font-semibold tabular-nums", selected ? "border-2 border-primary text-primary" : "text-foreground")}>{date.getUTCDate()}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="grid grid-cols-2 border-y border-border lg:grid-cols-7">
          <Metric label="자동매매 진입 포지션" value={(summary?.autoPositionTotal ?? 0).toLocaleString()} detail={summary?.missingStatisticsTotal ? `통계 연결 누락 ${summary.missingStatisticsTotal}건` : "통계와 진입 수 일치"} />
          <Metric label="연결된 통계 기록" value={(summary?.linkedPositionTotal ?? 0).toLocaleString()} detail="청산·방향 무관" />
          <Metric label={`${horizon}분 결과 완료`} value={`${(summary?.completionRate ?? 0).toFixed(1)}%`} detail={`${summary?.complete ?? 0}건 계산`} />
          <Metric label="방향 승률" value={`${(summary?.winRate ?? 0).toFixed(1)}%`} detail={`${summary?.wins ?? 0}승 · ${summary?.losses ?? 0}패`} />
          <Metric label="평균 방향 수익률" value={summary?.averageReturn == null ? "—" : `${summary.averageReturn >= 0 ? "+" : ""}${summary.averageReturn.toFixed(2)}%`} detail="10배 레버리지 반영" />
          <Metric label="평균 ./24H" value={summary?.averageVolumeRatio == null ? "—" : `${summary.averageVolumeRatio.toFixed(2)}%`} detail={`가공 완료 ${summary?.enrichedTotal ?? 0}건`} />
        </section>

        <section aria-labelledby="prediction-validation-heading" className="border-y border-border bg-card/30 p-5 md:p-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-xl">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary">분석 전용</span>
                <span className="font-[inherit] text-xs text-muted-foreground">{validation?.modelVersion ?? "empirical-bayes-v2-enriched"}</span>
              </div>
              <h2 id="prediction-validation-heading" className="mt-3 text-lg font-semibold text-foreground">Database statistics</h2>
            </div>
            <div className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-5">
              <div><p className="text-xs text-muted-foreground">오늘 DB 표본</p><p className="mt-1 font-[inherit] text-xl font-semibold">{(validation?.todaySamples ?? 0).toLocaleString()}</p></div>
              <div><p className="text-xs text-muted-foreground">전체 DB 표본</p><p className="mt-1 font-[inherit] text-xl font-semibold">{(validation?.totalSamples ?? 0).toLocaleString()}</p></div>
              <div><p className="text-xs text-muted-foreground">이진 적중률</p><p className="mt-1 font-[inherit] text-xl font-semibold">{validation?.accuracy == null ? "—" : `${validation.accuracy.toFixed(1)}%`}</p><p className="mt-1 text-xs text-muted-foreground">예측·결과 결합 n={(validation?.evaluatedSamples ?? 0).toLocaleString()}</p></div>
              <div><p className="text-xs text-muted-foreground">Brier score</p><p className="mt-1 font-[inherit] text-xl font-semibold">{validation?.brierScore == null ? "—" : validation.brierScore.toFixed(3)}</p><p className="mt-1 text-xs text-muted-foreground">오늘 결합 n={(validation?.todayEvaluatedSamples ?? 0).toLocaleString()}</p></div>
              <div><p className="text-xs text-muted-foreground">중앙값</p><p className="mt-1 font-[inherit] text-xl font-semibold">{summary?.medianReturn == null ? "—" : `${summary.medianReturn >= 0 ? "+" : ""}${summary.medianReturn.toFixed(2)}%`}</p><p className="mt-1 text-xs text-muted-foreground">극단값 영향 완화</p></div>
            </div>
          </div>
          {validation?.calibration.length ? <div className="mt-5 flex flex-wrap gap-2 border-t border-border/70 pt-4">{validation.calibration.map((bucket) => <span key={bucket.label} className="rounded-md bg-secondary px-2.5 py-1.5 font-[inherit] text-xs text-secondary-foreground">예상 {bucket.predictedWinRate?.toFixed(0)}% · 실제 {bucket.actualWinRate?.toFixed(0)}% · n={bucket.samples}</span>)}</div> : null}
        </section>

        <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" aria-label="평가 시간 선택">
            {horizons.map((value) => <Button key={value} size="sm" variant={horizon === value ? "default" : "outline"} onClick={() => { setHorizon(value) }}>{value === 240 ? "4시간" : `${value}분`}</Button>)}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative"><span className="sr-only">심볼 검색</span><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => { setSearch(event.target.value) }} placeholder="심볼 검색" className="w-full pl-9 sm:w-48" /></label>
            <Select value={direction} onValueChange={(value) => { setDirection(value) }}><SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 방향</SelectItem><SelectItem value="long">LONG</SelectItem><SelectItem value="short">SHORT</SelectItem></SelectContent></Select>
            <Select value={duplicates} onValueChange={(value) => { setDuplicates(value) }}><SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">중복 포함</SelectItem><SelectItem value="original">원본만</SelectItem></SelectContent></Select>
          </div>
        </section>

        {entriesError && <div role="alert" className="border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">엔트리 로그를 불러오지 못했습니다. 실시간 시세 연결은 별도로 계속 동작합니다.</div>}
        {summaryError && <div role="status" className="border border-border bg-muted/20 p-4 text-sm text-muted-foreground">집계 통계를 불러오지 못했습니다. 엔트리 로그와 실시간 시세는 정상적으로 계속 표시됩니다.</div>}

        <section className="grid gap-8 lg:grid-cols-2">
          <BreakdownChart title="CCI 구간별 성과" data={summary?.breakdowns.cci ?? []} />
          <BreakdownChart title="볼린저 위치 · 추세별 성과" data={summary?.breakdowns.bollinger ?? []} />
          <BreakdownChart title="불꽃 수별 성과" data={summary?.fireDistribution ?? []} />
          <BreakdownChart title="상태 · 등급별 성과" data={[...(summary?.stateBreakdown ?? []), ...(summary?.gradeBreakdown ?? [])]} />
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div><div className="flex items-center gap-2"><Database className="size-4 text-primary" /><h2 className="text-lg font-semibold">엔트리 로그</h2></div><p className="mt-1 text-xs text-muted-foreground">같은 그룹의 원본·중복 신호도 진입가별로 ���� 계산됩니다.</p></div>
            <span className="font-[inherit] text-xs text-muted-foreground">{selectedDate} · {displayedEntries.length.toLocaleString()} / {(entriesData?.total ?? 0).toLocaleString()} ROWS</span>
          </div>
          <div className="overflow-x-auto border-y border-border">
            <table className="w-full min-w-[1640px] text-left text-sm">
  <thead><tr className="border-b border-border text-xs text-muted-foreground">
    <th className="px-3 py-3 font-medium">시각 KST</th><th className="px-3 py-3 font-medium">심볼</th><th className="px-3 py-3 font-medium">그룹</th>
    <th className="px-3 py-3 font-medium"><TableFilterMenu label="신호" active={direction !== "all"}>
      <DropdownMenuLabel>방향</DropdownMenuLabel><DropdownMenuRadioGroup value={direction} onValueChange={setDirection}><DropdownMenuRadioItem value="all">전체</DropdownMenuRadioItem><DropdownMenuRadioItem value="long">롱</DropdownMenuRadioItem><DropdownMenuRadioItem value="short">숏</DropdownMenuRadioItem></DropdownMenuRadioGroup>
    </TableFilterMenu></th>
    <th className="px-3 py-3 font-medium"><TableFilterMenu label={cciSort === "asc" ? "CCI ↑" : cciSort === "desc" ? "CCI ↓" : "CCI"} active={cciSort !== "none"}>
      <DropdownMenuLabel>CCI 정렬</DropdownMenuLabel><DropdownMenuRadioGroup value={cciSort} onValueChange={(value) => setCciSort(value as CciSort)}><DropdownMenuRadioItem value="none">기본 순서</DropdownMenuRadioItem><DropdownMenuRadioItem value="desc">높은 값부터</DropdownMenuRadioItem><DropdownMenuRadioItem value="asc">낮은 값부터</DropdownMenuRadioItem></DropdownMenuRadioGroup>
    </TableFilterMenu></th>
    <th className="px-3 py-3 font-medium"><TableFilterMenu label="BB" active={bbFilter !== "all"}>
      <DropdownMenuLabel>볼린저 조합</DropdownMenuLabel><DropdownMenuRadioGroup value={bbFilter} onValueChange={setBbFilter}><DropdownMenuRadioItem value="all">전체</DropdownMenuRadioItem><DropdownMenuRadioItem value="below_middle · down">below_middle · down</DropdownMenuRadioItem><DropdownMenuRadioItem value="above_middle · down">above_middle · down</DropdownMenuRadioItem><DropdownMenuRadioItem value="above_middle · up">above_middle · up</DropdownMenuRadioItem><DropdownMenuRadioItem value="below_middle · up">below_middle · up</DropdownMenuRadioItem><DropdownMenuRadioItem value="none">데이터 없음</DropdownMenuRadioItem></DropdownMenuRadioGroup>
    </TableFilterMenu></th>
    <th className="px-3 py-3 font-medium">./24H</th><th className="px-3 py-3 font-medium">불꽃</th><th className="px-3 py-3 font-medium">상태 · 등급</th><th className="px-3 py-3 font-medium">가이드</th><th className="px-3 py-3 font-medium">진입</th><th className="px-3 py-3 font-medium">현재가</th><th className="px-3 py-3 font-medium"><OutcomeSortButton label="실시간" direction={realtimeSort} onClick={() => setRealtimeSort((current) => current === "desc" ? "asc" : "desc")} /></th>
    {horizons.map((value) => {
      const timeframe = String(value)
      const sortDirection = outcomeSorts[timeframe]
      return <th key={value} className="px-3 py-3 font-medium"><OutcomeSortButton label={value === 240 ? "240분" : `${value}분`} direction={sortDirection} onClick={() => setOutcomeSorts((current) => ({ [timeframe]: current[timeframe] === "desc" ? "asc" : "desc" }))} /></th>
    })}
    <th className="px-3 py-3 font-medium">{horizon}분 예측</th>
    <th className="px-3 py-3 font-medium">{horizon}분 실제</th>
  </tr></thead>
              <tbody>
                {displayedEntries.map((entry, index) => {
                  const selected = entry.outcomes[String(horizon)]
                  const prediction = entry.predictions[String(horizon)]
                  const previous = displayedEntries[index - 1]
                  const startsGroup = !previous || previous.duplicateGroupKey !== entry.duplicateGroupKey
                  const currentPrice = liveTickers.prices.get(entry.symbol) ?? null
                  const priceReturn = currentPrice == null ? null : ((currentPrice - entry.entryPrice) / entry.entryPrice) * 100
                  const directionalReturn = priceReturn == null ? null : (entry.direction === "short" ? -priceReturn : priceReturn) * LEVERAGE
                  return (
                    <tr key={entry.id} className={cn("border-b border-border/70 hover:bg-muted/30", startsGroup && index > 0 && "border-t-2 border-t-primary/30", entry.duplicateIndex > 0 && "bg-muted/15")}>
                      <td className="px-3 py-4 font-[inherit] text-muted-foreground">{kstTime.format(new Date(entry.signalTime))}</td>
                      <td className="px-3 py-4 font-semibold">{entry.symbol}</td>
                      <td className="px-3 py-4"><span className={cn("rounded-md px-2 py-1 font-[inherit] text-xs", entry.duplicateIndex ? "bg-secondary text-secondary-foreground" : "text-muted-foreground")}>{entry.duplicateIndex === 0 ? "1" : "2"}</span></td>
                      <td className="px-3 py-4"><span className={cn("inline-flex items-center gap-1", entry.direction === "long" ? "text-primary" : "text-destructive")}>{entry.direction === "long" ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}{entry.signalType.replace("TRIPLE_COMBO_", "")}</span></td>
                      <td className="px-3 py-4 font-[inherit] text-muted-foreground">{entry.cci?.toFixed(1) ?? "—"}</td>
                      <td className="px-3 py-4 text-muted-foreground"><div className="flex min-w-20 flex-col leading-5"><span>{entry.bollinger.position?.replaceAll("_", " ") || "—"}</span><span>{entry.bollinger.trend || "—"}</span></div></td>
                      <td className="px-3 py-4 font-[inherit]">{entry.volumeRatio24h == null ? "—" : `${entry.volumeRatio24h.toFixed(2)}%`}</td>
                      <td className="px-3 py-4 font-[inherit]">{entry.fireCount == null ? "—" : `${entry.fireCount}/5`}</td>
                      <td className="px-3 py-4"><div className="flex flex-col leading-5"><span className="font-[inherit]">{entry.signalGrade ?? "D"}</span><span>{entry.signalState ?? "NEUTRAL"}</span></div></td>
                      <td className="max-w-40 px-3 py-4 text-muted-foreground"><div className="flex max-w-32 flex-col leading-5">{guideLines(entry.tradeGuide).map((line, lineIndex) => <span key={`${entry.id}-guide-${lineIndex}`}>{line}</span>)}</div></td>
                      <td className="px-3 py-4 font-[inherit]">{numberFormat.format(entry.entryPrice)}</td>
                      <td className="px-3 py-4 font-[inherit]">{currentPrice == null ? "—" : numberFormat.format(currentPrice)}</td>
                      <td className="px-3 py-4"><Percent value={directionalReturn} /></td>
                      {horizons.map((value) => <td key={value} className="px-3 py-4"><Percent value={entry.outcomes[String(value)]?.priceReturnPercent == null ? null : entry.outcomes[String(value)]!.priceReturnPercent! * LEVERAGE} /></td>)}
                      <td className="px-3 py-4">{!prediction ? <span className="text-xs text-muted-foreground">생성 대기</span> : prediction.confidenceLevel === "insufficient" ? <span className="rounded-md bg-secondary px-2 py-1 text-xs text-muted-foreground">데이터 부족 · n={prediction.effectiveSampleSize}</span> : <div className="flex flex-col gap-1"><span className="font-[inherit] font-medium">승 {prediction.expectedWinRate.toFixed(1)}% · <Percent value={prediction.expectedDirectionalReturnPercent * LEVERAGE} /></span><span className="text-xs text-muted-foreground">신뢰 {confidenceLabels[prediction.confidenceLevel]} {prediction.confidenceScore.toFixed(0)} · n={prediction.effectiveSampleSize}</span></div>}</td>
                      <td className="px-3 py-4"><span className={cn("rounded-md px-2 py-1 font-[inherit] text-xs", selected?.status !== "complete" ? "bg-secondary text-muted-foreground" : selected.result === "win" ? "bg-primary/15 text-primary" : selected.result === "loss" ? "bg-destructive/15 text-destructive" : "bg-secondary text-secondary-foreground")}>{selected?.status === "pending" || !selected ? "대기" : selected.status === "unavailable" ? "데��터 없음" : <>{selected.result === "win" ? "승" : selected.result === "loss" ? "패" : "보합"} {selected.directionalReturnPercent != null ? `${selected.directionalReturnPercent > 0 ? "+" : ""}${(selected.directionalReturnPercent * LEVERAGE).toFixed(2)}%` : ""}</>}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!loading && !entries.length && <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">조건에 맞는 실제 신호가 없습니다.</div>}
            {loading && !entries.length && <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><RefreshCw className="size-4 animate-spin" />실제 데이터를 계산하고 있습니다.</div>}
          </div>
        </section>

        <footer className="flex flex-col gap-2 border-t border-border py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>확정 성과: Binance 캔들 · 승패 기준: 방향 수익률 ±0.10% · 10배 레버리지 반영</span><span>{summary?.lastCalculatedAt ? `최근 계산 ${kstTime.format(new Date(summary.lastCalculatedAt))} KST` : "계산 결과 대기 중"}</span></footer>
      </div>
    </main>
  )
}
