"use client"

import { useEffect, useRef, useState } from "react"
import { createChart, ColorType } from "lightweight-charts"

const BG   = "#0a0e1a"
const GRID = "rgba(255,255,255,0.04)"
const TEXT = "rgba(255,255,255,0.35)"
const GOLD = "#d4af37"

const TIMEFRAMES = [
  { label: "1분",  interval: "1m",  wsInterval: "1m"  },
  { label: "3분",  interval: "3m",  wsInterval: "3m"  },
  { label: "5분",  interval: "5m",  wsInterval: "5m"  },
  { label: "15분", interval: "15m", wsInterval: "15m" },
  { label: "1시",  interval: "1h",  wsInterval: "1h"  },
  { label: "4시",  interval: "4h",  wsInterval: "4h"  },
  { label: "1일",  interval: "1d",  wsInterval: "1d"  },
  { label: "1주",  interval: "1w",  wsInterval: "1w"  },
] as const

type Interval = typeof TIMEFRAMES[number]["interval"]

interface PositionLine {
  id: string
  symbol: string
  direction: "long" | "short"
  entryPrice: number
  leverage: number
}

interface SymbolChartProps {
  symbol: string
  height?: number
  onPrice?: (price: number) => void
  positions?: PositionLine[]
}

export default function SymbolChart({ symbol, height = 240, onPrice, positions = [] }: SymbolChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const seriesRef    = useRef<any>(null)
  const onPriceRef   = useRef(onPrice)
  const linesRef     = useRef<Map<string, any>>(new Map())

  const [interval, setInterval] = useState<Interval>("1m")

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
        autoScale: true,
        textColor: TEXT,
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 8,
      },
      watermark: { visible: false },
      handleScroll: true,
      handleScale: true,
    })

    // 심볼 가격 범위에 따라 소수점 자릿수 동적 계산
    function calcPriceFormat(price: number) {
      if (!price || price <= 0) return { type: "price" as const, precision: 8, minMove: 0.00000001 }
      if (price >= 1000)  return { type: "price" as const, precision: 2, minMove: 0.01 }
      if (price >= 1)     return { type: "price" as const, precision: 4, minMove: 0.0001 }
      if (price >= 0.01)  return { type: "price" as const, precision: 6, minMove: 0.000001 }
      if (price >= 0.001) return { type: "price" as const, precision: 7, minMove: 0.0000001 }
      return { type: "price" as const, precision: 8, minMove: 0.00000001 }
    }

    const series = chart.addCandlestickSeries({
      upColor:          "#00e676",
      downColor:        "#ff3d57",
      borderUpColor:    "#00e676",
      borderDownColor:  "#ff3d57",
      wickUpColor:      "#00e676",
      wickDownColor:    "#ff3d57",
      lastValueVisible: false,
      priceLineVisible: false,
      priceFormat:      { type: "price", precision: 8, minMove: 0.00000001 }, // 초기값 최대 정밀도
    })
    seriesRef.current = series

    // 수평선 없이 축 라벨만 표시 — color를 투명으로, lineWidth를 0으로
    const currentPriceLine = series.createPriceLine({
      price:            0,
      color:            "transparent",
      lineWidth:        0,
      axisLabelVisible: true,
      title:            "",
    })

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth })
    })
    ro.observe(container)

    // ── 과거 캔들 로드 ────────────────────────────────────────
    let ws: WebSocket | null = null
    let cancelled = false

    fetch(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=100`)
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
        if (candles.length > 0) {
          const lastClose = candles[candles.length - 1].close
          // 실제 가격 기준으로 소수점 정밀도 재설정
          series.applyOptions({ priceFormat: calcPriceFormat(lastClose) })
          currentPriceLine.applyOptions({ price: lastClose })
        }
      })
      .catch(() => {})

    // ── 실시간 WebSocket ──────────────────────────────────────
    ws = new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_${interval}`)
    ws.onmessage = (e) => {
      if (cancelled) return
      try {
        const k = JSON.parse(e.data).k
        if (!k) return
        const close = parseFloat(k.c)
        series.update({
          time:  Math.floor(k.t / 1000) as any,
          open:  parseFloat(k.o),
          high:  parseFloat(k.h),
          low:   parseFloat(k.l),
          close,
        })
        currentPriceLine.applyOptions({ price: close })
        onPriceRef.current?.(close)
      } catch {}
    }
    ws.onerror = () => ws?.close()

    return () => {
      cancelled = true
      ws?.close()
      ro.disconnect()
      linesRef.current.clear()
      seriesRef.current = null
      chart.remove()
    }
  // symbol 또는 interval이 바뀔 때마다 차트 전체 재생성
  }, [symbol, interval, height])

  // ── 포지션 진입가 라인 동기화 ────────────────────────────────
  useEffect(() => {
    const series = seriesRef.current
    if (!series) return

    const currentIds = new Set(positions.map(p => p.id))

    // 제거된 포지션 라인 삭제 (진입가 + 청산가 모두)
    linesRef.current.forEach((lines, id) => {
      if (!currentIds.has(id)) {
        lines.forEach(l => { try { series.removePriceLine(l) } catch {} })
        linesRef.current.delete(id)
      }
    })

    // 새 포지션 라인 추가
    positions.forEach(pos => {
      if (linesRef.current.has(pos.id)) return
      const isLong = pos.direction === "long"
      const liqPrice = isLong
        ? pos.entryPrice * (1 - 1 / pos.leverage)
        : pos.entryPrice * (1 + 1 / pos.leverage)
      const base = pos.symbol.replace("USDT", "")

      // 진입가 라인
      const entryLine = series.createPriceLine({
        price:      pos.entryPrice,
        color:      isLong ? "#00e676" : "#ff3d57",
        lineWidth:  1,
        lineStyle:  1,
        axisLabelVisible: true,
        title:      `${isLong ? "L" : "S"} ${base} ×${pos.leverage}`,
      })

      // 청산가 라인
      const liqLine = series.createPriceLine({
        price:      liqPrice,
        color:      isLong ? "rgba(239,68,68,0.5)" : "rgba(34,197,94,0.5)",
        lineWidth:  1,
        lineStyle:  2,
        axisLabelVisible: true,
        title:      `청산가`,
      })

      // 진입가 + 청산가 라인을 함께 저장해서 나중에 둘 다 제거
      linesRef.current.set(pos.id, [entryLine, liqLine])
    })
  }, [positions])

  return (
    <div style={{ position: "relative", width: "100%" }}>
      {/* 타임프레임 버튼 — 차트 상단 왼쪽 오버레이 */}
      <div style={{
        position: "absolute", top: 8, left: 8, zIndex: 10,
        display: "flex", gap: 2,
      }}>
        {TIMEFRAMES.map(tf => (
          <button
            key={tf.interval}
            onClick={() => setInterval(tf.interval)}
            style={{
              padding: "2px 6px",
              borderRadius: 4,
              border: `1px solid ${interval === tf.interval ? GOLD : "rgba(255,255,255,0.08)"}`,
              background: interval === tf.interval ? "rgba(212,175,55,0.15)" : "transparent",
              color: interval === tf.interval ? GOLD : "rgba(255,255,255,0.35)",
              fontSize: 10,
              fontWeight: interval === tf.interval ? 700 : 400,
              cursor: "pointer",
              transition: "all 0.12s",
              letterSpacing: "0.02em",
            }}
          >
            {tf.label}
          </button>
        ))}
      </div>

      <div ref={containerRef} style={{ width: "100%", height }} />
    </div>
  )
}
