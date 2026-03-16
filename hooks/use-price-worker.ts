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
 * Railway에 배포된 BTC price WebSocket 서버에 연결합니다.
 *
 * 서버(price-server/index.js)가 Binance 현물(stream.binance.com) aggTrade +
 * kline_30s WebSocket을 열고 모든 클라이언트에 동시 브로드캐스트합니다.
 * → 전 세계 모든 사용자가 정확히 동일한 현물 가격을 수신합니다.
 *
 * 환경변수: NEXT_PUBLIC_PRICE_SERVER_URL
 * 예) wss://your-app.railway.app
 */
export function usePriceWorker(options: UsePriceWorkerOptions) {
  const optsRef = useRef(options)
  useEffect(() => { optsRef.current = options })

  useEffect(() => {
    if (typeof window === "undefined") return

    const win = window as any
    const serverUrl = process.env.NEXT_PUBLIC_PRICE_SERVER_URL
    if (!serverUrl) return

    let ws: WebSocket | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let closed = false

    const connect = () => {
      if (closed) return
      ws = new WebSocket(serverUrl)

      ws.onopen = () => {
        optsRef.current.onConnected?.()
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string)

          if (data.type === "init") {
            optsRef.current.onInitClosing?.(data.closingPrices)
            win.__bitcoinClosingPrices = data.closingPrices
            return
          }

          if (data.type === "price") {
            optsRef.current.onPrice?.(data.price, data.time)
            win.__bitcoinCurrentPrice = data.price
            return
          }

          if (data.type === "closing") {
            optsRef.current.onClosingPrice?.(data.price, data.time)
            const prev: Array<{ time: number; price: number }> = win.__bitcoinClosingPrices ?? []
            const last = prev[prev.length - 1]
            if (!last || last.time !== data.time) {
              win.__bitcoinClosingPrices = [...prev, { time: data.time, price: data.price }].slice(-100)
              fetch("/api/closing-price", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ price: data.price, time: data.time }),
              }).catch(() => {})
            }
          }
        } catch { /* ignore malformed messages */ }
      }

      ws.onclose = () => {
        optsRef.current.onDisconnected?.()
        if (!closed) retryTimer = setTimeout(connect, 3000)
      }

      ws.onerror = () => ws?.close()
    }

    connect()

    return () => {
      closed = true
      if (retryTimer) clearTimeout(retryTimer)
      ws?.close()
    }
  }, [])
}
