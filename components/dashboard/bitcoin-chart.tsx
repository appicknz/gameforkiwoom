"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown } from "lucide-react"
import { createChart, ColorType } from "lightweight-charts"
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

const INTERVAL_CONFIG: Record<Interval, { label: string; binance: string | null; limit: number; seconds: number }> = {
  // 1s/30s: 바이낸스 API에 해당 간격봉이 없으므로 REST 초기 로드 없이 WebSocket 틱으로만 쌓음
  "1s":  { label: "1초",   binance: null,  limit: 0,   seconds: 1     },
  "30s": { label: "30초",  binance: null,  limit: 0,   seconds: 30    },
  "1m":  { label: "1분",   binance: "1m",  limit: 200, seconds: 60    },
  "1h":  { label: "1시간", binance: "1h",  limit: 168, seconds: 3600  },
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
  const candleMapRef = useRef<Map<number, CandleData>>(new Map())

  const [ticker, setTicker] = useState<TickerData | null>(null)
  const [connected, setConnected] = useState(false)
  const [interval, setIntervalState] = useState<Interval>("1s")
  const [closingPrices, setClosingPrices] = useState<Array<{ time: number; price: number }>>([])

  // 선택된 interval의 seconds를 ref로 유지해 콜백 클로저에서 최신값 사용
  const intervalSecondsRef = useRef(INTERVAL_CONFIG["1s"].seconds)
  useEffect(() => {
    intervalSecondsRef.current = INTERVAL_CONFIG[interval].seconds
  }, [interval])

  // 틱마다 즉시 캔들 업데이트 — 바이낸스와 동일한 실시간성
  const handlePrice = useCallback((price: number, tradeTime: number) => {
    if (!seriesRef.current) return
    const seconds = intervalSecondsRef.current
    const bucket = tradeTime - (tradeTime % seconds)
    const existing = candleMapRef.current.get(bucket)
    const candle: CandleData = {
      time: bucket,
      open: existing?.open ?? price,
      high: existing ? Math.max(existing.high, price) : price,
      low: existing ? Math.min(existing.low, price) : price,
      close: price,
    }
    candleMapRef.current.set(bucket, candle)
    try {
      seriesRef.current.update(candle)
    } catch {
      // lightweight-charts는 이전 시간 캔들 update를 거부함 → setData 재동기화
      const allCandles = Array.from(candleMapRef.current.values())
        .sort((a, b) => a.time - b.time)
      try { seriesRef.current.setData(allCandles) } catch { /* ignore */ }
    }
    setTicker(prev => prev ? { ...prev, price } : { price, change: 0, changePercent: 0, high: price, low: price, volume: 0, quoteAssetVolume: 0 })
    setConnected(true)
  }, [])

  // 30초봉 마감가 → 노란 수평선
  const handleClosingPrice = useCallback((price: number, time: number) => {
    setClosingPrices(prev => {
      const last = prev[prev.length - 1]
      if (last?.time === time) return prev
      if (seriesRef.current) {
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
      }
      const next = [...prev, { time, price }].slice(-100)
      return next
    })
  }, [])

  // 초기 마감가 배열 수신
  const handleInitClosing = useCallback((prices: Array<{ time: number; price: number }>) => {
    if (prices.length === 0) return
    setClosingPrices(prices)
    const last = prices[prices.length - 1]
    if (seriesRef.current && last) {
      if (priceLineRef.current) {
        try { seriesRef.current.removePriceLine(priceLineRef.current) } catch { }
      }
      priceLineRef.current = seriesRef.current.createPriceLine({
        price: last.price,
        color: "#facc15",
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: "배팅가",
      })
    }
  }, [])

  usePriceWorker({
    onConnected: useCallback(() => setConnected(true), []),
    onDisconnected: useCallback(() => setConnected(false), []),
    onPrice: handlePrice,
    onClosingPrice: handleClosingPrice,
    onInitClosing: handleInitClosing,
  })

  // 초기 캔들 데이터 로드
  // 1s/30s: fapi 1분봉을 받아서 bucket 단위로 쪼개 seed 데이터를 만든다
  //         (open=high=low=close=해당 분봉 close 로 채워, 실시간 틱이 들어오면 갱신)
  // 1m/1h/1d: fapi 해당 봉 그대로 사용
  const fetchInitialCandles = useCallback(async (sel: Interval): Promise<CandleData[]> => {
    const cfg = INTERVAL_CONFIG[sel]
    try {
      if (!cfg.binance) {
        // 1s or 30s: 최근 10분(=10개 1분봉)을 받아 초/30초 단위로 분해
        // 현재 시간 직전까지 seed를 채워 실시간 틱이 연속으로 이어지게 함
        const res = await fetch(
          `https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=1m&limit=10`
        )
        const data: any[][] = await res.json()
        if (!Array.isArray(data)) return []
        const candles: CandleData[] = []
        const step = cfg.seconds  // 1 or 30
        for (const k of data) {
          const minStart = Math.floor(k[0] / 1000)
          const o = parseFloat(k[1])
          const h = parseFloat(k[2])
          const l = parseFloat(k[3])
          const c = parseFloat(k[4])
          // 1분봉을 step 단위 슬롯으로 분할 — 실제 OHLC 값 사용
          for (let s = 0; s < 60; s += step) {
            candles.push({ time: minStart + s, open: o, high: h, low: l, close: c })
          }
        }
        // 중복 time 제거 후 오름차순 정렬 (lightweight-charts 요구사항)
        const seen = new Set<number>()
        const unique = candles.filter(c => { if (seen.has(c.time)) return false; seen.add(c.time); return true })
        unique.sort((a, b) => a.time - b.time)
        candleMapRef.current.clear()
        unique.forEach((c) => candleMapRef.current.set(c.time, c))
        return unique
      }
      // 1m / 1h / 1d
      const res = await fetch(
        `https://fapi.binance.com/fapi/v1/klines?symbol=BTCUSDT&interval=${cfg.binance}&limit=${cfg.limit}`
      )
      const data: any[][] = await res.json()
      if (!Array.isArray(data)) return []
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
        textColor: "rgba(212,175,55,0.55)",
        fontFamily: "inherit",
      },
      grid: {
        vertLines: { color: "rgba(212,175,55,0.07)" },
        horzLines: { color: "rgba(212,175,55,0.07)" },
      },
      crosshair: {
        vertLine: { color: "rgba(212,175,55,0.45)", labelBackgroundColor: "#1a3a2a" },
        horzLine: { color: "rgba(212,175,55,0.45)", labelBackgroundColor: "#1a3a2a" },
      },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.1 } },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: true,  // 1s/30s 봉에서 초 단위 시각 표시
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

  // Binance WebSocket 직접 연결 제거 — Railway usePriceWorker(window) 단일 소스로 통일
  // 차트 캔들 실시간 업데이트는 위 window 구독 useEffect에서 처리합니다.

  const isPositive = (ticker?.changePercent ?? 0) >= 0

  return (
    <Card
      className="p-4 border-0 overflow-hidden"
      style={{
        background: "radial-gradient(ellipse at 50% 0%, #1a4a2e 0%, #0d2e1a 40%, #091f12 100%)",
        backgroundImage: `
          radial-gradient(ellipse at 50% 0%, #1a4a2e 0%, #0d2e1a 40%, #091f12 100%),
          repeating-linear-gradient(0deg, transparent, transparent 28px, rgba(212,175,55,0.03) 28px, rgba(212,175,55,0.03) 29px),
          repeating-linear-gradient(90deg, transparent, transparent 28px, rgba(212,175,55,0.03) 28px, rgba(212,175,55,0.03) 29px)
        `,
        boxShadow: "inset 0 0 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,55,0.18)",
      }}
    >
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
            <p className="text-[11px] leading-tight" style={{ color: "rgba(212,175,55,0.5)" }}>배팅 기준가</p>
            <p className="text-sm font-bold tabular-nums truncate" style={{ color: "#d4af37" }}>
              ${closingPrices.length > 0
                ? closingPrices[closingPrices.length - 1].price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
                : "로딩 중..."}
            </p>
            <div className="flex items-center gap-0.5 mt-0.5">
              {INTERVALS.map((btn) => (
                <button
                  key={btn}
                  onClick={() => { candleMapRef.current.clear(); setIntervalState(btn) }}
                  className="h-5 px-1.5 text-[10px] rounded font-semibold transition-all"
                  style={interval === btn
                    ? { background: "rgba(212,175,55,0.2)", color: "#d4af37", border: "1px solid rgba(212,175,55,0.4)" }
                    : { background: "transparent", color: "rgba(212,175,55,0.4)", border: "1px solid transparent" }}
                >
                  {INTERVAL_CONFIG[btn].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 오른쪽: 현재가 + 변동률 */}
        <div className="shrink-0 text-right">
          {ticker ? (
            <>
              <p className="text-[11px] font-medium mb-0.5" style={{ color: "rgba(212,175,55,0.5)" }}>현재가</p>
              <p className="text-sm font-bold tabular-nums leading-tight" style={{ color: "#e8d5a3" }}>
                ${ticker.price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </p>
              <div className={`flex items-center justify-end gap-0.5 text-[11px] font-semibold mt-0.5 ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                <span>{isPositive ? "+" : ""}{ticker.changePercent.toFixed(2)}%</span>
              </div>
            </>
          ) : (
            <span className="text-xs animate-pulse" style={{ color: "rgba(212,175,55,0.4)" }}>로딩 중...</span>
          )}
        </div>
      </div>

      {/* 차트 */}
      <div className="relative w-full h-[180px] rounded-lg overflow-hidden">
        <div ref={chartContainerRef} className="w-full h-full" />

        {/* 차트 내 거래량/거래대금 오버레이 */}
        {ticker && (
          <div
            className="absolute bottom-8 left-2 px-2 py-1 rounded text-[10px] z-10"
            style={{
              background: "rgba(9,31,18,0.82)",
              backdropFilter: "blur(4px)",
              border: "1px solid rgba(212,175,55,0.15)",
              color: "rgba(212,175,55,0.45)",
            }}
          >
            <div>거래량: <span style={{ color: "rgba(232,213,163,0.7)", fontWeight: 600 }}>{ticker.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })} BTC</span></div>
            <div>거래대금: <span style={{ color: "rgba(232,213,163,0.7)", fontWeight: 600 }}>{formatQuoteVolume(ticker.quoteAssetVolume)}</span></div>
          </div>
        )}

        {/* 펠트 테두리 광택 효과 */}
        <div className="absolute inset-0 pointer-events-none" style={{
          boxShadow: "inset 0 0 40px rgba(0,0,0,0.3), inset 0 0 1px rgba(212,175,55,0.15)",
          borderRadius: 8,
        }} />
      </div>
    </Card>
  )
}
