"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Card } from "@/components/ui/card"
import { TrendingUp, TrendingDown } from "lucide-react"
import { createChart, ColorType, type IChartApi, type ISeriesApi, LineSeries } from "lightweight-charts"
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

export function BitcoinChart({ headerOnly = false, compact = false }: { headerOnly?: boolean; compact?: boolean } = {}) {
  const chartContainerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)
  const ma7Ref = useRef<ISeriesApi<"Line"> | null>(null)
  const ma25Ref = useRef<ISeriesApi<"Line"> | null>(null)
  const ma99Ref = useRef<ISeriesApi<"Line"> | null>(null)
  const priceLineRef = useRef<any>(null)
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
  const drawPriceLine = useCallback((price: number) => {
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
  }, [])

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

  // Railway WS는 BakaBettingGame 단일 인스턴스에서만 연결
  // → baka:price / baka:closing CustomEvent를 구독
  useEffect(() => {
    const onPrice = (e: Event) => {
      const { price } = (e as CustomEvent).detail
      handlePrice(price, Math.floor(Date.now() / 1000))
    }
    const onClosing = (e: Event) => {
      const { price, time } = (e as CustomEvent).detail
      handleClosingPrice(price, time)
    }
    window.addEventListener("baka:price", onPrice)
    window.addEventListener("baka:closing", onClosing)
    // 초기 마감가: window.__bitcoinClosingPrices 에서 읽기 (BakaBettingGame의 usePriceWorker가 init 시 세팅)
    const initPrices: Array<{ time: number; price: number }> = (window as any).__bitcoinClosingPrices ?? []
    if (initPrices.length > 0) handleInitClosing(initPrices)
    return () => {
      window.removeEventListener("baka:price", onPrice)
      window.removeEventListener("baka:closing", onClosing)
    }
  }, [handlePrice, handleClosingPrice, handleInitClosing])

  // connected 상태: baka:price 첫 수신 시 true
  useEffect(() => {
    const onFirst = () => setConnected(true)
    window.addEventListener("baka:price", onFirst, { once: true })
    return () => window.removeEventListener("baka:price", onFirst)
  }, [])

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
      try { chartRef.current.remove() } catch {}
      chartRef.current = null
      seriesRef.current = null
    }

    const container = chartContainerRef.current
    // compact(빅로드 내부)일 때는 골드 테마, 일반일 때는 바이낸스 다크 테마
    const chart = createChart(container, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: compact ? "rgba(212,175,55,0.55)" : "rgba(180,180,180,0.75)",
        fontFamily: compact ? "inherit" : "'Roboto Mono','Courier New',monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: compact ? "rgba(212,175,55,0.07)" : "rgba(255,255,255,0.04)" },
        horzLines: { color: compact ? "rgba(212,175,55,0.07)" : "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        vertLine: { color: compact ? "rgba(212,175,55,0.45)" : "rgba(255,255,255,0.3)", labelBackgroundColor: compact ? "#1a3a2a" : "#2b2b43" },
        horzLine: { color: compact ? "rgba(212,175,55,0.45)" : "rgba(255,255,255,0.3)", labelBackgroundColor: compact ? "#1a3a2a" : "#2b2b43" },
      },
      rightPriceScale: {
        borderVisible: false,
        scaleMargins: { top: 0.08, bottom: 0.08 },
        textColor: compact ? "rgba(212,175,55,0.55)" : "rgba(160,160,160,0.7)",
      },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: interval === "1s" || interval === "30s",
      },
      handleScroll: true,
      handleScale: true,
    })

    chartRef.current = chart

    // 바이낸스 캔들 색상: 상승 #26a69a(청록), 하락 #ef5350(빨강)
    const candleSeries = chart.addCandlestickSeries({
      upColor: "#26a69a", downColor: "#ef5350",
      borderUpColor: "#26a69a", borderDownColor: "#ef5350",
      wickUpColor: "#26a69a", wickDownColor: "#ef5350",
      priceLineVisible: true,
      priceLineColor: "#26a69a",
      lastValueVisible: true,
    })
    seriesRef.current = candleSeries

    // MA 선 3개 — 일반 패널 전용 (compact/빅로드 내부에서는 불필요)
    if (!compact) {
      ma7Ref.current = chart.addLineSeries({
        color: "#f0b90b", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      })
      ma25Ref.current = chart.addLineSeries({
        color: "#f45b92", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      })
      ma99Ref.current = chart.addLineSeries({
        color: "#9c6dcd", lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false,
      })
    }

    const resizeObserver = new ResizeObserver(() => {
      // cancelled 체크로 dispose 이후 호출 방지
      if (!cancelled && chartRef.current && container) {
        try { chartRef.current.applyOptions({ width: container.clientWidth }) } catch {}
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
          const closePrice = parseFloat(k.c)
          const candle: CandleData = {
            time: barTime,
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: closePrice,
          }
          candleMapRef.current.set(barTime, candle)
          try { seriesRef.current.update(candle) } catch { /* 순 방어 */ }

          // 실시간 MA 업데이트 — 최근 99개 캔들로 계산
          const allCandles = Array.from(candleMapRef.current.values()).sort((a, b) => a.time - b.time)
          const maPoint = (period: number) => {
            if (allCandles.length < period) return null
            const slice = allCandles.slice(-period)
            return { time: barTime as any, value: slice.reduce((s, c) => s + c.close, 0) / period }
          }
          const ma7p = maPoint(7);  if (ma7p && ma7Ref.current)  try { ma7Ref.current.update(ma7p) }  catch {}
          const ma25p = maPoint(25); if (ma25p && ma25Ref.current) try { ma25Ref.current.update(ma25p) } catch {}
          const ma99p = maPoint(99); if (ma99p && ma99Ref.current) try { ma99Ref.current.update(ma99p) } catch {}

          // 차트 라벨과 동일한 Binance close 가격을 현재가로 브로드캐스트
          handlePrice(closePrice, Math.floor(Date.now() / 1000))
          window.dispatchEvent(new CustomEvent("baka:price", { detail: { price: closePrice } }))
        } catch { /* JSON parse 오류 무시 */ }
      }

      ws.onclose = (e) => {
        if (!cancelled && e.code !== 1000) {
          klineReconnectRef.current = setTimeout(startKlineWS, 3000)
        }
      }
      ws.onerror = () => ws.close()
    }

    // MA 계산 헬퍼
    const calcMA = (candles: CandleData[], period: number) =>
      candles.slice(period - 1).map((_, i) => ({
        time: candles[i + period - 1].time as any,
        value: candles.slice(i, i + period).reduce((s, c) => s + c.close, 0) / period,
      }))

    fetchInitialCandles(interval).then((candles) => {
      if (cancelled) return
      if (candles.length > 0 && seriesRef.current) {
        seriesRef.current.setData(candles)
        // MA 초기 세팅
        if (ma7Ref.current)  ma7Ref.current.setData(calcMA(candles, 7))
        if (ma25Ref.current) ma25Ref.current.setData(calcMA(candles, 25))
        if (ma99Ref.current) ma99Ref.current.setData(calcMA(candles, 99))
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
      // 1) 우리 ResizeObserver 먼저 해제
      resizeObserver.disconnect()
      // 2) WS 정리
      if (klineReconnectRef.current) clearTimeout(klineReconnectRef.current)
      klineWsRef.current?.close(1000)
      klineWsRef.current = null
      // 3) series ref null → 이후 WS/async 콜백이 series에 접근 못하게 차단
      seriesRef.current = null
      ma7Ref.current = null
      ma25Ref.current = null
      ma99Ref.current = null
      chartRef.current = null
      // 4) lightweight-charts 내부 ResizeObserver가 dispose 이후 콜백되는 것을 막기 위해
      //    컨테이너를 DOM에서 분리한 뒤 remove() 호출
      try {
        const parent = container.parentNode
        if (parent) parent.removeChild(container)
        chart.remove()
      } catch {}
    }
  }, [interval, fetchInitialCandles, drawPriceLine])

  const isPositive = (ticker?.changePercent ?? 0) >= 0

  // compact 모드: Card/헤더 없이 차트 영역만 렌더링 (BigRoad 내 임베드용)
  if (compact) {
    return (
      <div className="relative w-full h-full">
        <div ref={chartContainerRef} className="w-full h-full" />
        {ticker && (
          <div
            className="absolute bottom-6 left-2 px-1.5 py-0.5 rounded text-[9px] z-10"
            style={{
              background: "rgba(9,31,18,0.82)",
              border: "1px solid rgba(212,175,55,0.12)",
              color: "rgba(212,175,55,0.45)",
            }}
          >
            <div>거래량: <span style={{ color: "rgba(232,213,163,0.7)", fontWeight: 600 }}>{ticker.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })} BTC</span></div>
            <div>거래대금: <span style={{ color: "rgba(232,213,163,0.7)", fontWeight: 600 }}>{formatQuoteVolume(ticker.quoteAssetVolume)}</span></div>
          </div>
        )}
      </div>
    )
  }

  const basePrice = closingPrices.length > 0 ? closingPrices[closingPrices.length - 1].price : null

  return (
    <div style={{ background: "#131722", borderRadius: 8, overflow: "hidden", padding: "10px 12px 0" }}>
      {/* 헤더: 바이낸스 스타일 */}
      <div className="flex items-start justify-between gap-2 mb-2">
        {/* 왼쪽: 배팅 기준가 */}
        <div className="flex items-start gap-2 min-w-0">
          <img src="/bitcoin-logo.jpg" alt="Bitcoin" className="w-8 h-8 shrink-0 rounded-full object-cover mt-0.5" />
          <div className="min-w-0">
            <p style={{ fontSize: 10, color: "rgba(160,160,160,0.6)", marginBottom: 1 }}>배팅 기준가</p>
            <p style={{ fontSize: 18, fontWeight: 700, color: isPositive ? "#26a69a" : "#ef5350", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
              {basePrice ? `$${basePrice.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : "—"}
            </p>
            {/* 인터벌 탭 — 바이낸스처럼 텍스트 버튼 */}
            <div className="flex items-center gap-3 mt-1.5">
              {INTERVALS.map((btn) => (
                <button
                  key={btn}
                  onClick={() => { candleMapRef.current.clear(); setIntervalState(btn) }}
                  style={{
                    fontSize: 11, fontWeight: 600, padding: "1px 0",
                    color: interval === btn ? "#f0b90b" : "rgba(160,160,160,0.5)",
                    borderBottom: interval === btn ? "2px solid #f0b90b" : "2px solid transparent",
                    background: "transparent",
                  }}
                >
                  {INTERVAL_CONFIG[btn].label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 오른쪽: 현재가 */}
        <div className="shrink-0 text-right">
          <p style={{ fontSize: 10, color: "rgba(160,160,160,0.6)", marginBottom: 1, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 4 }}>
            <span style={{
              width: 6, height: 6, borderRadius: "50%",
              background: !connected ? "#ef5350" : stale ? "#f59e0b" : "#26a69a",
              boxShadow: connected && !stale ? "0 0 5px #26a69a" : "none",
              display: "inline-block", flexShrink: 0,
              animation: connected && !stale ? "pricePulse 1.4s ease-in-out infinite" : "none",
            }} />
            현재가
          </p>
          <style>{`@keyframes pricePulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
          <p style={{ fontSize: 18, fontWeight: 700, color: isPositive ? "#26a69a" : "#ef5350", fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>
            <span ref={priceDisplayRef}>
              {ticker ? `$${ticker.price.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}` : "—"}
            </span>
          </p>
          <div style={{ fontSize: 11, fontWeight: 600, color: isPositive ? "#26a69a" : "#ef5350", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 3, marginTop: 2 }}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            <span>{isPositive ? "+" : ""}{ticker?.changePercent.toFixed(2) ?? "0.00"}%</span>
          </div>
        </div>
      </div>

      {/* MA 범례 — 바이낸스 스타일 */}
      {!headerOnly && (
        <div className="flex items-center gap-3 mb-1 px-0.5" style={{ fontSize: 10 }}>
          <span style={{ color: "#f0b90b" }}>MA(7)</span>
          <span style={{ color: "#f45b92" }}>MA(25)</span>
          <span style={{ color: "#9c6dcd" }}>MA(99)</span>
        </div>
      )}

      {/* 차트 */}
      {!headerOnly && (
        <div className="relative w-full overflow-hidden" style={{ height: 180 }}>
          <div ref={chartContainerRef} className="w-full h-full" />

          {/* 바이낸스 워터마크 */}
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            pointerEvents: "none", zIndex: 1,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, opacity: 0.07 }}>
              {/* 바이낸스 다이아몬드 로고 SVG */}
              <svg width="44" height="44" viewBox="0 0 24 24" fill="#848e9c">
                <path d="M12 1.5L7.5 6 12 10.5 16.5 6 12 1.5zM3 9L1.5 10.5 3 12 4.5 10.5 3 9zM21 9L19.5 10.5 21 12 22.5 10.5 21 9zM7.5 10.5L3 15l4.5 4.5L12 15l-4.5-4.5zM16.5 10.5L12 15l4.5 4.5L21 15l-4.5-4.5zM12 13.5L7.5 18 12 22.5 16.5 18 12 13.5z"/>
              </svg>
              <span style={{ fontSize: 32, fontWeight: 700, color: "#848e9c", letterSpacing: "0.08em", fontFamily: "sans-serif" }}>BINANCE</span>
            </div>
          </div>

          {/* 거래량 오버레이 */}
          {ticker && (
            <div style={{
              position: "absolute", bottom: 28, left: 8,
              padding: "3px 6px", borderRadius: 4, fontSize: 10, zIndex: 10,
              background: "rgba(19,23,34,0.85)", color: "rgba(160,160,160,0.6)",
            }}>
              <div>거래량: <span style={{ color: "#d1d4dc", fontWeight: 600 }}>{ticker.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })} BTC</span></div>
              <div>거래대금: <span style={{ color: "#d1d4dc", fontWeight: 600 }}>{formatQuoteVolume(ticker.quoteAssetVolume)}</span></div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
