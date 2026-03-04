"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, Wifi, WifiOff } from "lucide-react"
import { createChart, ColorType } from "lightweight-charts"

interface CandleData {
  time: number
  open: number
  high: number
  low: number
  close: number
}

interface TickerData {
  price: number
  change: number
  changePercent: number
  high: number
  low: number
  volume: number
  quoteAssetVolume: number
}

type Interval = "1s" | "30s" | "1m" | "1h" | "1d"

const INTERVAL_CONFIG: Record<Interval, { label: string; binance: string; limit: number; seconds: number }> = {
  "1s":  { label: "1초",   binance: "1m",  limit: 60,  seconds: 1 },
  "30s": { label: "30초",  binance: "1m",  limit: 60,  seconds: 30 },
  "1m":  { label: "1분",   binance: "1m",  limit: 200, seconds: 60 },
  "1h":  { label: "1시간", binance: "1h",  limit: 168, seconds: 3600 },
  "1d":  { label: "1일",   binance: "1d",  limit: 365, seconds: 86400 },
}

const INTERVALS: Interval[] = ["1s", "30s", "1m", "1h", "1d"]

function formatQuoteVolume(usd: number): string {
  const krw = usd * 1400
  if (krw >= 1_000_000_000_000) {
    const jo = Math.floor(krw / 1_000_000_000_000)
    const rem = krw % 1_000_000_000_000
    const eok = Math.round(rem / 100_000_000)
    return eok > 0 ? `${jo}조 ${eok}억` : `${jo}조`
  }
  if (krw >= 100_000_000) return Math.round(krw / 100_000_000) + "억"
  if (krw >= 10_000) return (krw / 10_000).toFixed(0) + "만"
  return krw.toLocaleString() + "원"
}

export function BitcoinChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null)
  const seriesRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const tickerWsRef = useRef<WebSocket | null>(null)
  const candleMapRef = useRef<Map<number, CandleData>>(new Map())
  // 30초봉 전용: aggTrade 버퍼
  const tradeBufferRef = useRef<Array<{ price: number; quantity: number; time: number }>>([])
  const secondTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // 거래대금 집계 버퍼 (30초 버킷 단위 USD)
  const volumeBufferRef = useRef<Map<number, number>>(new Map())

  const [ticker, setTicker] = useState<TickerData | null>(null)
  const [connected, setConnected] = useState(false)
  const [interval, setIntervalState] = useState<Interval>("1s")
  const [aggVolumes, setAggVolumes] = useState({ "1m": 0, "1h": 0, "1d": 0 })
  const [closingPrices, setClosingPrices] = useState<Array<{ time: number; price: number }>>([])
  const prevBucketRef = useRef<number | null>(null)

  // closingPrices를 window 객체에 저장해서 다른 컴포넌트에서 접근 가능하게
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__bitcoinClosingPrices = closingPrices
    }
  }, [closingPrices])

  // 초기 캔들 데이터 로드
  const fetchInitialCandles = useCallback(async (sel: Interval): Promise<CandleData[]> => {
    const cfg = INTERVAL_CONFIG[sel]
    try {
      const res = await fetch(
        `https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=${cfg.binance}&limit=${cfg.limit}`
      )
      const data: any[][] = await res.json()
      const candles: CandleData[] = data.map((k) => ({
        time:  Math.floor(k[0] / 1000),
        open:  parseFloat(k[1]),
        high:  parseFloat(k[2]),
        low:   parseFloat(k[3]),
        close: parseFloat(k[4]),
      }))
      candleMapRef.current.clear()
      candles.forEach((c) => candleMapRef.current.set(c.time, c))
      return candles
    } catch {
      return []
    }
  }, [])

  // 차트 초기화 (interval 변경 시 재생성)
  useEffect(() => {
    if (!chartContainerRef.current) return

    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
      seriesRef.current = null
    }

    const container = chartContainerRef.current
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { color: "rgba(156,163,175,0.1)" },
        horzLines: { color: "rgba(156,163,175,0.1)" },
      },
      crosshair: {
        vertLine: { color: "rgba(156,163,175,0.5)", labelBackgroundColor: "#1f2937" },
        horzLine: { color: "rgba(156,163,175,0.5)", labelBackgroundColor: "#1f2937" },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: interval === "1s" || interval === "30s",
      },
      handleScroll: true,
      handleScale: true,
    })

    chartRef.current = chart

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e", downColor: "#ef4444",
      borderUpColor: "#22c55e", borderDownColor: "#ef4444",
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    })
    seriesRef.current = candleSeries

    const resizeObserver = new ResizeObserver(() => {
      if (chartRef.current && container) {
        chartRef.current.applyOptions({ width: container.clientWidth })
      }
    })
    resizeObserver.observe(container)

    fetchInitialCandles(interval).then((candles) => {
      if (candles.length > 0 && seriesRef.current) {
        seriesRef.current.setData(candles)
        chartRef.current?.timeScale().fitContent()
      }
    })

    return () => {
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [interval, fetchInitialCandles])

  // 1초봉 / 30초봉: aggTrade WebSocket
  useEffect(() => {
    if (interval !== "1s" && interval !== "30s") return

    const bucketSize = interval === "1s" ? 1 : 30

    const connect = () => {
      const ws = new WebSocket("wss://fstream.binance.com/ws/btcusdt@aggTrade")
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        tradeBufferRef.current.push({
          price:    parseFloat(msg.p),
          quantity: parseFloat(msg.q),
          time:     Math.floor(msg.T / 1000),
        })
      }
      ws.onerror = () => setConnected(false)
      ws.onclose = () => { setConnected(false); setTimeout(connect, 3000) }
    }
    connect()

    // 버킷 단위로 캔들 집계
    const processCandle = () => {
      const now = Math.floor(Date.now() / 1000)
      const bucket = now - (now % bucketSize)
      const trades = tradeBufferRef.current.filter((t) => t.time >= bucket)
      if (trades.length === 0) return

      const prices = trades.map((t) => t.price)
      const closingPrice = prices[prices.length - 1]
      
      const candle: CandleData = {
        time:  bucket,
        open:  prices[0],
        high:  Math.max(...prices),
        low:   Math.min(...prices),
        close: closingPrice,
      }
      candleMapRef.current.set(bucket, candle)
      seriesRef.current?.update(candle)

      // 30초마다 마감 가격 기록 (모든 인터벌에서)
      const thirtySecBucket = now - (now % 30)
      if (prevBucketRef.current === null || thirtySecBucket !== prevBucketRef.current) {
        prevBucketRef.current = thirtySecBucket
        setClosingPrices((prev) => {
          const updated = [...prev, { time: thirtySecBucket, price: closingPrice }]
          return updated.slice(-100) // 최근 100개만 유지
        })
      }

      const qv = trades.reduce((s, t) => s + t.price * t.quantity, 0)
      volumeBufferRef.current.set(bucket, qv)

      const cutoff = now - 86400
      tradeBufferRef.current = tradeBufferRef.current.filter((t) => t.time >= cutoff)
    }

    secondTimerRef.current = setInterval(processCandle, 1000)

    return () => {
      wsRef.current?.close()
      if (secondTimerRef.current) clearInterval(secondTimerRef.current)
    }
  }, [interval])

  // kline WebSocket (1m, 1h, 1d)
  useEffect(() => {
    if (interval === "1s" || interval === "30s") return
    const cfg = INTERVAL_CONFIG[interval]

    const connect = () => {
      const ws = new WebSocket(`wss://fstream.binance.com/ws/btcusdt@kline_${cfg.binance}`)
      wsRef.current = ws
      ws.onopen = () => setConnected(true)
      ws.onmessage = (e) => {
        const k = JSON.parse(e.data).k
        const candle: CandleData = {
          time:  Math.floor(k.t / 1000),
          open:  parseFloat(k.o),
          high:  parseFloat(k.h),
          low:   parseFloat(k.l),
          close: parseFloat(k.c),
        }
        candleMapRef.current.set(candle.time, candle)
        seriesRef.current?.update(candle)
      }
      ws.onerror = () => setConnected(false)
      ws.onclose = () => { setConnected(false); setTimeout(connect, 3000) }
    }
    connect()

    return () => { wsRef.current?.close() }
  }, [interval])

  // 티커 WebSocket (현재가 + 거래대금 집계)
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket("wss://fstream.binance.com/ws/btcusdt@ticker")
      tickerWsRef.current = ws
      ws.onmessage = (e) => {
        const d = JSON.parse(e.data)
        const totalQuoteUSD = parseFloat(d.q)
        const now = Math.floor(Date.now() / 1000)

        const sumVol = (seconds: number) =>
          Array.from(volumeBufferRef.current.entries())
            .filter(([t]) => t > now - seconds)
            .reduce((s, [, v]) => s + v, 0)

        setAggVolumes({
          "1m":  sumVol(60),
          "1h":  sumVol(3600),
          "1d":  totalQuoteUSD,
        })

        setTicker({
          price:            parseFloat(d.c),
          change:           parseFloat(d.p),
          changePercent:    parseFloat(d.P),
          high:             parseFloat(d.h),
          low:              parseFloat(d.l),
          volume:           parseFloat(d.v),
          quoteAssetVolume: totalQuoteUSD,
        })
      }
      ws.onerror = () => {}
      ws.onclose = () => setTimeout(connect, 3000)
    }
    connect()
    return () => { tickerWsRef.current?.close() }
  }, [])

  const isPositive = (ticker?.changePercent ?? 0) >= 0

  return (
    <Card className="p-5 bg-background border border-border/60">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-4 mb-3">
        {/* 왼쪽: 로고 + 제목 */}
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <img 
            src="/bitcoin-logo.png" 
            alt="Bitcoin" 
            className="w-10 h-10 shrink-0"
          />
          <div>
            <p className="text-xs font-bold text-muted-foreground leading-tight">배팅 기준가</p>
            <span className={`flex items-center gap-1 text-[10px] font-medium ${connected ? "text-emerald-500" : "text-muted-foreground"}`}>
              {connected
                ? <><Wifi className="w-3 h-3" />LIVE</>
                : <><WifiOff className="w-3 h-3" />연결 중...</>}
            </span>
            <p className="text-xs text-muted-foreground">선물 실시간</p>
          </div>
        </div>

        {/* 중앙: 인터벌 버튼 */}
        <div className="flex items-center gap-1 justify-center flex-1">
          {INTERVALS.map((btn) => (
            <Button
              key={btn}
              variant={interval === btn ? "default" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => {
                candleMapRef.current.clear()
                tradeBufferRef.current = []
                setIntervalState(btn)
              }}
            >
              {INTERVAL_CONFIG[btn].label}
            </Button>
          ))}
        </div>

        {/* 오른쪽: 현재가 */}
        <div className="text-right flex-1">
          {ticker ? (
            <>
              <p className="text-xs text-muted-foreground font-medium mb-1">현재가</p>
              <p className="text-xl font-bold text-foreground tabular-nums leading-tight">
                ${ticker.price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </p>
              <div className={`flex items-center justify-end gap-1 text-xs font-semibold ${isPositive ? "text-emerald-500" : "text-red-500"}`}>
                {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                <span>{isPositive ? "+" : ""}{ticker.changePercent.toFixed(2)}%</span>
                <span className="text-muted-foreground font-normal">
                  ({isPositive ? "+" : ""}${ticker.change.toFixed(1)})
                </span>
              </div>
            </>
          ) : (
            <span className="text-sm text-muted-foreground animate-pulse">로딩 중...</span>
          )}
        </div>
      </div>

      {/* 보조 지표 */}
      {ticker && (
        <div className="flex items-center gap-6 mb-3 text-xs text-muted-foreground flex-wrap">
          <span>고가 <span className="text-foreground font-medium">${ticker.high.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span></span>
          <span>저가 <span className="text-foreground font-medium">${ticker.low.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span></span>
          <span>
            거래량 <span className="text-foreground font-medium">{ticker.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })} BTC</span>
          </span>
          <span>
            거래대금 <span className="text-foreground font-medium">{formatQuoteVolume(ticker.quoteAssetVolume)}</span>
          </span>
        </div>
      )}

      {/* 30초 마감 가격 기록 */}
      {closingPrices.length > 0 && (
        <div className="mb-3 p-3 bg-muted/50 rounded-lg">
          <p className="text-xs font-medium text-muted-foreground mb-2">30초 마감 기준가 (최근 10개)</p>
          <div className="flex items-center gap-2 flex-wrap">
            {closingPrices.slice(-10).reverse().map((item, idx) => {
              const isUp = idx % 2 === 0
              return (
                <span key={idx} className={`text-xs px-2 py-1 rounded border ${isUp ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"}`}>
                  <span className="text-muted-foreground text-[10px]">{new Date(item.time * 1000).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                  <span className="text-foreground font-medium ml-1">${item.price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}</span>
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* 차트 */}
      <div ref={chartContainerRef} className="w-full h-64 rounded-lg overflow-hidden" />
    </Card>
  )
}
