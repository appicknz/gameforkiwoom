"use client"

import { useEffect, useRef, useCallback } from "react"
import { createChart, ColorType } from "lightweight-charts"
import { usePriceWorker } from "@/hooks/use-price-worker"

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
  onBasePriceCoord?: (coord: { x: number; y: number } | null) => void
}

export function GameChart({ onPrice, onClosingPrice, onBasePriceCoord }: GameChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<ReturnType<typeof createChart> | null>(null)
  const seriesRef = useRef<any>(null)
  const priceLineRef = useRef<any>(null)
  const candleMapRef = useRef<Map<number, CandleData>>(new Map())
  const onPriceRef = useRef(onPrice)
  const onClosingPriceRef = useRef(onClosingPrice)
  const onBasePriceCoordRef = useRef(onBasePriceCoord)

  useEffect(() => { onPriceRef.current = onPrice }, [onPrice])
  useEffect(() => { onClosingPriceRef.current = onClosingPrice }, [onClosingPrice])
  useEffect(() => { onBasePriceCoordRef.current = onBasePriceCoord }, [onBasePriceCoord])

  const fetchInitialCandles = useCallback(async (): Promise<CandleData[]> => {
    try {
      // 실시간 업데이트가 1초 버킷이므로 초기 데이터도 1s 간격으로 맞춤
      const res = await fetch(
        `https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1s&limit=300`
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
        autoScale: true,
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

  // setInterval 폴링 완전 제거 — onClosingPrice 콜백에서 배팅가 수평선을 직접 업데이트
  // basePriceCoord: 차트 내에서 배팅가 라인의 실제 픽셀 위치 (레이더 target용)
  const updateBasePriceCoord = useCallback(() => {
    if (!chartRef.current || !seriesRef.current || !priceLineRef.current) {
      onBasePriceCoordRef.current?.(null)
      return
    }
    try {
      const chart = chartRef.current
      const series = seriesRef.current
      const priceLine = priceLineRef.current
      const price = priceLine.options().price as number
      
      // price → y 픽셀 좌표 (series 기준)
      const y = series.priceToCoordinate?.(price)
      if (y === null || y === undefined) {
        onBasePriceCoordRef.current?.(null)
        return
      }

      // chart 우측 끝 기준 x 좌표
      const container = containerRef.current
      if (!container) {
        onBasePriceCoordRef.current?.(null)
        return
      }

      const x = container.clientWidth - 40

      onBasePriceCoordRef.current?.({ x, y })
    } catch {
      onBasePriceCoordRef.current?.(null)
    }
  }, [])

  useEffect(() => {
    const interval = setInterval(updateBasePriceCoord, 500)
    return () => clearInterval(interval)
  }, [updateBasePriceCoord])

  const updateBaseLine = useCallback((price: number) => {
    if (!seriesRef.current) return
    if (priceLineRef.current) {
      try { seriesRef.current.removePriceLine(priceLineRef.current) } catch { }
    }
    priceLineRef.current = seriesRef.current.createPriceLine({
      price,
      color: "#facc15",
      lineWidth: 1,
      lineStyle: 2,
      axisLabelVisible: true,
      title: "배팅가",
    })
    // 새 price line이 생기면 좌표 업데이트
    updateBasePriceCoord()
  }, [updateBasePriceCoord])

  // 모든 사용자 동일 가격 보장 — usePriceWorker 단일 소스
  usePriceWorker({
    onPrice: useCallback((price, time) => {
      const bucket = time - (time % 1)
      const existing = candleMapRef.current.get(bucket)
      const candle: CandleData = {
        time: bucket,
        open: existing?.open ?? price,
        high: existing ? Math.max(existing.high, price) : price,
        low: existing ? Math.min(existing.low, price) : price,
        close: price,
      }
      candleMapRef.current.set(bucket, candle)
      seriesRef.current?.update(candle)
      onPriceRef.current?.(price)
    }, []),
    onClosingPrice: useCallback((price, time) => {
      // 배팅가 수평선을 콜백에서 직접 업데이트 (setInterval 불필요)
      updateBaseLine(price)
      onClosingPriceRef.current?.(price, time)
    }, [updateBaseLine]),
    onInitClosing: useCallback((prices) => {
      // 초기 로드 시 마지막 배팅가 수평선 설정
      if (prices.length > 0) {
        updateBaseLine(prices[prices.length - 1].price)
      }
    }, [updateBaseLine]),
  })

  return (
    <div
      ref={containerRef}
      className="w-full h-full"
    />
  )
}
