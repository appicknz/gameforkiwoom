"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
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
}

export function BitcoinChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null)
  const seriesRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const tickerWsRef = useRef<WebSocket | null>(null)
  const candleMapRef = useRef<Map<number, CandleData>>(new Map())

  const [ticker, setTicker] = useState<TickerData | null>(null)
  const [connected, setConnected] = useState(false)
  const [initialized, setInitialized] = useState(false)

  // 바이낸스 선물에서 1분봉 히스토리 가져오기 (초기 데이터)
  const fetchInitialCandles = useCallback(async () => {
    try {
      const res = await fetch(
        "https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m&limit=200"
      )
      const data = await res.json()
      const candles: CandleData[] = data.map((k: any[]) => ({
        time: Math.floor(k[0] / 1000),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
      }))

      candles.forEach((c) => candleMapRef.current.set(c.time, c))
      return candles
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
    fetchInitialCandles().then((candles) => {
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
  }, [fetchInitialCandles])

  // 바이낸스 선물 WebSocket - 1분봉 스트림
  useEffect(() => {
    if (!initialized) return

    const connectKlineWs = () => {
      const ws = new WebSocket("wss://fstream.binance.com/ws/btcusdt@kline_1m")
      wsRef.current = ws

      ws.onopen = () => setConnected(true)

      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data)
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

      ws.onerror = () => setConnected(false)
      ws.onclose = () => {
        setConnected(false)
        // 3초 후 재연결
        setTimeout(connectKlineWs, 3000)
      }
    }

    connectKlineWs()

    return () => {
      wsRef.current?.close()
    }
  }, [initialized])

  // 바이낸스 선물 WebSocket - 티커 스트림 (가격/변동률)
  useEffect(() => {
    const connectTickerWs = () => {
      const ws = new WebSocket("wss://fstream.binance.com/ws/btcusdt@ticker")
      tickerWsRef.current = ws

      ws.onmessage = (event) => {
        const d = JSON.parse(event.data)
        setTicker({
          price: parseFloat(d.c),
          change: parseFloat(d.P) >= 0
            ? parseFloat(d.p)
            : parseFloat(d.p),
          changePercent: parseFloat(d.P),
          high: parseFloat(d.h),
          low: parseFloat(d.l),
          volume: parseFloat(d.v),
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

  return (
    <Card className="p-5 bg-background border border-border/60">
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
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
            <p className="text-xs text-muted-foreground">Binance Futures • 1분봉</p>
          </div>
        </div>

        {/* 현재가 & 변동률 */}
        <div className="text-right">
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
        <div className="flex gap-4 mb-3 text-xs text-muted-foreground">
          <span>고가 <span className="text-foreground font-medium">${ticker.high.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span></span>
          <span>저가 <span className="text-foreground font-medium">${ticker.low.toLocaleString("en-US", { maximumFractionDigits: 0 })}</span></span>
          <span>거래량 <span className="text-foreground font-medium">{ticker.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })} BTC</span></span>
        </div>
      )}

      {/* 차트 */}
      <div ref={chartContainerRef} className="w-full h-64 rounded-lg overflow-hidden" />
    </Card>
  )
}
