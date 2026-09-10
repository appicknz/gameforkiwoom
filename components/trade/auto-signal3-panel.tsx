"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { RefreshCw } from "lucide-react"

const GOLD = "#d4af37"
const UP = "#22c55e"
const DOWN = "#ef4444"
const SEED = 2_000_000

type Record3 = {
  id: string
  signal_time: string
  signal_type: string
  symbol: string
  symbol_name: string | null
  account_mode: "test" | "live"
  account: string
  entry_price: number
  quantity: number
  invested_amount: number
  close_price: number | null
  status: string
  skip_reason: string | null
  price_change_percent: number | null
  volume: number | null
  trade_time: string | null
}

type Quote = { symbolName: string | null; price: number; changePercent: number | null; volume: number | null; tradedAt: string | null }

function tokenHeaders(json = false): HeadersInit {
  const token = typeof window === "undefined" ? "" : localStorage.getItem("app_token") ?? ""
  return { ...(json ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}` }
}

const number = (value: number, digits = 0) => value.toLocaleString("ko-KR", { maximumFractionDigits: digits })

export default function AutoSignal3Panel({ selectedDate, searchQ = "" }: { selectedDate: Date; searchQ?: string }) {
  const [records, setRecords] = useState<Record3[]>([])
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const loadingRef = useRef(false)
  const initialQuoteRequestRef = useRef(true)

  const dateKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
  const isToday = dateKey === today

  const load = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const response = await fetch(`/api/auto-trading3/records?date=${encodeURIComponent(dateKey)}`, { credentials: "include", headers: tokenHeaders() })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "자동매매3 조회 실패")
      const nextRecords: Record3[] = data.records ?? []
      setRecords(nextRecords)
      if (isToday) {
        const symbolsByMode = new Map<string, string[]>()
        nextRecords.filter(record => record.status !== "skipped").forEach(record => {
          const symbols = symbolsByMode.get(record.account_mode) ?? []
          if (!symbols.includes(record.symbol)) symbols.push(record.symbol)
          symbolsByMode.set(record.account_mode, symbols)
        })
        const batches = await Promise.all([...symbolsByMode.entries()].map(async ([mode, symbols]) => {
          const params = new URLSearchParams({ mode, symbols: symbols.join(",") })
          if (initialQuoteRequestRef.current) params.set("fallback", "1")
          const quoteResponse = await fetch(`/api/auto-trading3/quote?${params}`, { credentials: "include", headers: tokenHeaders() })
          const quoteData = await quoteResponse.json()
          return quoteResponse.ok ? Object.entries(quoteData.quotes ?? {}).map(([symbol, quote]) => [`${mode}:${symbol}`, quote as Quote] as const) : []
        }))
        setQuotes(Object.fromEntries(batches.flat()))
        initialQuoteRequestRef.current = false
      } else {
        setQuotes({})
      }
      setMessage(null)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "자동매매3 조회 실패")
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [dateKey, isToday])

  useEffect(() => {
    initialQuoteRequestRef.current = true
    setLoading(true)
    void load()
    if (!isToday) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load()
    }, 5_000)
    return () => window.clearInterval(timer)
  }, [isToday, load])

  const rows = useMemo(() => records.map(record => {
    const currentPrice = isToday ? quotes[`${record.account_mode}:${record.symbol}`]?.price ?? 0 : Number(record.close_price ?? 0)
    const active = record.status !== "skipped" && currentPrice > 0 && Number(record.quantity) > 0
    const evaluated = active ? Number(record.quantity) * currentPrice : Number(record.invested_amount)
    const pnl = evaluated - Number(record.invested_amount)
    const roi = Number(record.invested_amount) > 0 ? pnl / Number(record.invested_amount) * 100 : 0
    return { ...record, currentPrice, evaluated, pnl, roi }
  }).filter(record => !searchQ || `${record.symbol} ${record.symbol_name ?? ""}`.toLowerCase().includes(searchQ.toLowerCase())), [isToday, quotes, records, searchQ])

  const included = rows.filter(record => record.status !== "skipped")
  const invested = included.reduce((sum, record) => sum + Number(record.invested_amount), 0)
  const evaluated = included.reduce((sum, record) => sum + record.evaluated, 0)
  const pnl = evaluated - invested
  const roi = invested > 0 ? pnl / invested * 100 : 0
  const profitCount = included.filter(record => record.roi > 0).length
  const lossCount = included.filter(record => record.roi < 0).length

  const saveCloses = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch("/api/auto-trading3/closes", { method: "POST", credentials: "include", headers: tokenHeaders(true), body: JSON.stringify({ date: dateKey }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "종가 저장 실패")
      const count = data.results?.filter((item: { error?: string }) => !item.error).length ?? 0
      setMessage(`${count}건 종가 저장 완료`)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "종가 저장 실패")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">불러오는 중...</div>

  return (
    <section aria-label="자동매매3 UP6 국내주식 기록">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/10 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {isToday && <span className="size-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" aria-hidden="true" />}
          <strong className="text-[11px] text-primary">자동매매3</strong>
          <span className="text-[9px] text-muted-foreground">수신 signal_type · 국내주식</span>
          <span className="text-[11px] text-foreground/60">{selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">{isToday ? "실시간" : "종가 기준"}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground">수익 <b style={{ color: UP }}>{profitCount}</b>{" / "}손실 <b style={{ color: DOWN }}>{lossCount}</b></span>
          <button type="button" onClick={() => void load()} className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[10px] text-muted-foreground transition-colors hover:text-foreground"><RefreshCw className="size-3" />새로고침</button>
          {isToday && <button type="button" onClick={saveCloses} disabled={saving} className="h-7 rounded-md bg-primary px-2.5 text-[10px] font-bold text-primary-foreground disabled:opacity-50">{saving ? "저장 중" : "당일 종가 저장"}</button>}
        </div>
      </header>

      {message && <p className="border-b border-border px-4 py-2 text-[10px] text-muted-foreground">{message}</p>}

      <div className="grid grid-cols-2 border-b border-primary/10 md:grid-cols-5">
        {[
          ["MARGIN", SEED, "원"], ["투입금액", invested, "원"], ["평가금액", evaluated, "원"], ["TOTAL PNL", pnl, "원"], ["TOTAL ROI", roi, "%"],
        ].map(([label, value, suffix], index) => (
          <div key={String(label)} className="border-b border-r border-primary/10 px-4 py-3 md:border-b-0">
            <p className="text-[9px] font-semibold text-muted-foreground">{label}</p>
            <p className="mt-1 text-sm font-black tabular-nums" style={{ color: index >= 3 ? (Number(value) >= 0 ? UP : DOWN) : GOLD }}>{index === 4 ? Number(value).toFixed(2) : number(Number(value))}<span className="ml-1 text-[9px] font-medium text-muted-foreground">{suffix}</span></p>
          </div>
        ))}
      </div>

      <div className="flex flex-col">
        {rows.length === 0 && <div className="py-10 text-center text-xs text-muted-foreground">선택한 날짜의 UP6 기록이 없습니다.</div>}
        {rows.map(record => {
          const priceLabel = isToday ? "현재" : "종가"
          const time = new Date(record.signal_time).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit" })
          return (
            <article key={record.id} className="flex flex-col gap-2 border-b border-border px-4 py-3 transition-colors hover:bg-muted/20 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-sm text-foreground">{record.symbol}</strong>
                  <span className="text-[11px] font-medium text-muted-foreground">{record.symbol_name || "종목명 확인 중"}</span>
                  <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ background: record.account_mode === "live" ? "rgba(212,175,55,.12)" : "rgba(56,189,248,.12)", color: record.account_mode === "live" ? GOLD : "#38bdf8" }}>{record.account_mode === "live" ? "실계좌" : "모의"}</span>
                  <span className="rounded px-1.5 py-0.5 text-[9px] font-bold text-primary/80 bg-primary/10">{record.signal_type || "-"}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                  <span>진입 <b className="text-foreground/70">{number(Number(record.entry_price))}원</b></span>
                  <span>{priceLabel} <b style={{ color: record.roi >= 0 ? UP : DOWN }}>{record.currentPrice ? `${number(record.currentPrice)}원` : "대기 중"}</b></span>
                  <span>수량 <b className="text-foreground/70">{number(Number(record.quantity))}주</b></span>
                  <span>투입 <b className="text-foreground/70">{number(Number(record.invested_amount))}원</b></span>
                  <span>거래량 <b className="text-foreground/70">{number(Number(record.volume ?? 0))}</b></span>
                  <span>{time}</span>
                </div>
              </div>
              <div className="flex shrink-0 items-end justify-between gap-4 md:flex-col md:items-end md:gap-0">
                {record.status === "skipped" ? <span className="text-[10px] font-bold text-amber-400">{record.skip_reason === "price_over_50000" ? "5만원 초과 제외" : "기록 제외"}</span> : <p className="text-sm font-black tabular-nums" style={{ color: record.roi >= 0 ? UP : DOWN }}>{record.roi >= 0 ? "+" : ""}{record.roi.toFixed(2)}%</p>}
                <p className="text-[10px] tabular-nums text-muted-foreground">{record.pnl >= 0 ? "+" : ""}{number(record.pnl)}원</p>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
