"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { createChart, ColorType } from "lightweight-charts"

interface CandleData {
  time: number
  open: number
  high: number
  low: number
  close: number
}

const BG = "#0a0e1a"
const GRID = "rgba(255,255,255,0.04)"
const TEXT = "rgba(255,255,255,0.35)"

interface GameChartProps {
  onPrice?: (price: number) => void
  onClosingPrice?: (price: number, bucket: number) => void
}

export function GameChart({ onPrice, onClosingPrice }: GameChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null)
  const seriesRef = useRef<any>(null)
  const priceLineRef = useRef<any>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const candleMapRef = useRef<Map<number, CandleData>>(new Map())
  const tradeBufferRef = useRef<Array<{ price: number; quantity: number; time: number }>>([])
  const prevBucketRef = useRef<number | null>(null)
  const onPriceRef = useRef(onPrice)
  const onClosingPriceRef = useRef(onClosingPrice)

  useEffect(() => { onPriceRef.current = onPrice }, [onPrice])
  useEffect(() => { onClosingPriceRef.current = onClosingPrice }, [onClosingPrice])

  const fetchInitialCandles = useCallback(async (): Promise<CandleData[]> => {
    try {
      const res = await fetch(
        `https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m&limit=60`
      )
      const data: any[][] = await res.json()
      const candles: CandleData[] = data.map((k) => ({
        time: Math.floor(k[0] / 1000),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
      }))
      candleMapRef.current.clear()
      candles.forEach((c) => candleMapRef.current.set(c.time, c))
      return candles
    } catch {
      return []
    }
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: BG },
        textColor: TEXT,
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { color: GRID },
        horzLines: { color: GRID },
      },
      crosshair: {
        vertLine: { color: "rgba(255,255,255,0.2)", labelBackgroundColor: "#1a2035" },
        horzLine: { color: "rgba(255,255,255,0.2)", labelBackgroundColor: "#1a2035" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.1, bottom: 0.1 },
        textColor: TEXT,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: true,
        fixLeftEdge: false,
      },
      watermark: { visible: false },
      handleScroll: true,
      handleScale: true,
    })
    chartRef.current = chart

    const series = chart.addCandlestickSeries({
      upColor: "#00e676",
      downColor: "#ff3d57",
      borderUpColor: "#00e676",
      borderDownColor: "#ff3d57",
      wickUpColor: "#00e676",
      wickDownColor: "#ff3d57",
    })
    seriesRef.current = series

    const ro = new ResizeObserver(() => {
      if (chartRef.current && container) {
        chartRef.current.applyOptions({ width: container.clientWidth })
      }
    })
    ro.observe(container)

    fetchInitialCandles().then((candles) => {
      if (candles.length > 0 && seriesRef.current) {
        seriesRef.current.setData(candles)
        chartRef.current?.timeScale().fitContent()
      }
    })

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
    }
  }, [fetchInitialCandles])

  // 배팅가 수평선 업데이트
  useEffect(() => {
    const update = () => {
      const prices: Array<{ time: number; price: number }> =
        (window as any).__bitcoinClosingPrices ?? []
      if (!seriesRef.current || prices.length === 0) return
      const latest = prices[prices.length - 1].price

      if (priceLineRef.current) {
        try { seriesRef.current.removePriceLine(priceLineRef.current) } catch {}
      }
      priceLineRef.current = seriesRef.current.createPriceLine({
        price: latest,
        color: "#facc15",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "배팅가",
      })
    }
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [])

  // aggTrade WebSocket
  useEffect(() => {
    const connect = () => {
      const ws = new WebSocket("wss://fstream.binance.com/ws/btcusdt@aggTrade")
      wsRef.current = ws
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        tradeBufferRef.current.push({
          price: parseFloat(msg.p),
          quantity: parseFloat(msg.q),
          time: Math.floor(msg.T / 1000),
        })
      }
      ws.onclose = () => setTimeout(connect, 3000)
    }
    connect()

    const processCandle = () => {
      const now = Math.floor(Date.now() / 1000)
      const bucket = now - (now % 1)
      const trades = tradeBufferRef.current.filter((t) => t.time >= bucket)
      if (trades.length === 0) return

      const prices = trades.map((t) => t.price)
      const closingPrice = prices[prices.length - 1]

      const candle: CandleData = {
        time: bucket,
        open: prices[0],
        high: Math.max(...prices),
        low: Math.min(...prices),
        close: closingPrice,
      }
      candleMapRef.current.set(bucket, candle)
      seriesRef.current?.update(candle)

      // 콜백으로 현재가 전달 (+ window 호환성 유지)
      onPriceRef.current?.(closingPrice)
      if (typeof window !== "undefined") {
        (window as any).__bitcoinCurrentPrice = closingPrice
      }

      // 30초 마감가 기록
      const thirtySecBucket = now - (now % 30)
      if (prevBucketRef.current === null || thirtySecBucket !== prevBucketRef.current) {
        prevBucketRef.current = thirtySecBucket
        const prev: Array<{ time: number; price: number }> =
          (window as any).__bitcoinClosingPrices ?? []
        const updated = [...prev, { time: thirtySecBucket, price: closingPrice }].slice(-100)
        ;(window as any).__bitcoinClosingPrices = updated
        onClosingPriceRef.current?.(closingPrice, thirtySecBucket)
      }

      const cutoff = now - 86400
      tradeBufferRef.current = tradeBufferRef.current.filter((t) => t.time >= cutoff)
    }

    const timer = setInterval(processCandle, 1000)
    return () => {
      wsRef.current?.close()
      clearInterval(timer)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
    />
  )
}
