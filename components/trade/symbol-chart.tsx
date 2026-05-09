"use client"

import { useEffect, useRef } from "react"

interface Props {
  symbol: string   // e.g. "ETHUSDT"
  height?: number
}

export default function SymbolChart({ symbol, height = 240 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<() => void>(() => {})

  useEffect(() => {
    let cancelled = false
    const el = containerRef.current
    if (!el) return

    // lightweight-charts는 동적 import (SSR 방지)
    async function init() {
      const { createChart, CandlestickSeries, LineSeries } = await import("lightweight-charts")

      if (cancelled || !containerRef.current) return

      const chart = createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height,
        layout: {
          background: { color: "transparent" },
          textColor: "rgba(255,255,255,0.4)",
          fontSize: 10,
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.04)" },
          horzLines: { color: "rgba(255,255,255,0.04)" },
        },
        crosshair: {
          vertLine: { color: "rgba(212,175,55,0.4)", labelBackgroundColor: "#1a1a1a" },
          horzLine: { color: "rgba(212,175,55,0.4)", labelBackgroundColor: "#1a1a1a" },
        },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,0.06)",
          textColor: "rgba(255,255,255,0.35)",
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.06)",
          timeVisible: true,
          secondsVisible: false,
        },
        handleScale: true,
        handleScroll: true,
      })

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderUpColor: "#22c55e",
        borderDownColor: "#ef4444",
        wickUpColor: "rgba(34,197,94,0.6)",
        wickDownColor: "rgba(239,68,68,0.6)",
      })

      // ResizeObserver
      const ro = new ResizeObserver(() => {
        if (containerRef.current) {
          chart.applyOptions({ width: containerRef.current.clientWidth })
        }
      })
      ro.observe(containerRef.current!)

      // 과거 1분봉 데이터 로드 (최근 200개)
      try {
        const res = await fetch(
          `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1m&limit=200`
        )
        const raw: number[][] = await res.json()
        if (!cancelled) {
          const candles = raw.map(k => ({
            time: Math.floor(k[0] / 1000) as any,
            open: parseFloat(k[1] as unknown as string),
            high: parseFloat(k[2] as unknown as string),
            low: parseFloat(k[3] as unknown as string),
            close: parseFloat(k[4] as unknown as string),
          }))
          candleSeries.setData(candles)
          chart.timeScale().fitContent()
        }
      } catch {}

      // 실시간 WebSocket (1분봉 스트림)
      const ws = new WebSocket(
        `wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_1m`
      )
      ws.onmessage = (ev) => {
        if (cancelled) return
        try {
          const data = JSON.parse(ev.data)
          const k = data.k
          candleSeries.update({
            time: Math.floor(k.t / 1000) as any,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
          })
        } catch {}
      }

      cleanupRef.current = () => {
        cancelled = true
        ws.close()
        ro.disconnect()
        chart.remove()
      }
    }

    init()

    return () => {
      cancelled = true
      cleanupRef.current()
    }
  }, [symbol, height])

  return (
    <div
      ref={containerRef}
      style={{ width: "100%", height, background: "transparent" }}
    />
  )
}
