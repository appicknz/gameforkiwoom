"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import useSWR from "swr"
import { Activity, ArrowDownRight, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight, Database, RefreshCw, Search } from "lucide-react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { useFuturesMiniTickers, type FuturesTickerConnection } from "@/hooks/use-futures-mini-tickers"

const fetcher = (url: string) => fetch(url).then(async (response) => {
  if (!response.ok) throw new Error("데이터를 불러오지 못했습니다.")
  return response.json()
})

const horizons = [5, 15, 30, 60, 240]
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
  bollinger: { position: string | null; trend: string | null; expansion: boolean | null; squeeze: boolean | null; width: number | null }
  outcomes: Record<string, Outcome>
}

type Breakdown = { label: string; samples: number; winRate: number; averageReturn: number | null; medianReturn: number | null }
type Summary = {
  total: number
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
  breakdowns: { cci: Breakdown[]; bollinger: Breakdown[]; confluence: Breakdown[]; signalType: Breakdown[] }
}

type EntriesResponse = { entries: Entry[]; total: number; page: number; pageSize: number }

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
  const visible = data.slice(0, 7)
  return (
    <section className="border-t border-border pt-5">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="mt-1 text-xs text-muted-foreground">실제 완료 표본 기준 · 막대는 승률</p>
        </div>
        <span className="font-[inherit] text-xs text-muted-foreground">표본 ≥ 1</span>
      </div>
      {visible.length ? (
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <BarChart data={visible} margin={{ left: -20, right: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} interval={0} tick={{ fontSize: 11 }} tickFormatter={(value) => String(value).slice(0, 12)} />
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
  const [horizon, setHorizon] = useState(30)
  const [search, setSearch] = useState("")
  const [direction, setDirection] = useState("all")
  const [duplicates, setDuplicates] = useState("all")
  const [page, setPage] = useState(1)
  const dateStripRef = useRef<HTMLDivElement>(null)
  const availableDates = useMemo(() => Array.from({ length: 30 }, (_, index) => shiftDateKey(today, index - 29)), [today])

  useEffect(() => {
    dateStripRef.current?.querySelector<HTMLElement>(`[data-date="${selectedDate}"]`)?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" })
  }, [selectedDate])

  const query = useMemo(() => {
    const params = new URLSearchParams({ horizon: String(horizon), page: String(page), pageSize: "40", duplicates, from: selectedDate, to: selectedDate })
    if (search.trim()) params.set("q", search.trim())
    if (direction !== "all") params.set("direction", direction)
    return params.toString()
  }, [horizon, search, direction, duplicates, page, selectedDate])
  const summaryQuery = useMemo(() => {
    const params = new URLSearchParams({ horizon: String(horizon), duplicates, from: selectedDate, to: selectedDate })
    if (search.trim()) params.set("q", search.trim())
    if (direction !== "all") params.set("direction", direction)
    return params.toString()
  }, [horizon, search, direction, duplicates, selectedDate])

  const { data: entriesData, error: entriesError, isLoading: entriesLoading, mutate: mutateEntries } = useSWR<EntriesResponse>(`/api/signal-statistics/entries?${query}`, fetcher, { refreshInterval: 30_000 })
  const { data: summary, error: summaryError, isLoading: summaryLoading, mutate: mutateSummary } = useSWR<Summary>(`/api/signal-statistics/summary?${summaryQuery}`, fetcher, { refreshInterval: 30_000 })
  const entries = entriesData?.entries ?? []
  const visibleSymbols = useMemo(() => entries.map((entry) => entry.symbol), [entries])
  const liveTickers = useFuturesMiniTickers(visibleSymbols)
  const totalPages = Math.max(1, Math.ceil((entriesData?.total ?? 0) / 40))
  const loading = entriesLoading || summaryLoading

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-6 px-4 py-7 md:px-8 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="mt-1 flex size-10 items-center justify-center rounded-md border border-primary/30 bg-primary/10 text-primary"><Activity className="size-5" /></div>
            <div>
              <div className="flex items-center gap-2">
                <span className={cn("size-1.5 rounded-full", liveTickers.status === "live" ? "bg-primary" : "bg-muted-foreground")} />
                <span className={cn("font-[inherit] text-xs tracking-widest", liveTickers.status === "live" ? "text-primary" : "text-muted-foreground")}>{connectionLabels[liveTickers.status]}</span>
                {liveTickers.lastMessageAt && <span className="text-xs text-muted-foreground">· {liveTime.format(new Date(liveTickers.lastMessageAt))}</span>}
              </div>
              <h1 className="mt-2 text-balance text-2xl font-semibold tracking-tight md:text-3xl">실제 웹훅 신호 통계</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">수신된 JSON 조건과 이후 Binance 선물 가격을 연결합니다. 통계는 주문 판단과 완전히 분리되어 있습니다.</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="w-fit gap-2" onClick={() => { void mutateEntries(); void mutateSummary() }}><RefreshCw className="size-3.5" />새로고침</Button>
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
              <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="이전 날짜" disabled={selectedDate <= availableDates[0]} onClick={() => { setSelectedDate((value) => shiftDateKey(value, -1)); setPage(1) }}><ChevronLeft className="size-4" /></Button>
              <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="다음 날짜" disabled={selectedDate >= today} onClick={() => { setSelectedDate((value) => shiftDateKey(value, 1)); setPage(1) }}><ChevronRight className="size-4" /></Button>
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
                  onClick={() => { setSelectedDate(dateKey); setPage(1) }}
                  className={cn("flex min-w-20 snap-center flex-col items-center gap-2 rounded-md px-3 py-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selected ? "bg-primary/10" : "hover:bg-muted/60")}
                >
                  <span className={cn("text-xs", day === 0 ? "text-destructive" : day === 6 ? "text-blue-400" : "text-muted-foreground")}>{weekdays[day]}{startsMonth ? ` · ${date.getUTCMonth() + 1}월` : ""}</span>
                  <span className={cn("flex size-10 items-center justify-center rounded-full text-lg font-semibold tabular-nums", selected ? "border-2 border-primary text-primary" : "text-foreground")}>{date.getUTCDate()}</span>
                </button>
              )
            })}
          </div>
        </section>

        <section className="grid grid-cols-2 border-y border-border lg:grid-cols-5">
          <Metric label="수집 신호" value={(summary?.total ?? 0).toLocaleString()} detail="실제 유효 JSON" />
          <Metric label={`${horizon}분 결과 완료`} value={`${(summary?.completionRate ?? 0).toFixed(1)}%`} detail={`${summary?.complete ?? 0}건 계산`} />
          <Metric label="방향 승률" value={`${(summary?.winRate ?? 0).toFixed(1)}%`} detail={`${summary?.wins ?? 0}승 · ${summary?.losses ?? 0}패`} />
          <Metric label="평균 방향 수익률" value={summary?.averageReturn == null ? "—" : `${summary.averageReturn >= 0 ? "+" : ""}${summary.averageReturn.toFixed(2)}%`} detail="레버리지 미반영" />
          <Metric label="중앙값" value={summary?.medianReturn == null ? "—" : `${summary.medianReturn >= 0 ? "+" : ""}${summary.medianReturn.toFixed(2)}%`} detail="극단값 영향 완화" />
        </section>

        <section className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2" aria-label="평가 시간 선택">
            {horizons.map((value) => <Button key={value} size="sm" variant={horizon === value ? "default" : "outline"} onClick={() => { setHorizon(value); setPage(1) }}>{value === 240 ? "4시간" : `${value}분`}</Button>)}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative"><span className="sr-only">심볼 검색</span><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1) }} placeholder="심볼 검색" className="w-full pl-9 sm:w-48" /></label>
            <Select value={direction} onValueChange={(value) => { setDirection(value); setPage(1) }}><SelectTrigger className="w-full sm:w-32"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">전체 방향</SelectItem><SelectItem value="long">LONG</SelectItem><SelectItem value="short">SHORT</SelectItem></SelectContent></Select>
            <Select value={duplicates} onValueChange={(value) => { setDuplicates(value); setPage(1) }}><SelectTrigger className="w-full sm:w-36"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">중복 포함</SelectItem><SelectItem value="original">원본만</SelectItem></SelectContent></Select>
          </div>
        </section>

        {entriesError && <div role="alert" className="border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">엔트리 로그를 불러오지 못했습니다. 실시간 시세 연결은 별도로 계속 동작합니다.</div>}
        {summaryError && <div role="status" className="border border-border bg-muted/20 p-4 text-sm text-muted-foreground">집계 통계를 불러오지 못했습니다. 엔트리 로그와 실시간 시세는 정상적으로 계속 표시됩니다.</div>}

        <section className="grid gap-8 lg:grid-cols-2">
          <BreakdownChart title="CCI 구간별 성과" data={summary?.breakdowns.cci ?? []} />
          <BreakdownChart title="볼린저 위치 · 추세별 성과" data={summary?.breakdowns.bollinger ?? []} />
        </section>

        <section>
          <div className="mb-4 flex items-end justify-between gap-4">
            <div><div className="flex items-center gap-2"><Database className="size-4 text-primary" /><h2 className="text-lg font-semibold">엔트리 로그</h2></div><p className="mt-1 text-xs text-muted-foreground">같은 그룹의 원본·중복 신호도 진입가별로 각각 계산됩니다.</p></div>
            <span className="font-[inherit] text-xs text-muted-foreground">{selectedDate} · {(entriesData?.total ?? 0).toLocaleString()} ROWS</span>
          </div>
          <div className="overflow-x-auto border-y border-border">
            <table className="w-full min-w-[1460px] text-left text-sm">
              <thead><tr className="border-b border-border text-xs text-muted-foreground">
                {['시각 KST','심볼','그룹','신호','CCI','BB','컨플루언스','진입','현재가','실시간','5분','15분','30분','60분','4시간',`${horizon}분`].map((heading, index) => <th key={`${heading}-${index}`} className="px-3 py-3 font-medium">{heading}</th>)}
              </tr></thead>
              <tbody>
                {entries.map((entry, index) => {
                  const selected = entry.outcomes[String(horizon)]
                  const previous = entries[index - 1]
                  const startsGroup = !previous || previous.duplicateGroupKey !== entry.duplicateGroupKey
                  const currentPrice = liveTickers.prices.get(entry.symbol) ?? null
                  const priceReturn = currentPrice == null ? null : ((currentPrice - entry.entryPrice) / entry.entryPrice) * 100
                  const directionalReturn = priceReturn == null ? null : entry.direction === "short" ? -priceReturn : priceReturn
                  return (
                    <tr key={entry.id} className={cn("border-b border-border/70 hover:bg-muted/30", startsGroup && index > 0 && "border-t-2 border-t-primary/30", entry.duplicateIndex > 0 && "bg-muted/15")}>
                      <td className="px-3 py-4 font-[inherit] text-muted-foreground">{kstTime.format(new Date(entry.signalTime))}</td>
                      <td className="px-3 py-4 font-semibold">{entry.symbol}</td>
                      <td className="px-3 py-4"><span className={cn("rounded-md px-2 py-1 text-xs", entry.duplicateIndex ? "bg-secondary text-secondary-foreground" : "text-muted-foreground")}>{entry.duplicateLabel}</span></td>
                      <td className="px-3 py-4"><span className={cn("inline-flex items-center gap-1", entry.direction === "long" ? "text-primary" : "text-destructive")}>{entry.direction === "long" ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}{entry.signalType.replace("TRIPLE_COMBO_", "")}</span></td>
                      <td className="px-3 py-4 font-[inherit] text-muted-foreground">{entry.cci?.toFixed(1) ?? "—"}</td>
                      <td className="px-3 py-4 text-muted-foreground">{[entry.bollinger.position, entry.bollinger.trend].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="max-w-44 truncate px-3 py-4 text-muted-foreground">{entry.confluence || "—"}</td>
                      <td className="px-3 py-4 font-[inherit]">{numberFormat.format(entry.entryPrice)}</td>
                      <td className="px-3 py-4 font-[inherit]">{currentPrice == null ? "—" : numberFormat.format(currentPrice)}</td>
                      <td className="px-3 py-4"><Percent value={directionalReturn} /></td>
                      {horizons.map((value) => <td key={value} className="px-3 py-4"><Percent value={entry.outcomes[String(value)]?.priceReturnPercent} /></td>)}
                      <td className="px-3 py-4"><span className={cn("rounded-md px-2 py-1 font-[inherit] text-xs", selected?.status !== "complete" ? "bg-secondary text-muted-foreground" : selected.result === "win" ? "bg-primary/15 text-primary" : selected.result === "loss" ? "bg-destructive/15 text-destructive" : "bg-secondary text-secondary-foreground")}>{selected?.status === "pending" || !selected ? "대기" : selected.status === "unavailable" ? "데이터 없음" : <>{selected.result === "win" ? "승" : selected.result === "loss" ? "패" : "보합"} {selected.directionalReturnPercent != null ? `${selected.directionalReturnPercent > 0 ? "+" : ""}${selected.directionalReturnPercent.toFixed(2)}%` : ""}</>}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!loading && !entries.length && <div className="flex min-h-48 items-center justify-center text-sm text-muted-foreground">조건에 맞는 실제 신호가 없습니다.</div>}
            {loading && !entries.length && <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"><RefreshCw className="size-4 animate-spin" />실제 데이터를 계산하고 있습니다.</div>}
          </div>
          <div className="mt-4 flex items-center justify-between"><Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>이전</Button><span className="font-[inherit] text-sm tabular-nums text-muted-foreground"><span className="text-foreground">{page}</span> / {totalPages}</span><Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>다음</Button></div>
        </section>

        <footer className="flex flex-col gap-2 border-t border-border py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>확정 성과: Binance 캔들 · 실시간 표시: 로컬 브라우저 Futures WebSocket</span><span>{summary?.lastCalculatedAt ? `최근 계산 ${kstTime.format(new Date(summary.lastCalculatedAt))} KST` : "계산 결과 대기 중"}</span></footer>
      </div>
    </main>
  )
}
