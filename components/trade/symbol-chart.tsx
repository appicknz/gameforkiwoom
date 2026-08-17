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

const INTERVAL_SECONDS: Record<Interval, number> = {
  "1m": 60, "3m": 180, "5m": 300, "15m": 900,
  "1h": 3600, "4h": 14400, "1d": 86400, "1w": 604800,
}

// 심볼 가격 범위에 따라 소수점 자릿수 동적 계산
function calcPriceFormat(price: number) {
  if (!price || price <= 0) return { type: "price" as const, precision: 8, minMove: 0.00000001 }
  if (price >= 1000)  return { type: "price" as const, precision: 2, minMove: 0.01 }
  if (price >= 1)     return { type: "price" as const, precision: 4, minMove: 0.0001 }
  if (price >= 0.01)  return { type: "price" as const, precision: 6, minMove: 0.000001 }
  if (price >= 0.001) return { type: "price" as const, precision: 7, minMove: 0.0000001 }
  return { type: "price" as const, precision: 8, minMove: 0.00000001 }
}

interface SymbolChartProps {
  symbol: string
  height?: number
  onPrice?: (price: number) => void
  /** 앱 전역 단일 가격 소스(Railway usePriceWorker)에서 받은 실시간 가격 —
   *  거래소 직결 WebSocket이 지역 차단 등으로 끊겨도 이 값으로 캔들을 계속 갱신한다. */
  livePrice?: number | null
  positions?: PositionLine[]
}

export default function SymbolChart({ symbol, height = 240, onPrice, livePrice, positions = [] }: SymbolChartProps) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const seriesRef      = useRef<any>(null)
  const ultimatePlotRef = useRef<any>(null)
  const priceLineRef   = useRef<any>(null)
  const onPriceRef     = useRef(onPrice)
  const linesRef       = useRef<Map<string, any>>(new Map())
  const currentBarRef  = useRef<{ time: number; open: number; high: number; low: number; close: number } | null>(null)
  const formatAppliedRef = useRef(false)

  const [interval, setInterval] = useState<Interval>("1m")

  useEffect(() => { onPriceRef.current = onPrice }, [onPrice])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // ── 차트 생성 ─────────────────────────────────────────────
    const chart = createChart(container, {
      width:  container.clientWidth,
      height: container.clientHeight || height,
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
        rightOffset: 16,
      },
      watermark: { visible: false },
      // 확대·축소만 허용하고 드래그/터치 패닝은 비활성화
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: false,
        horzTouchDrag: false,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: false,
        mouseWheel: true,
        pinch: true,
      },
    })

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

    // Pine Script Ultimate Plot: 캔들 중간값 (시가 + 종가) / 2
    const ultimatePlot = chart.addLineSeries({
      color: "#ffffff",
      lineWidth: 2,
      lineStyle: 0,
      lastValueVisible: false,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
    })
    ultimatePlotRef.current = ultimatePlot

    // 현재가를 따라 움직이는 수평선과 우측 가격 라벨
    const currentPriceLine = series.createPriceLine({
      price:            0,
      color:            "#f5c542",
      lineWidth:        1,
      lineStyle:        2,
      axisLabelVisible: true,
      title:            "현재가",
    })
    priceLineRef.current = currentPriceLine

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth, height: container.clientHeight })
      chart.timeScale().fitContent()
    })
    ro.observe(container)

    // ── 과거 캔들 로드 ────────────────────────────────────────
    let ws: WebSocket | null = null
    let cancelled = false
    formatAppliedRef.current = false

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
        ultimatePlot.setData(candles.map((c) => ({ time: c.time, value: (c.open + c.close) / 2 })))
        chart.timeScale().fitContent()
        if (candles.length > 0) {
          const lastBar = candles[candles.length - 1]
          // 실제 가격 기준으로 소수점 정밀도 재설정
          series.applyOptions({ priceFormat: calcPriceFormat(lastBar.close) })
          currentPriceLine.applyOptions({ price: lastBar.close })
          currentBarRef.current = { ...lastBar }
          formatAppliedRef.current = true
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
        const bar = {
          time:  Math.floor(k.t / 1000),
          open:  parseFloat(k.o),
          high:  parseFloat(k.h),
          low:   parseFloat(k.l),
          close,
        }
        series.update(bar as any)
        ultimatePlot.update({ time: bar.time as any, value: (bar.open + bar.close) / 2 })
        currentPriceLine.applyOptions({ price: close })
        currentBarRef.current = bar
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
      ultimatePlotRef.current = null
      chart.remove()
    }
  // symbol 또는 interval이 바뀔 때마다 차트 전체 재생성
  }, [symbol, interval, height])

  // ── 신뢰 가능한 전역 가격 소스(livePrice)로 캔들 실시간 갱신 ──────
  // 거래소 직결 WebSocket이 지역 차단 등으로 죽어도 이 값만으로 캔들이 계속 움직인다.
  useEffect(() => {
    const series = seriesRef.current
    const priceLine = priceLineRef.current
    if (!series || !livePrice || livePrice <= 0) return

    // 거래소 REST 히스토리 로드가 실패(지역 차단 등)해 정밀도가 아직 설정되지 않았다면
    // 이 실시간 가격 기준으로 대신 설정 — 8자리 기본값으로 축이 뭉개지는 것을 방지
    if (!formatAppliedRef.current) {
      try { series.applyOptions({ priceFormat: calcPriceFormat(livePrice) }) } catch {}
      formatAppliedRef.current = true
    }

    const intervalSec = INTERVAL_SECONDS[interval]
    const barTime = Math.floor(Date.now() / 1000 / intervalSec) * intervalSec
    const prevBar = currentBarRef.current

    const nextBar = !prevBar || barTime > prevBar.time
      ? { time: barTime, open: livePrice, high: livePrice, low: livePrice, close: livePrice }
      : {
          time:  prevBar.time,
          open:  prevBar.open,
          high:  Math.max(prevBar.high, livePrice),
          low:   Math.min(prevBar.low, livePrice),
          close: livePrice,
        }

    currentBarRef.current = nextBar
    try {
      series.update(nextBar as any)
      ultimatePlotRef.current?.update({ time: nextBar.time as any, value: (nextBar.open + nextBar.close) / 2 })
      priceLine?.applyOptions({ price: livePrice })
    } catch { /* 심볼/차트 전환 중 일시적 참조 불일치 무시 */ }
  }, [livePrice, interval])

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

      <div ref={containerRef} className="h-[213px] w-full md:h-80" style={{ width: "100%" }} />
    </div>
  )
}
