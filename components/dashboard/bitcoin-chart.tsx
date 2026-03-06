"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown, Wifi, WifiOff } from "lucide-react"
import { createChart, ColorType } from "lightweight-charts"
import { usePriceWorker } from "@/hooks/use-price-worker"
import { ChartBackground } from "@/components/dashboard/chart-background"

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
  const priceLineRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)         // kline WS (1m/1h/1d)
  const tickerWsRef = useRef<WebSocket | null>(null)   // ticker WS (변동률)
  const candleMapRef = useRef<Map<number, CandleData>>(new Map())
  const [ticker, setTicker] = useState<TickerData | null>(null)
  const [connected, setConnected] = useState(false)
  const [interval, setIntervalState] = useState<Interval>("1s")
  const [aggVolumes, setAggVolumes] = useState({ "1m": 0, "1h": 0, "1d": 0 })
  const [closingPrices, setClosingPrices] = useState<Array<{ time: number; price: number }>>([])
  // NOTE: window.__bitcoinClosingPrices 저장 제거 — usePriceWorker 훅이 직접 관리

  // 현재가 상태 (aggTrade 기반 캔들 close 가격 사용)
  const [lastCandlePrice, setLastCandlePrice] = useState<number | null>(null)

  // 30초 마감 기준가 노란색 수평선
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
      lineStyle: 2, // dashed
      axisLabelVisible: true,
      title: "배팅가",
    })
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
      watermark: {
        color: "rgba(156, 163, 175, 0.5)",
        visible: true,
        fontSize: 14,
        horzAlign: "left",
        vertAlign: "bottom",
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

  // SSE를 통해 서버가 집계한 가격을 수신 — 모든 사용자 동일 가격 보장
  usePriceWorker({
    onConnected: useCallback(() => setConnected(true), []),
    onDisconnected: useCallback(() => setConnected(false), []),
    onInitClosing: useCallback((prices) => {
      setClosingPrices(prices)
    }, []),
    onPrice: useCallback((price, time) => {
      if (interval !== "1s" && interval !== "30s") return
      const bucketSize = interval === "30s" ? 30 : 1
      const bucket = time - (time % bucketSize)

      // 기존 캔들에서 open 유지, close/high/low 업데이트
      const existing = candleMapRef.current.get(bucket)
      const candle: CandleData = {
        time:  bucket,
        open:  existing?.open ?? price,
        high:  existing ? Math.max(existing.high, price) : price,
        low:   existing ? Math.min(existing.low, price)  : price,
        close: price,
      }
      candleMapRef.current.set(bucket, candle)
      seriesRef.current?.update(candle)
      setLastCandlePrice(price)
    }, [interval]),
    onClosingPrice: useCallback((price, time) => {
      setClosingPrices((prev) => {
        const last = prev[prev.length - 1]
        if (last?.time === time) return prev
        return [...prev, { time, price }].slice(-100)
      })
    }, []),
  })

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
    // 이 useEffect 내부에서만 사용하는 로컬 거래대금 버퍼
    const localVolBuffer = new Map<number, number>()

    const connect = () => {
      const ws = new WebSocket("wss://fstream.binance.com/ws/btcusdt@ticker")
      tickerWsRef.current = ws
      ws.onmessage = (e) => {
        const d = JSON.parse(e.data)
        const totalQuoteUSD = parseFloat(d.q)
        const now = Math.floor(Date.now() / 1000)

        // 현재 시각 버퍼에 저장
        localVolBuffer.set(now, totalQuoteUSD)

        const sumVol = (seconds: number) =>
          Array.from(localVolBuffer.entries())
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
    <Card className="p-4 bg-background border border-border/60">
      {/* 헤더 1행: 배팅 기준가(왼) + 현재가(오) */}
      <div className="flex items-start justify-between gap-2 mb-[6px]">
        {/* 왼쪽: 로고 + 배팅 기준가 + 인터벌 버튼 */}
        <div className="flex items-start gap-2.5 min-w-0">
          <img
            src="/bitcoin-logo.png"
            alt="Bitcoin"
            className="w-9 h-9 shrink-0"
          />
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
          </div>
        </div>

        {/* 오른쪽: 현재가 + 변동률 */}
        <div className="shrink-0 text-right">
          {lastCandlePrice ? (
            <>
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
      <div className="relative w-full h-[180px] rounded-lg overflow-hidden">
        <ChartBackground />
        <div ref={chartContainerRef} className="w-full h-full relative z-[1]" />
        
        {/* 차트 내 거래량/거래대금 오버레이 (왼쪽 아래, 시간 위) */}
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
