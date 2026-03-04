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

type Interval = "1s" | "1m" | "5m" | "1h" | "1d"

const INTERVAL_CONFIG: Record<Interval, { label: string; binance: string; limit: number }> = {
  "1s": { label: "1초", binance: "", limit: 30 },
  "1m": { label: "1분", binance: "1m", limit: 200 },
  "5m": { label: "5분", binance: "5m", limit: 200 },
  "1h": { label: "1시간", binance: "1h", limit: 168 },
  "1d": { label: "1일", binance: "1d", limit: 365 },
}

export function BitcoinChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null)
  const seriesRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const tickerWsRef = useRef<WebSocket | null>(null)
  const candleMapRef = useRef<Map<number, CandleData>>(new Map())
  const tradeBufferRef = useRef<Array<{ price: number; quantity: number; time: number }>>([])
  const volumeBufferRef = useRef<Map<number, number>>(new Map()) // interval별 거래대금
  const currentCandleRef = useRef<CandleData | null>(null)
  const secondTimerRef = useRef<NodeJS.Timeout | null>(null)

  const [ticker, setTicker] = useState<TickerData | null>(null)
  const [connected, setConnected] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [interval, setInterval] = useState<Interval>("1s")
  const [aggregatedVolume, setAggregatedVolume] = useState<Map<Interval, number>>(new Map())

  // 선택된 interval에 따라 초기 데이터 로드
  const fetchInitialCandles = useCallback(async (selectedInterval: Interval) => {
    try {
      if (selectedInterval === "1s") {
        const res = await fetch(
          "https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m&limit=1"
        )
        const data = await res.json()
        const k = data[0]
        const baseTime = Math.floor(k[0] / 1000)
        const basePrice = parseFloat(k[4])

        const candles: CandleData[] = []
        for (let i = -30; i <= 0; i++) {
          const time = baseTime + i
          const variance = (Math.random() - 0.5) * basePrice * 0.0001
          const price = basePrice + variance
          candles.push({
            time,
            open: price,
            high: price * 1.00005,
            low: price * 0.99995,
            close: price,
          })
          candleMapRef.current.set(time, candles[candles.length - 1])
        }
        return candles
      } else {
        const config = INTERVAL_CONFIG[selectedInterval]
        const res = await fetch(
          `https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=${config.binance}&limit=${config.limit}`
        )
        const data = await res.json()
        const candles: CandleData[] = data.map((k: any[]) => ({
          time: Math.floor(k[0] / 1000),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
        }))

        candleMapRef.current.clear()
        candles.forEach((c) => candleMapRef.current.set(c.time, c))
        return candles
      }
    } catch {
      return []
    }
  }, [])

  // 차트 초기화
  useEffect(() => {
    if (!chartContainerRef.current) return

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
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: true,
      handleScale: true,
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    })

    chartRef.current = chart
    seriesRef.current = candleSeries

    const resizeObserver = new ResizeObserver(() => {
      if (container) {
        chart.applyOptions({
          width: container.clientWidth,
          height: container.clientHeight,
        })
      }
    })
    resizeObserver.observe(container)

    // 초기 데이터 로드 후 WebSocket 연결
    fetchInitialCandles(interval).then((candles) => {
      if (candles.length > 0) {
        candleSeries.setData(candles)
        chart.timeScale().fitContent()
        setInitialized(true)
      }
    })

    return () => {
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [fetchInitialCandles, interval])

  // 바이낸스 선물 WebSocket 연결 (interval에 따라 동적으로)
  useEffect(() => {
    if (!initialized) return

    const connectWs = () => {
      let ws: WebSocket

      if (interval === "1s") {
        ws = new WebSocket("wss://fstream.binance.com/ws/btcusdt@aggTrade")
      } else {
        const config = INTERVAL_CONFIG[interval]
        ws = new WebSocket(`wss://fstream.binance.com/ws/btcusdt@kline_${config.binance}`)
      }

      wsRef.current = ws

      ws.onopen = () => setConnected(true)

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)

        if (interval === "1s") {
          // aggTrade 처리
          const price = parseFloat(msg.p)
          const quantity = parseFloat(msg.q)
          const time = Math.floor(msg.T / 1000)
          tradeBufferRef.current.push({ price, quantity, time })
        } else {
          // kline 처리
          const k = msg.k
          const candle: CandleData = {
            time: Math.floor(k.t / 1000),
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
          }

          candleMapRef.current.set(candle.time, candle)

          if (seriesRef.current) {
            seriesRef.current.update(candle)
          }
        }
      }

      ws.onerror = () => setConnected(false)
      ws.onclose = () => {
        setConnected(false)
        setTimeout(connectWs, 3000)
      }
    }

    connectWs()

    return () => {
      wsRef.current?.close()
    }
  }, [initialized, interval])

  // 1초 간격 캔들 처리 (1s interval일 때만 실행)
  useEffect(() => {
    if (!initialized || !seriesRef.current || interval !== "1s") return

    const processSecondCandle = () => {
      const now = Math.floor(Date.now() / 1000)
      const trades = tradeBufferRef.current.filter((t) => t.time === now)

      if (trades.length > 0) {
        const prices = trades.map((t) => t.price)
        const quantities = trades.map((t) => t.quantity)
        const open = prices[0]
        const close = prices[prices.length - 1]
        const high = Math.max(...prices)
        const low = Math.min(...prices)

        const candle: CandleData = { time: now, open, high, low, close }
        candleMapRef.current.set(now, candle)
        currentCandleRef.current = candle

        if (seriesRef.current) {
          seriesRef.current.update(candle)
        }

        // 거래대금 집계 (현재 초)
        const quoteVolume = trades.reduce((sum, t) => sum + t.price * t.quantity, 0)
        volumeBufferRef.current.set(now, quoteVolume)
      }

      tradeBufferRef.current = tradeBufferRef.current.filter((t) => t.time === now)
    }

    secondTimerRef.current = setInterval(processSecondCandle, 1000)

    return () => {
      if (secondTimerRef.current) clearInterval(secondTimerRef.current)
    }
  }, [initialized, interval])

  // 바이낸스 선물 WebSocket - 티커 스트림 (가격/변동률)
  useEffect(() => {
    const connectTickerWs = () => {
      const ws = new WebSocket("wss://fstream.binance.com/ws/btcusdt@ticker")
      tickerWsRef.current = ws

      ws.onmessage = (event) => {
        const d = JSON.parse(event.data)
        
        // interval별 거래대금 집계
        const now = Math.floor(Date.now() / 1000)

        // 1분 데이터 집계
        const last60seconds = Array.from(volumeBufferRef.current.entries())
          .filter(([time]) => time > now - 60)
          .reduce((sum, [, vol]) => sum + vol, 0)

        // 5분 데이터 집계
        const last300seconds = Array.from(volumeBufferRef.current.entries())
          .filter(([time]) => time > now - 300)
          .reduce((sum, [, vol]) => sum + vol, 0)

        // 1시간 데이터 집계
        const last3600seconds = Array.from(volumeBufferRef.current.entries())
          .filter(([time]) => time > now - 3600)
          .reduce((sum, [, vol]) => sum + vol, 0)

        // 1일 데이터 집계
        const last86400seconds = Array.from(volumeBufferRef.current.entries())
          .filter(([time]) => time > now - 86400)
          .reduce((sum, [, vol]) => sum + vol, 0)

        const newAggregated = new Map<Interval, number>()
        newAggregated.set("1m", last60seconds)
        newAggregated.set("5m", last300seconds)
        newAggregated.set("1h", last3600seconds)
        newAggregated.set("1d", last86400seconds)

        setAggregatedVolume(newAggregated)

        setTicker({
          price: parseFloat(d.c),
          change: parseFloat(d.P) >= 0 ? parseFloat(d.p) : parseFloat(d.p),
          changePercent: parseFloat(d.P),
          high: parseFloat(d.h),
          low: parseFloat(d.l),
          volume: parseFloat(d.v),
          quoteAssetVolume: parseFloat(d.q),
        })
      }

      ws.onerror = () => {}
      ws.onclose = () => setTimeout(connectTickerWs, 3000)
    }

    connectTickerWs()

    return () => {
      tickerWsRef.current?.close()
    }
  }, [])

  const isPositive = (ticker?.changePercent ?? 0) >= 0

  // 거래대금 포맷 함수 (조/억 단위)
  const formatVolume = (volume: number): string => {
    if (volume >= 1000000000000) {
      return (volume / 1000000000000).toFixed(2) + "조"
    } else if (volume >= 100000000) {
      return (volume / 100000000).toFixed(2) + "억"
    } else if (volume >= 10000) {
      return (volume / 10000).toFixed(1) + "만"
    }
    return volume.toLocaleString("en-US", { maximumFractionDigits: 0 })
  }

  return (
    <Card className="p-5 bg-background border border-border/60">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-9 h-9 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center shrink-0">
            <span className="text-base font-bold text-orange-600 dark:text-orange-400">₿</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-foreground">BTC/USDT Perpetual</h2>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium">FUTURES</span>
              <span className={`flex items-center gap-1 text-[10px] font-medium ${connected ? "text-emerald-500" : "text-muted-foreground"}`}>
                {connected
                  ? <><Wifi className="w-3 h-3" /> LIVE</>
                  : <><WifiOff className="w-3 h-3" /> 연결 중...</>
                }
              </span>
            </div>
            <p className="text-xs text-muted-foreground">Binance Futures • {interval && INTERVAL_CONFIG[interval] ? INTERVAL_CONFIG[interval].label : "1초"}봉</p>
          </div>
        </div>

        {/* 시간 간격 선택 버튼 (오른쪽 정��) */}
        <div className="flex items-center gap-2 shrink-0">
          {(["1m", "5m", "1h", "1d"] as const).map((btn) => (
            <Button
              key={btn}
              variant={interval === btn ? "default" : "outline"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => {
                candleMapRef.current.clear()
                setInitialized(false)
                setInterval(btn)
              }}
            >
              {INTERVAL_CONFIG[btn].label}
            </Button>
          ))}
        </div>

        {/* 현재가 & 변동률 */}
        <div className="text-right shrink-0 ml-4">
          {ticker ? (
            <>
              <p className="text-2xl font-bold text-foreground tabular-nums">
                ${ticker.price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </p>
              <div className={`flex items-center justify-end gap-1 text-sm font-semibold ${isPositive ? "text-emerald-500" : "text-red-500"}`}>
                {isPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                <span>{isPositive ? "+" : ""}{ticker.changePercent.toFixed(2)}%</span>
                <span className="text-muted-foreground font-normal text-xs">
                  ({isPositive ? "+" : ""}${ticker.change.toFixed(1)})
                </span>
              </div>
            </>
          ) : (
            <div className="h-10 flex items-center">
              <span className="text-sm text-muted-foreground animate-pulse">로딩 중...</span>
            </div>
          )}
        </div>
      </div>

      {/* 보조 지표 */}
      {ticker && (
        <div className="flex gap-6 mb-3 text-xs text-muted-foreground flex-wrap items-center justify-between">
          <div className="flex gap-6">
            <span>고가 <span className="text-foreground font-medium">${ticker.high.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span></span>
            <span>저가 <span className="text-foreground font-medium">${ticker.low.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span></span>
            <span>거래량 <span className="text-foreground font-medium">{ticker.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })} BTC</span></span>
          </div>

          {/* 거래대금 (오른쪽 정렬) */}
          <div className="flex gap-4 text-xs text-muted-foreground ml-auto">
            <span>1분 <span className="text-foreground font-medium">{formatVolume(aggregatedVolume.get("1m") || 0)}</span></span>
            <span>5분 <span className="text-foreground font-medium">{formatVolume(aggregatedVolume.get("5m") || 0)}</span></span>
            <span>1시간 <span className="text-foreground font-medium">{formatVolume(aggregatedVolume.get("1h") || 0)}</span></span>
            <span>1일 <span className="text-foreground font-medium">{formatVolume(aggregatedVolume.get("1d") || 0)}</span></span>
          </div>
        </div>
      )}

      {/* 차트 */}
      <div ref={chartContainerRef} className="w-full h-64 rounded-lg overflow-hidden" />
    </Card>
  )
}
