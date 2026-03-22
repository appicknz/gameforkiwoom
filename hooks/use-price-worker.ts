"use client"

import { useEffect, useRef } from "react"

interface UsePriceWorkerOptions {
  onConnected?: () => void
  onDisconnected?: () => void
  onPrice?: (price: number, time: number) => void
  onClosingPrice?: (price: number, time: number) => void
  onInitClosing?: (prices: Array<{ time: number; price: number }>) => void
}

/**
 * 단일 소스: Binance 현물 WebSocket (stream.binance.com) 직접 연결
 *
 * - aggTrade  → baka:price dispatch + onPrice 콜백
 * - kline_30s → k.x===true 시 baka:closing dispatch + onClosingPrice 콜백 + DB 저장
 *
 * 모든 클라이언트가 이 훅을 통해 동일한 Binance 현물 가격을 받습니다.
 * 서버 시간 기준 00초/30초에 확정되는 마감가를 3번째 카드에 사용합니다.
 */
export function usePriceWorker(options: UsePriceWorkerOptions) {
  const optsRef = useRef(options)
  useEffect(() => { optsRef.current = options })

  useEffect(() => {
    if (typeof window === "undefined") return
    const win = window as any
    let closed = false
    let tradeWs: WebSocket | null = null
    let klineWs: WebSocket | null = null
    let tradeRetry: ReturnType<typeof setTimeout> | null = null
    let klineRetry: ReturnType<typeof setTimeout> | null = null

    // ── 1) 새로고침 시 DB에서 초기 마감가 로드 ──────────────────────────────
    fetch("/api/closing-price")
      .then((r) => r.json())
      .then((data) => {
        if (data.prices && data.prices.length > 0) {
          win.__bitcoinClosingPrices = data.prices
          optsRef.current.onInitClosing?.(data.prices)
          // 가장 최근 마감가를 baka:closing으로 dispatch → 화면 표시 즉시 복원
          const latest = data.prices[data.prices.length - 1]
          window.dispatchEvent(new CustomEvent("baka:closing", {
            detail: { price: latest.price, time: latest.time }
          }))
        }
      })
      .catch(() => {})

    // ── 2) aggTrade: 현물 현재가 실시간 ────────────────────────────────────
    const connectTrade = () => {
      if (closed) return
      tradeWs = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@aggTrade")

      tradeWs.onopen = () => {
        optsRef.current.onConnected?.()
      }

      tradeWs.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string)
          const price = parseFloat(msg.p)
          const time = Math.floor(msg.T / 1000)
          if (isNaN(price) || price <= 0) return
          win.__bitcoinCurrentPrice = price
          optsRef.current.onPrice?.(price, time)
          // baka:price dispatch → bitcoin-chart.tsx + baka/page.tsx 헤더가 구독
          window.dispatchEvent(new CustomEvent("baka:price", { detail: { price, time } }))
        } catch { /* ignore */ }
      }

      tradeWs.onclose = () => {
        optsRef.current.onDisconnected?.()
        if (!closed) tradeRetry = setTimeout(connectTrade, 3000)
      }

      tradeWs.onerror = () => { tradeWs?.close() }
    }

    // ── 3) kline_30s: 30초봉 마감 확정 ─────────────────────────────────────
    //      k.x===true 인 경우만 처리 → 서버 시간 기준 정확히 00초/30초
    const connectKline = () => {
      if (closed) return
      klineWs = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@kline_30s")

      klineWs.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string)
          const k = msg.k
          if (!k || !k.x) return  // 마감 확정된 캔들만 처리

          const closePrice = parseFloat(k.c)
          const closeTime = Math.floor(k.T / 1000)  // 봉 마감 타임스탬프 (초)

          if (isNaN(closePrice) || closePrice <= 0) return

          // 전역 마감가 목록 업데이트
          const prev: Array<{ time: number; price: number }> = win.__bitcoinClosingPrices ?? []
          const last = prev[prev.length - 1]
          if (!last || last.time !== closeTime) {
            win.__bitcoinClosingPrices = [...prev, { time: closeTime, price: closePrice }].slice(-100)
          }

          // baka:closing dispatch → 모든 구독자(bitcoin-chart, baka/page, use-price-worker 자신)
          window.dispatchEvent(new CustomEvent("baka:closing", {
            detail: { price: closePrice, time: closeTime }
          }))

          // onClosingPrice 직접 호출 → baka-betting-game.tsx의 onFinalDigitTrigger
          optsRef.current.onClosingPrice?.(closePrice, closeTime)

          // DB 저장 (fire-and-forget) → 새로고침 복원용
          fetch("/api/closing-price", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ price: closePrice, time: closeTime }),
          }).catch(() => {})

        } catch { /* ignore */ }
      }

      klineWs.onclose = () => {
        if (!closed) klineRetry = setTimeout(connectKline, 3000)
      }

      klineWs.onerror = () => { klineWs?.close() }
    }

    connectTrade()
    connectKline()

    return () => {
      closed = true
      if (tradeRetry) clearTimeout(tradeRetry)
      if (klineRetry) clearTimeout(klineRetry)
      tradeWs?.close()
      klineWs?.close()
    }
  }, [])
}
