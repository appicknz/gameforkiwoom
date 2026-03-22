"use client"

import { useEffect, useRef } from "react"

interface UsePriceWorkerOptions {
  onConnected?: () => void
  onDisconnected?: () => void
  onPrice?: (price: number, time: number) => void
  onClosingPrice?: (price: number, time: number) => void
  onInitClosing?: (prices: Array<{ time: number; price: number }>) => void
  onServerTimeOffset?: (offsetMs: number) => void
}

/**
 * 두 가지 역할:
 *
 * 1) Binance 현물 aggTrade WebSocket → onPrice / baka:price dispatch
 *    (실시간 현재가 - 차트, 헤더 표시용)
 *
 * 2) SSE /api/closing-price/stream → onClosingPrice / baka:closing dispatch
 *    서버가 Binance kline_30s 마감 확정 시 Redis에 저장 → SSE로 모든 클라이언트에 push
 *    → 폴링 없이 모든 기기가 동시에 동일한 마감가를 받음 → 3번째 카드 일치
 *
 * 3) /api/server-time → 서버 시간과 클라이언트 시계 offset 계산
 *    → 타이머를 서버 시간 기준으로 보정해서 PC/모바일 불일치 해결
 */
export function usePriceWorker(options: UsePriceWorkerOptions) {
  const optsRef = useRef(options)
  useEffect(() => { optsRef.current = options })

  useEffect(() => {
    if (typeof window === "undefined") return
    const win = window as any
    let closed = false
    let tradeWs: WebSocket | null = null
    let tradeRetry: ReturnType<typeof setTimeout> | null = null
    let sseSource: EventSource | null = null

    // ── 1) 서버 시간 동기화 ─────────────────────────────────────────────────
    // 서버와 클라이언트 시계 차이를 계산해서 타이머를 보정합니다
    const syncServerTime = async () => {
      try {
        const t0 = Date.now()
        const res = await fetch("/api/server-time")
        const t1 = Date.now()
        const { serverTime } = await res.json()
        // RTT의 절반을 보정값으로 사용
        const offsetMs = serverTime - (t0 + t1) / 2
        win.__serverTimeOffsetMs = offsetMs
        optsRef.current.onServerTimeOffset?.(offsetMs)
      } catch {}
    }
    syncServerTime()
    // 5분마다 재동기화
    const syncInterval = setInterval(syncServerTime, 5 * 60 * 1000)

    // ── 2) 초기 마감가 로드 (새로고침 복원) ────────────────────────────────
    fetch("/api/closing-price")
      .then((r) => r.json())
      .then((data) => {
        if (data.prices && data.prices.length > 0) {
          win.__bitcoinClosingPrices = data.prices
          optsRef.current.onInitClosing?.(data.prices)
          const latest = data.prices[data.prices.length - 1]
          window.dispatchEvent(new CustomEvent("baka:closing", {
            detail: { price: latest.price, time: latest.time }
          }))
        }
      })
      .catch(() => {})

    // ── 3) SSE 구독: 마감가 실시간 수신 ────────────────────────────────────
    // 서버가 Redis에 마감가를 저장하면 SSE가 즉시 push → 폴링 불필요
    const connectSSE = () => {
      if (closed) return
      sseSource = new EventSource("/api/closing-price/stream")

      sseSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type !== "closing") return

          const { price, time } = data
          if (!price || !time) return

          // 전역 마감가 목록 업데이트
          const prev: Array<{ time: number; price: number }> = win.__bitcoinClosingPrices ?? []
          const last = prev[prev.length - 1]
          if (!last || last.time !== time) {
            win.__bitcoinClosingPrices = [...prev, { time, price }].slice(-100)
          }

          // baka:closing dispatch → bitcoin-chart, baka/page 구독자에게 전달
          window.dispatchEvent(new CustomEvent("baka:closing", {
            detail: { price, time }
          }))

          // onClosingPrice 직접 호출 → baka-betting-game.tsx
          optsRef.current.onClosingPrice?.(price, time)
        } catch {}
      }

      sseSource.onerror = () => {
        sseSource?.close()
        if (!closed) setTimeout(connectSSE, 3000)
      }
    }
    connectSSE()

    // ── 4) Binance aggTrade: 현물 현재가 실시간 ─────────────────────────────
    const connectTrade = () => {
      if (closed) return
      tradeWs = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@aggTrade")

      tradeWs.onopen = () => optsRef.current.onConnected?.()

      tradeWs.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string)
          const price = parseFloat(msg.p)
          const time = Math.floor(msg.T / 1000)
          if (isNaN(price) || price <= 0) return
          win.__bitcoinCurrentPrice = price
          optsRef.current.onPrice?.(price, time)
          window.dispatchEvent(new CustomEvent("baka:price", { detail: { price, time } }))
        } catch {}
      }

      tradeWs.onclose = () => {
        optsRef.current.onDisconnected?.()
        if (!closed) tradeRetry = setTimeout(connectTrade, 3000)
      }

      tradeWs.onerror = () => tradeWs?.close()
    }
    connectTrade()

    return () => {
      closed = true
      clearInterval(syncInterval)
      if (tradeRetry) clearTimeout(tradeRetry)
      tradeWs?.close()
      sseSource?.close()
    }
  }, [])
}
