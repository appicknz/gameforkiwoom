"use client"

import { useEffect, useRef } from "react"
import { createChart, ColorType } from "lightweight-charts"

const BG   = "#0a0e1a"
const GRID = "rgba(255,255,255,0.04)"
const TEXT = "rgba(255,255,255,0.35)"

interface SymbolChartProps {
  symbol: string      // e.g. "BTCUSDT", "ETHUSDT"
  height?: number
  onPrice?: (price: number) => void
}

export default function SymbolChart({ symbol, height = 240, onPrice }: SymbolChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const onPriceRef   = useRef(onPrice)
  useEffect(() => { onPriceRef.current = onPrice }, [onPrice])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // ── 차트 생성 ─────────────────────────────────────────────
    const chart = createChart(container, {
      width:  container.clientWidth,
      height,
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
        secondsVisible: false,
      },
      watermark: { visible: false },
      handleScroll: true,
      handleScale: true,
    })

    const series = chart.addCandlestickSeries({
      upColor:        "#00e676",
      downColor:      "#ff3d57",
      borderUpColor:  "#00e676",
      borderDownColor:"#ff3d57",
      wickUpColor:    "#00e676",
      wickDownColor:  "#ff3d57",
    })

    // ResizeObserver
    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth })
    })
    ro.observe(container)

    // ── 과거 캔들 로드 ────────────────────────────────────────
    let ws: WebSocket | null = null
    let cancelled = false

    fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1m&limit=200`)
      .then(r => r.json())
      .then((data: any[][]) => {
        if (cancelled) return
        const candles = data.map(k => ({
          time:  Math.floor(k[0] / 1000) as any,
          open:  parseFloat(k[1]),
          high:  parseFloat(k[2]),
          low:   parseFloat(k[3]),
          close: parseFloat(k[4]),
        }))
        series.setData(candles)
        chart.timeScale().fitContent()
      })
      .catch(() => {})

    // ── 실시간 WebSocket ──────────────────────────────────────
    ws = new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_1m`)
    ws.onmessage = (e) => {
      if (cancelled) return
      try {
        const k = JSON.parse(e.data).k
        if (!k) return
        series.update({
          time:  Math.floor(k.t / 1000) as any,
          open:  parseFloat(k.o),
          high:  parseFloat(k.h),
          low:   parseFloat(k.l),
          close: parseFloat(k.c),
        })
        onPriceRef.current?.(parseFloat(k.c))
      } catch {}
    }
    ws.onerror = () => ws?.close()

    return () => {
      cancelled = true
      ws?.close()
      ro.disconnect()
      chart.remove()
    }
  // symbol이 바뀔 때마다 차트 전체 재생성
  }, [symbol, height])

  return <div ref={containerRef} style={{ width: "100%", height }} />
}
