"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { RefreshCw } from "lucide-react"
import { getKoreaStockName } from "@/lib/korea-stock-list"

const GOLD = "#d4af37"
const UP = "#22c55e"
const DOWN = "#ef4444"

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
  sell_order_sent_at: string | null
  sell_order_result: { ok?: boolean; error?: string | null } | null
}

type Quote = { symbolName: string | null; price: number; changePercent: number | null; volume: number | null; tradedAt: string | null }
type AccountFilter = "all" | "live" | "test"

function tokenHeaders(json = false): HeadersInit {
  const token = typeof window === "undefined" ? "" : localStorage.getItem("app_token") ?? ""
  return { ...(json ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${token}` }
}

const number = (value: number, digits = 0) => value.toLocaleString("ko-KR", { maximumFractionDigits: digits })
const quoteSymbol = (value: string) => value.toUpperCase().match(/(?:KRX:|KOSDAQ:|A)?(\d{6})/)?.[1] ?? value.replace(/\D/g, "").slice(0, 6)

export default function AutoSignal3Panel({ selectedDate, searchQ = "" }: { selectedDate: Date; searchQ?: string }) {
  const [records, setRecords] = useState<Record3[]>([])
  const [quotes, setQuotes] = useState<Record<string, Quote>>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [accountFilter, setAccountFilter] = useState<AccountFilter>("all")
  const [sellingId, setSellingId] = useState<string | null>(null)
  const [sellingBatch, setSellingBatch] = useState<string | null>(null)
  const loadingRef = useRef(false)
  const initialQuoteRequestRef = useRef(true)

  const dateKey = `${selectedDate.getFullYear()}-${String(selectedDate.getMonth() + 1).padStart(2, "0")}-${String(selectedDate.getDate()).padStart(2, "0")}`
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
  const isToday = dateKey === today

  const load = useCallback(async () => {
    if (loadingRef.current) return
    const token = typeof window === "undefined" ? "" : localStorage.getItem("app_token") ?? ""
    if (!token) {
      setMessage("로그인 세션을 확인할 수 없습니다. 페이지를 새로고침해 주세요.")
      setLoading(false)
      return
    }
    loadingRef.current = true
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15_000)
    try {
      const response = await fetch(`/api/auto-trading3/records?date=${encodeURIComponent(dateKey)}`, { credentials: "include", headers: tokenHeaders(), signal: controller.signal })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "자동매매3 조회 실패")
      const nextRecords: Record3[] = data.records ?? []
      setRecords(nextRecords)
      if (isToday) {
        const symbolsByMode = new Map<string, string[]>()
        nextRecords.filter(record => record.status !== "skipped" && record.status !== "quote_failed" && (accountFilter === "all" || record.account_mode === accountFilter)).forEach(record => {
          const symbol = quoteSymbol(record.symbol)
          const symbols = symbolsByMode.get(record.account_mode) ?? []
          if (symbol && !symbols.includes(symbol)) symbols.push(symbol)
          symbolsByMode.set(record.account_mode, symbols)
        })
        const batches = await Promise.all([...symbolsByMode.entries()].map(async ([mode, symbols]) => {
          const params = new URLSearchParams({ mode, symbols: symbols.join(",") })
          if (initialQuoteRequestRef.current) params.set("fallback", "1")
          const quoteResponse = await fetch(`/api/auto-trading3/quote?${params}`, { credentials: "include", headers: tokenHeaders(), signal: controller.signal })
          const quoteData = await quoteResponse.json()
          return quoteResponse.ok ? Object.entries(quoteData.quotes ?? {}).map(([symbol, quote]) => [`${mode}:${symbol}`, quote as Quote] as const) : []
        }))
        setQuotes(previous => ({ ...previous, ...Object.fromEntries(batches.flat()) }))
        initialQuoteRequestRef.current = false
      } else {
        setQuotes({})
      }
      setMessage(null)
    } catch (error) {
      setMessage(error instanceof DOMException && error.name === "AbortError" ? "자동매매3 조회 시간이 초과되었습니다. 새로고침해 주세요." : error instanceof Error ? error.message : "자동매매3 조회 실패")
    } finally {
      window.clearTimeout(timeout)
      loadingRef.current = false
      setLoading(false)
    }
  }, [accountFilter, dateKey, isToday])

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

  const rows = useMemo(() => records.filter(record => accountFilter === "all" || record.account_mode === accountFilter).map(record => {
    const currentPrice = isToday ? quotes[`${record.account_mode}:${quoteSymbol(record.symbol)}`]?.price ?? 0 : Number(record.close_price ?? 0)
    const active = record.status !== "skipped" && record.status !== "quote_failed" && currentPrice > 0 && Number(record.quantity) > 0
    const evaluated = active ? Number(record.quantity) * currentPrice : Number(record.invested_amount)
    const pnl = evaluated - Number(record.invested_amount)
    const roi = Number(record.invested_amount) > 0 ? pnl / Number(record.invested_amount) * 100 : 0
    return { ...record, currentPrice, evaluated, pnl, roi }
  }).filter(record => !searchQ || `${record.symbol} ${record.symbol_name ?? ""}`.toLowerCase().includes(searchQ.toLowerCase())), [accountFilter, isToday, quotes, records, searchQ])

  const groupedRows = useMemo(() => {
    const groups = new Map<string, typeof rows>()
    rows.forEach(record => {
      const group = groups.get(record.symbol) ?? []
      group.push(record)
      groups.set(record.symbol, group)
    })
    return [...groups.entries()]
  }, [rows])

  const included = rows.filter(record => record.status !== "skipped" && record.status !== "quote_failed")
  const invested = included.reduce((sum, record) => sum + Number(record.invested_amount), 0)
  const evaluated = included.reduce((sum, record) => sum + record.evaluated, 0)
  const pnl = evaluated - invested
  const roi = invested > 0 ? pnl / invested * 100 : 0
  const profitCount = included.filter(record => record.roi > 0).length
  const lossCount = included.filter(record => record.roi < 0).length
  const sellableRecords = records.filter(record =>
    record.status !== "skipped" &&
    record.status !== "quote_failed" &&
    Number(record.quantity) > 0 &&
    (!record.sell_order_sent_at || record.sell_order_result?.ok === false)
  )

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

  const sellRecord = async (record: Record3) => {
    if (sellingId || sellingBatch) return
    const label = `${record.symbol} ${getKoreaStockName(record.symbol) || record.symbol_name || ""} (${record.account})`
    if (!window.confirm(`${label} 종목을 시장가로 즉시 매도 주문합니다. 진행할까요?`)) return
    setSellingId(record.id)
    setMessage(null)
    try {
      const response = await fetch("/api/auto-trading3/sell-order", { method: "POST", credentials: "include", headers: tokenHeaders(true), body: JSON.stringify({ id: record.id }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "매도 주문 전송 실패")
      setMessage(`${label} 매도 주문을 전송했습니다.`)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "매도 주문 전송 실패")
    } finally {
      setSellingId(null)
    }
  }

  const sellBatch = async (scope: "all" | string) => {
    if (sellingId || sellingBatch) return
    const targets = scope === "all" ? sellableRecords : sellableRecords.filter(record => record.symbol === scope)
    if (targets.length === 0) {
      setMessage("매도할 수 있는 미전송 포지션이 없습니다.")
      return
    }
    const symbolName = scope === "all" ? "전체" : `${scope} ${getKoreaStockName(scope) || targets[0]?.symbol_name || ""}`.trim()
    const description = scope === "all"
      ? `계좌와 종목에 관계없이 ${targets.length}개 포지션을 모두 시장가로 매도 주문합니다.`
      : `${symbolName}의 모든 계좌 포지션 ${targets.length}건을 시장가로 매도 주문합니다.`
    if (!window.confirm(`${description}\n이 작업은 되돌릴 수 없습니다. 진행할까요?`)) return

    setSellingBatch(scope)
    setMessage(null)
    try {
      const response = await fetch("/api/auto-trading3/sell-order", {
        method: "POST",
        credentials: "include",
        headers: tokenHeaders(true),
        body: JSON.stringify({ ids: targets.map(record => record.id) }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error ?? "일괄 매도 주문 전송 실패")
      setMessage(`${symbolName} 매도 주문: ${data.succeeded ?? 0}건 성공${data.failed ? `, ${data.failed}건 실패` : ""}`)
      await load()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "일괄 매도 주문 전송 실패")
    } finally {
      setSellingBatch(null)
    }
  }

  if (loading) return <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">불러오는 중...</div>

  return (
    <section aria-label="자동매매3 UP6 국내주식 기록">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/10 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          {isToday && <span className="size-1.5 rounded-full bg-emerald-500 motion-safe:animate-pulse" aria-hidden="true" />}
          <strong className="text-[11px] text-primary">자동매매3</strong>
          <span className="text-[9px] text-muted-foreground">수신 signal_type �� 국내주식</span>
          <span className="text-[11px] text-foreground/60">{selectedDate.getMonth() + 1}월 {selectedDate.getDate()}일</span>
          <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">{isToday ? "실시간" : "종가 기준"}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] text-muted-foreground">수익 <b style={{ color: UP }}>{profitCount}</b>{" / "}손실 <b style={{ color: DOWN }}>{lossCount}</b></span>
          <button type="button" onClick={() => void load()} className="flex h-7 items-center gap-1 rounded-md border border-border px-2 text-[10px] text-muted-foreground transition-colors hover:text-foreground"><RefreshCw className="size-3" />새로고침</button>
          {isToday && <button type="button" onClick={saveCloses} disabled={saving} className="h-7 rounded-md bg-primary px-2.5 text-[10px] font-bold text-primary-foreground disabled:opacity-50">{saving ? "저장 중" : "당일 종가 저장"}</button>}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-primary/10 px-4 py-2.5" role="group" aria-label="계좌 유형 필터">
        <span className="mr-1 text-[10px] text-muted-foreground">계좌</span>
        {([[
          "all", "전체"
        ], ["live", "실계좌"], ["test", "모의계좌"]] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={accountFilter === value}
            onClick={() => setAccountFilter(value)}
            className={`rounded-md border px-2.5 py-1 text-[10px] font-semibold transition-colors ${accountFilter === value ? "border-primary/50 bg-primary/15 text-primary" : "border-border text-muted-foreground hover:border-primary/30 hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
        <span className="ml-auto text-[10px] text-muted-foreground">{rows.length}건</span>
      </div>

      {message && <p className="border-b border-border px-4 py-2 text-[10px] text-muted-foreground">{message}</p>}

      <div className="grid grid-cols-2 border-b border-primary/10 md:grid-cols-4">
        {[
          ["투입금액", invested, "원"], ["평가금액", evaluated, "원"], ["TOTAL PNL", pnl, "원"], ["TOTAL ROI", roi, "%"],
        ].map(([label, value, suffix], index) => (
          <div key={String(label)} className="border-b border-r border-primary/10 px-4 py-3 md:border-b-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[9px] font-semibold text-muted-foreground">{label}</p>
              {index === 3 && (
                <button
                  type="button"
                  onClick={() => void sellBatch("all")}
                  disabled={Boolean(sellingId || sellingBatch) || sellableRecords.length === 0}
                  className="min-w-24 rounded-md border border-red-500/60 bg-red-500/15 px-4 py-2 text-xs font-black text-red-400 shadow-sm shadow-red-950/20 transition-colors hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {sellingBatch === "all" ? "전송 중..." : `일괄매도${sellableRecords.length > 0 ? ` ${sellableRecords.length}` : ""}`}
                </button>
              )}
            </div>
            <p className="mt-1 text-sm font-black tabular-nums" style={{ color: index >= 2 ? (Number(value) >= 0 ? UP : DOWN) : GOLD }}>{index === 3 ? Number(value).toFixed(2) : number(Number(value))}<span className="ml-1 text-[9px] font-medium text-muted-foreground">{suffix}</span></p>
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-px bg-primary/10">
        {rows.length === 0 && <div className="bg-background py-10 text-center text-xs text-muted-foreground">선택한 날짜의 UP6 기록이 없습니다.</div>}
        {groupedRows.map(([symbol, group]) => {
          const groupSellableCount = sellableRecords.filter(record => record.symbol === symbol).length
          return (
            <section key={symbol} aria-label={`${symbol} 포지션 그룹`} className="bg-background">
              {group.map((record, index) => {
                const priceLabel = isToday ? "현재" : "종가"
                const time = new Date(record.signal_time).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", second: "2-digit" })
                return (
                  <article key={record.id} className="flex flex-col gap-2 border-b border-border/70 px-4 py-3 transition-colors last:border-b-0 hover:bg-muted/20 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm text-foreground">{record.symbol}</strong>
                        <span className="text-[11px] font-medium text-muted-foreground">{getKoreaStockName(record.symbol) || record.symbol_name || "종목명 확인 중"}</span>
                        <span className="rounded px-1.5 py-0.5 text-[9px] font-bold" style={{ background: record.account_mode === "live" ? "rgba(212,175,55,.12)" : "rgba(56,189,248,.12)", color: record.account_mode === "live" ? GOLD : "#38bdf8" }}>{record.account_mode === "live" ? "실계좌" : "모의"}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">{record.account}</span>
                        <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-bold text-primary/80">{record.signal_type || "-"}</span>
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
                    <div className="flex shrink-0 items-center gap-3 md:items-end">
                      <div className="flex flex-col items-end gap-0">
                        {record.status === "skipped" ? (
                          <span className="text-[10px] font-bold text-amber-400">{record.skip_reason === "price_over_50000" ? "5만원 초과 제외" : "기록 제외"}</span>
                        ) : record.status === "quote_failed" ? (
                          <span className="text-[10px] font-bold text-amber-400" title={record.skip_reason ?? undefined}>시세 조회 실패</span>
                        ) : (
                          <p className="text-sm font-black tabular-nums" style={{ color: record.roi >= 0 ? UP : DOWN }}>{record.roi >= 0 ? "+" : ""}{record.roi.toFixed(2)}%</p>
                        )}
                        <p className="text-[10px] tabular-nums text-muted-foreground">{record.pnl >= 0 ? "+" : ""}{number(record.pnl)}원</p>
                      </div>
                      {record.status !== "skipped" && record.status !== "quote_failed" && (
                        <div className="flex flex-col items-end gap-1">
                          {record.sell_order_sent_at && (
                            record.sell_order_result?.ok === false ? (
                              <span className="shrink-0 rounded bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-400" title={record.sell_order_result?.error ?? undefined}>매도 전송 실패</span>
                            ) : (
                              <span className="shrink-0 rounded bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-500">매도 주문 전송됨</span>
                            )
                          )}
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => void sellRecord(record)}
                              disabled={Boolean(sellingId || sellingBatch)}
                              className="shrink-0 rounded border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-[11px] font-bold text-red-400 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              {sellingId === record.id ? "전송 중..." : record.sell_order_sent_at ? "재시도" : "매도"}
                            </button>
                            {index === 0 && (
                              <button
                                type="button"
                                onClick={() => void sellBatch(symbol)}
                                disabled={Boolean(sellingId || sellingBatch) || groupSellableCount === 0}
                                className="flex min-w-28 shrink-0 flex-col items-center rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-1.5 font-bold text-amber-400 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <span className="text-[11px] leading-tight">{sellingBatch === symbol ? "전송 중..." : "그룹매도"}</span>
                                <span className="mt-0.5 max-w-32 truncate text-[9px] font-medium leading-tight text-amber-300/70">
                                  {symbol} {getKoreaStockName(symbol) || group[0]?.symbol_name || ""}
                                </span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                )
              })}
            </section>
          )
        })}
      </div>
    </section>
  )
}
