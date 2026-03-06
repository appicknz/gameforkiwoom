"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown } from "lucide-react"
import { createChart, ColorType, type IChartApi, type ISeriesApi } from "lightweight-charts"
import { usePriceWorker } from "@/hooks/use-price-worker"

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

const INTERVAL_CONFIG: Record<Interval, { label: string; binance: string; limit: number }> = {
  "1s":  { label: "1초",   binance: "1s", limit: 44 },
  "30s": { label: "30초",  binance: "1s", limit: 200 },
  "1m":  { label: "1분",   binance: "1m", limit: 200 },
  "1h":  { label: "1시간", binance: "1h", limit: 168 },
  "1d":  { label: "1일",   binance: "1d", limit: 365 },
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
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const priceLineRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const tickerWsRef = useRef<WebSocket | null>(null)
  const candleMapRef = useRef<Map<number, CandleData>>(new Map())

  const [ticker, setTicker] = useState<TickerData | null>(null)
  const [interval, setIntervalState] = useState<Interval>("1s")
  const [closingPrices, setClosingPrices] = useState<Array<{ time: number; price: number }>>([])
  const [lastCandlePrice, setLastCandlePrice] = useState<number | null>(null)
  const [connected, setConnected] = useState(false)

  // 배팅 기준가 수평선
  useEffect(() => {
    if (!seriesRef.current || closingPrices.length === 0) return
    const latestPrice = closingPrices[closingPrices.length - 1].price
    if (priceLineRef.current) {
      try { seriesRef.current.removePriceLine(priceLineRef.current) } catch {}
    }
    priceLineRef.current = seriesRef.current.createPriceLine({
      price: latestPrice,
      color: "#facc15",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "배팅가",
    })
  }, [closingPrices])

  // 차트 + WebSocket 초기화 (interval 변경 시 재실행)
  useEffect(() => {
    if (!containerRef.current) return

    // 이전 차트 제거
    if (chartRef.current) {
      chartRef.current.remove()
      chartRef.current = null
      seriesRef.current = null
    }
    wsRef.current?.close(1000)
    wsRef.current = null
    candleMapRef.current.clear()

    let cancelled = false
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null

    const container = containerRef.current
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#9ca3af",
        fontFamily: "inherit",
      },
      width: container.clientWidth,
      height: container.clientHeight,
      grid: {
        vertLines: { color: "rgba(156,163,175,0.08)" },
        horzLines: { color: "rgba(156,163,175,0.08)" },
      },
      crosshair: {
        vertLine: { color: "rgba(156,163,175,0.5)", labelBackgroundColor: "#1f2937" },
        horzLine: { color: "rgba(156,163,175,0.5)", labelBackgroundColor: "#1f2937" },
      },
      rightPriceScale: {
        autoScale: true,
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: interval === "1s" || interval === "30s",
        shiftVisibleRangeOnNewBar: true,
        rightOffset: 5,
      },
      handleScroll: true,
      handleScale: true,
      localization: {
        priceFormatter: (p: number) => (Math.floor(p * 10) / 10).toString(),
      },
    })
    chartRef.current = chart

    const series = chart.addCandlestickSeries({
      upColor: "#22c55e", downColor: "#ef4444",
      borderUpColor: "#22c55e", borderDownColor: "#ef4444",
      wickUpColor: "#22c55e", wickDownColor: "#ef4444",
    })
    seriesRef.current = series

    // kline_1s WS — Binance에서 OHLC 직접 수신
    const startWS = () => {
      if (cancelled) return
      const wsInterval = interval === "1s" || interval === "30s" ? "1s" : INTERVAL_CONFIG[interval].binance
      const url = `wss://stream.binance.com:9443/ws/btcusdt@kline_${wsInterval}`
      const ws = new WebSocket(url)
      wsRef.current = ws

      ws.onopen = () => { if (!cancelled) setConnected(true) }

      ws.onmessage = (e) => {
        if (cancelled || !seriesRef.current) return
        const k = JSON.parse(e.data).k
        const closePrice = parseFloat(k.c)
        const kOpenTimeSec = Math.floor(k.t / 1000)

        if (interval === "30s") {
          // 30초 버킷 집계
          const bucket = kOpenTimeSec - (kOpenTimeSec % 30)
          const existing = candleMapRef.current.get(bucket)
          const candle: CandleData = {
            time: bucket,
            open:  existing?.open ?? parseFloat(k.o),
            high:  existing ? Math.max(existing.high, parseFloat(k.h)) : parseFloat(k.h),
            low:   existing ? Math.min(existing.low,  parseFloat(k.l)) : parseFloat(k.l),
            close: closePrice,
          }
          candleMapRef.current.set(bucket, candle)
          seriesRef.current.update(candle)
        } else {
          // 1s / 1m / 1h / 1d: Binance OHLC 그대로
          const candle: CandleData = {
            time:  kOpenTimeSec,
            open:  parseFloat(k.o),
            high:  parseFloat(k.h),
            low:   parseFloat(k.l),
            close: closePrice,
          }
          candleMapRef.current.set(candle.time, candle)
          seriesRef.current.update(candle)
        }

        setLastCandlePrice(closePrice)
      }

      ws.onerror = () => { if (!cancelled) setConnected(false) }
      ws.onclose = (e) => {
        if (!cancelled) setConnected(false)
        if (!cancelled && e.code !== 1000) {
          reconnectTimer = setTimeout(startWS, 5000)
        }
      }
    }

    // 초기 캔들 로드 후 WS 시작
    const loadInitial = async () => {
      try {
        const cfg = INTERVAL_CONFIG[interval]
        // spot API — CORS 허용, futures와 동일 가격
        const res = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${cfg.binance}&limit=${cfg.limit}`
        )
        if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
        const data = await res.json()
        if (cancelled) return

        let candles: CandleData[] = data.map((c: any) => ({
          time:  Math.floor(c[0] / 1000),
          open:  parseFloat(c[1]),
          high:  parseFloat(c[2]),
          low:   parseFloat(c[3]),
          close: parseFloat(c[4]),
        }))

        // 30초 인터벌: 1s 캔들을 30초 버킷으로 집계
        if (interval === "30s") {
          const bucketMap = new Map<number, CandleData>()
          for (const c of candles) {
            const bucket = c.time - (c.time % 30)
            const ex = bucketMap.get(bucket)
            bucketMap.set(bucket, {
              time:  bucket,
              open:  ex?.open ?? c.open,
              high:  ex ? Math.max(ex.high, c.high) : c.high,
              low:   ex ? Math.min(ex.low,  c.low)  : c.low,
              close: c.close,
            })
          }
          candles = Array.from(bucketMap.values()).sort((a, b) => a.time - b.time)
        }

        candleMapRef.current.clear()
        candles.forEach((c) => candleMapRef.current.set(c.time, c))

        if (seriesRef.current) {
          seriesRef.current.setData(candles)
          chart.timeScale().scrollToRealTime()
          if (candles.length > 0) {
            setLastCandlePrice(candles[candles.length - 1].close)
          }
        }
      } catch {
        // 히스토리 없이 WS만 연결
      } finally {
        if (!cancelled) startWS()
      }
    }

    loadInitial()

    // 리사이즈 대응
    const resizeObserver = new ResizeObserver(() => {
      if (chartRef.current && container) {
        chartRef.current.applyOptions({ width: container.clientWidth })
      }
    })
    resizeObserver.observe(container)

    return () => {
      cancelled = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      resizeObserver.disconnect()
      wsRef.current?.close(1000)
      wsRef.current = null
      seriesRef.current = null
      priceLineRef.current = null
      chartRef.current = null
      chart.remove()
    }
  }, [interval])

  // Price Server — 배팅 기준가 수신
  usePriceWorker({
    onConnected: useCallback(() => {}, []),
    onDisconnected: useCallback(() => {}, []),
    onInitClosing: useCallback((prices) => {
      setClosingPrices(prices)
    }, []),
    onPrice: useCallback(() => {}, []),
    onClosingPrice: useCallback((price, time) => {
      setClosingPrices((prev) => {
        const last = prev[prev.length - 1]
        if (last?.time === time) return prev
        return [...prev, { time, price }].slice(-100)
      })
    }, []),
  })

  // 티커 WebSocket (변동률 + 거래대금)
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket("wss://fstream.binance.com/ws/btcusdt@ticker")
      tickerWsRef.current = ws
      ws.onmessage = (e) => {
        const d = JSON.parse(e.data)
        setTicker({
          price:            parseFloat(d.c),
          change:           parseFloat(d.p),
          changePercent:    parseFloat(d.P),
          high:             parseFloat(d.h),
          low:              parseFloat(d.l),
          volume:           parseFloat(d.v),
          quoteAssetVolume: parseFloat(d.q),
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
    <Card className="p-4 bg-background border border-border/60">
      {/* 헤더: 배팅 기준가(왼) + 현재가(오) */}
      <div className="flex items-start justify-between gap-2 mb-[6px]">
        <div className="flex items-start gap-2.5 min-w-0">
          <img src="/bitcoin-logo.png" alt="Bitcoin" className="w-9 h-9 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] text-muted-foreground leading-tight">배팅 기준가</p>
            <p className="text-sm font-bold text-foreground tabular-nums truncate">
              ${closingPrices.length > 0
                ? closingPrices[closingPrices.length - 1].price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                : "로딩 중..."}
            </p>
            <div className="flex items-center gap-0.5 mt-0.5">
              {INTERVALS.map((btn) => (
                <Button
                  key={btn}
                  variant={interval === btn ? "default" : "ghost"}
                  size="sm"
                  className="h-5 px-1.5 text-[10px]"
                  onClick={() => setIntervalState(btn)}
                >
                  {INTERVAL_CONFIG[btn].label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="shrink-0 text-right">
          {lastCandlePrice ? (
            <>
              <p className="text-[11px] text-muted-foreground font-medium mb-0.5">현재가</p>
              <p className="text-sm font-bold text-foreground tabular-nums leading-tight">
                ${lastCandlePrice.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </p>
              {ticker && (
                <div className={`flex items-center justify-end gap-0.5 text-[11px] font-semibold mt-0.5 ${isPositive ? "text-emerald-500" : "text-red-500"}`}>
                  {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  <span>{isPositive ? "+" : ""}{ticker.changePercent.toFixed(2)}%</span>
                </div>
              )}
            </>
          ) : (
            <span className="text-xs text-muted-foreground animate-pulse">로딩 중...</span>
          )}
        </div>
      </div>

      {/* 차트 */}
      <div className="relative w-full h-[260px] rounded-lg overflow-hidden">
        <div ref={containerRef} className="w-full h-full" />
        {ticker && (
          <div className="absolute bottom-8 left-2 bg-background/75 backdrop-blur-sm px-2 py-1 rounded border border-border/40 text-[10px] text-muted-foreground z-10">
            <div>거래량: <span className="text-foreground font-medium">{ticker.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })} BTC</span></div>
            <div>거래대금: <span className="text-foreground font-medium">{formatQuoteVolume(ticker.quoteAssetVolume)}</span></div>
          </div>
        )}
      </div>
    </Card>
  )
}
