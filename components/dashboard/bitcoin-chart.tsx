"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { TrendingUp, TrendingDown } from "lucide-react"
import { createChart, ColorType, type IChartApi, type ISeriesApi } from "lightweight-charts"
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

const INTERVAL_CONFIG: Record<Interval, { label: string; binance: string; limit: number; seconds: number }> = {
  "1s":  { label: "1초",   binance: "1s", limit: 500, seconds: 1 },
  "30s": { label: "30초",  binance: "1s", limit: 500, seconds: 1 },   // 1s봉 REST+WS, 표시만 30s 단위
  "1m":  { label: "1분",   binance: "1m", limit: 200, seconds: 60 },
  "1h":  { label: "1시간", binance: "1h", limit: 168, seconds: 3600 },
  "1d":  { label: "1일",   binance: "1d", limit: 365, seconds: 86400 },
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
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const priceLineRef = useRef<any>(null)
  // drawPriceLine 최신 참조 — stale closure 방지
  const drawPriceLineRef = useRef<(price: number) => void>(() => {})
  const candleMapRef = useRef<Map<number, CandleData>>(new Map())
  // Binance kline WS — 캔들 OHLC 전용 (마감 이벤트 처리 안 함)
  const klineWsRef = useRef<WebSocket | null>(null)
  const klineReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // 최신 배팅 기준가를 ref로 유지 — 차트 재생성 후 수평선 복원에 사용
  const latestClosingPriceRef = useRef<number | null>(null)

  // 현재가 표시: React state 대신 DOM 직접 업데이트 → 매 틱마다 리렌더 없음
  const [ticker, setTicker] = useState<TickerData | null>(null)
  const priceDisplayRef = useRef<HTMLSpanElement>(null)
  const dotDisplayRef = useRef<HTMLSpanElement>(null)
  const [connected, setConnected] = useState(false)
  const connectedRef = useRef(false)
  const [stale, setStale] = useState(false)
  const lastTickAtRef = useRef<number>(Date.now())
  const [interval, setIntervalState] = useState<Interval>("1s")
  const [closingPrices, setClosingPrices] = useState<Array<{ time: number; price: number }>>([])

  // 선택된 interval의 seconds를 ref로 유지해 콜백 클로저에서 최신값 사용
  const intervalSecondsRef = useRef(INTERVAL_CONFIG["1s"].seconds)
  useEffect(() => {
    intervalSecondsRef.current = INTERVAL_CONFIG[interval].seconds
  }, [interval])

  // 3초 이상 틱이 없으면 stale 표시
  useEffect(() => {
    const id = setInterval(() => {
      const age = Date.now() - lastTickAtRef.current
      setStale(age > 3000)
    }, 1000)
    return () => clearInterval(id)
  }, [])

  // Railway aggTrade → 가격 표시 전용 (캔들은 Binance kline WS가 담당)
  // aggTrade는 체결 틱이라 OHLC 없음 → 이걸로 캔들 그리면 납작한 선이 됨
  const handlePrice = useCallback((price: number, _tradeTime: number) => {
    lastTickAtRef.current = Date.now()

    // DOM 직접 업데이트 — React 리렌더 없이 즉각 반영
    if (priceDisplayRef.current) {
      priceDisplayRef.current.textContent = `$${price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}`
    }

    // 첫 틱 수신 시 한 번만 state 업데이트 (초기 렌더용)
    if (!connectedRef.current) {
      connectedRef.current = true
      setTicker({ price, change: 0, changePercent: 0, high: price, low: price, volume: 0, quoteAssetVolume: 0 })
      setConnected(true)
    }
  }, [])

  // 수평선 그리기 헬퍼 — seriesRef가 살아있을 때만 동작
  // drawPriceLineRef.current 를 통해 항상 최신 seriesRef 를 바라봄
  const drawPriceLine = useCallback((price: number) => {
    drawPriceLineRef.current(price)
  }, [])

  useEffect(() => {
    drawPriceLineRef.current = (price: number) => {
      if (!seriesRef.current) return
      if (priceLineRef.current) {
        try { seriesRef.current.removePriceLine(priceLineRef.current) } catch { }
        priceLineRef.current = null
      }
      priceLineRef.current = seriesRef.current.createPriceLine({
        price,
        color: "#facc15",
        lineWidth: 1,
        lineStyle: 2,  // Dashed
        axisLabelVisible: true,
        title: "배팅가",
      })
    }
  })

  // 30초봉 마감가 수신 → ref 저장 + 노란 수평선 즉각 갱신
  const handleClosingPrice = useCallback((price: number, time: number) => {
    latestClosingPriceRef.current = price
    setClosingPrices(prev => {
      const last = prev[prev.length - 1]
      if (last?.time === time) return prev
      return [...prev, { time, price }].slice(-100)
    })
    drawPriceLine(price)
  }, [drawPriceLine])

  // 초기 마감가 배열 수신 (새로고침 복원) → 마지막 값으로 수평선
  const handleInitClosing = useCallback((prices: Array<{ time: number; price: number }>) => {
    if (prices.length === 0) return
    setClosingPrices(prices)
    const last = prices[prices.length - 1]
    if (last) {
      latestClosingPriceRef.current = last.price
      // seriesRef가 아직 준비됐으면 즉각 그리고, 아직 초기화 중이면
      // 차트 useEffect 내 fetchInitialCandles.then()에서 복원
      if (seriesRef.current) {
        drawPriceLine(last.price)
      }
    }
  }, [drawPriceLine])

  usePriceWorker({
    onConnected: useCallback(() => setConnected(true), []),
    onDisconnected: useCallback(() => setConnected(false), []),
    onPrice: handlePrice,
    onClosingPrice: handleClosingPrice,
    onInitClosing: handleInitClosing,
  })

  // 초기 캔들: Binance REST (interval에 맞는 봉 타입 그대로 사용)
  const fetchInitialCandles = useCallback(async (sel: Interval): Promise<CandleData[]> => {
    const cfg = INTERVAL_CONFIG[sel]
    try {
      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${cfg.binance}&limit=${cfg.limit}`
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

    let cancelled = false

    // Binance kline WS — 캔들 OHLC 전용 (마감 트리거 없음, 그것은 Railway 담당)
    const startKlineWS = () => {
      if (cancelled) return
      // 현물 스팟 kline 스트림: 1s/30s→1s봉, 1m→1m봉, 1h→1h봉, 1d→1d봉
      const wsInterval = INTERVAL_CONFIG[interval].binance
      const url = `wss://stream.binance.com:9443/ws/btcusdt@kline_${wsInterval}`
      const ws = new WebSocket(url)
      klineWsRef.current = ws

      ws.onmessage = (ev) => {
        if (cancelled || !seriesRef.current) return
        try {
          const { k } = JSON.parse(ev.data)
          const barTime = Math.floor(k.t / 1000) as any
          const candle: CandleData = {
            time: barTime,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
          }
          candleMapRef.current.set(barTime, candle)
          try { seriesRef.current.update(candle) } catch { /* 역순 방어 */ }
        } catch { /* JSON parse 오류 무시 */ }
      }

      ws.onclose = (e) => {
        if (!cancelled && e.code !== 1000) {
          klineReconnectRef.current = setTimeout(startKlineWS, 3000)
        }
      }
      ws.onerror = () => ws.close()
    }

    fetchInitialCandles(interval).then((candles) => {
      if (cancelled) return
      if (candles.length > 0 && seriesRef.current) {
        seriesRef.current.setData(candles)
        chartRef.current?.timeScale().scrollToRealTime()
      }
      // 차트 재생성 후 기존 배팅 기준가 수평선 복원
      // latestClosingPriceRef가 이미 세팅돼 있으면 즉각 복원,
      // init 메시지가 아직 안 왔으면 handleInitClosing에서 나중에 그림
      if (latestClosingPriceRef.current !== null) {
        drawPriceLine(latestClosingPriceRef.current)
      }
      startKlineWS()
      // 폴백: init 메시지가 차트보다 늦게 도착하는 경우를 대비해
      // DB에서 직접 최신 마감가를 조회해 수평선 복원
      if (latestClosingPriceRef.current === null) {
        fetch("/api/closing-price")
          .then(r => r.json())
          .then((data: { prices?: Array<{ time: number; price: number }> }) => {
            if (cancelled) return
            const prices = data.prices ?? []
            const last = prices[prices.length - 1]
            if (last && latestClosingPriceRef.current === null) {
              latestClosingPriceRef.current = last.price
              setClosingPrices(prices)
              drawPriceLine(last.price)
            }
          })
          .catch(() => {})
      }
    })

    return () => {
      cancelled = true
      if (klineReconnectRef.current) clearTimeout(klineReconnectRef.current)
      klineWsRef.current?.close(1000)
      klineWsRef.current = null
      resizeObserver.disconnect()
      chart.remove()
      chartRef.current = null
      seriesRef.current = null
      priceLineRef.current = null   // 구 series 참조 해제
    }
  }, [interval, fetchInitialCandles, drawPriceLine])

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
            src="/bitcoin-logo.jpg"
            alt="Bitcoin"
            className="w-9 h-9 shrink-0 rounded-full object-cover"
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
              <p className="text-[11px] font-medium mb-0.5 flex items-center justify-end gap-1" style={{ color: "rgba(212,175,55,0.5)" }}>
                {/* 연결 상태 표시등: 초록 점멸=정상, 노랑=stale, 빨강=연결끊김 */}
                <span
                  title={!connected ? "연결 끊김" : stale ? "업데이트 지연" : "실시간 연결 중"}
                  style={{
                    display: "inline-block",
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    flexShrink: 0,
                    background: !connected ? "#ef4444" : stale ? "#f59e0b" : "#22c55e",
                    boxShadow: !connected
                      ? "0 0 4px #ef4444"
                      : stale
                      ? "0 0 4px #f59e0b"
                      : "0 0 6px #22c55e",
                    animation: connected && !stale ? "pricePulse 1.4s ease-in-out infinite" : "none",
                  }}
                />
                현재가
              </p>
              <style>{`@keyframes pricePulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
              <p className="text-sm font-bold tabular-nums leading-tight" style={{ color: "#e8d5a3" }}>
                <span ref={priceDisplayRef}>
                  ${ticker.price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                </span>
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
