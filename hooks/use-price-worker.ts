"use client"

import { useEffect, useRef } from "react"

export interface TradeMessage {
  type: "trade"
  price: number
  quantity: number
  time: number
}

interface UsePriceWorkerOptions {
  onTrade?: (msg: TradeMessage) => void
  onConnected?: () => void
  onDisconnected?: () => void
  onPrice?: (price: number, time: number) => void
  onClosingPrice?: (price: number, time: number) => void
  onInitClosing?: (prices: Array<{ time: number; price: number }>) => void
}

/**
 * /api/price-stream SSE에 연결합니다.
 * 서버가 Binance WebSocket 단 하나를 열고 집계한 가격을 Redis에 저장,
 * 모든 클라이언트는 이 SSE를 통해 완전히 동일한 가격을 수신합니다.
 */
export function usePriceWorker(options: UsePriceWorkerOptions) {
  const optsRef = useRef(options)
  useEffect(() => { optsRef.current = options })

  useEffect(() => {
    if (typeof window === "undefined") return

    let es: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let closed = false

    const connect = () => {
      if (closed) return

      es = new EventSource("/api/price-stream")

      es.onopen = () => {
        optsRef.current.onConnected?.()
      }

      es.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === "init_closing") {
            optsRef.current.onInitClosing?.(data.prices)
            if (typeof window !== "undefined") {
              (window as any).__bitcoinClosingPrices = data.prices
            }
            return
          }

          if (data.type === "price") {
            const { price, time } = data

            optsRef.current.onPrice?.(price, time)

            // onTrade 하위 호환 — bitcoin-chart의 tradeBuffer를 채우기 위해
            optsRef.current.onTrade?.({ type: "trade", price, quantity: 0, time })

            if (typeof window !== "undefined") {
              (window as any).__bitcoinCurrentPrice = price
            }
            return
          }

          if (data.type === "closing") {
            const { price, time } = data
            optsRef.current.onClosingPrice?.(price, time)

            if (typeof window !== "undefined") {
              const prev: Array<{ time: number; price: number }> =
                (window as any).__bitcoinClosingPrices ?? []
              const last = prev[prev.length - 1]
              if (!last || last.time !== time) {
                const updated = [...prev, { time, price }].slice(-100)
                ;(window as any).__bitcoinClosingPrices = updated
              }
            }
          }
        } catch {}
      }

      es.onerror = () => {
        optsRef.current.onDisconnected?.()
        es?.close()
        es = null
        if (!closed) {
          retryTimer = setTimeout(connect, 3000)
        }
      }
    }

    connect()

    return () => {
      closed = true
      if (retryTimer) clearTimeout(retryTimer)
      es?.close()
    }
  }, [])
}
