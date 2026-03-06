"use client"

import { useEffect, useRef } from "react"

interface UsePriceWorkerOptions {
  onConnected?: () => void
  onDisconnected?: () => void
  onPrice?: (price: number, time: number) => void
  onClosingPrice?: (price: number, time: number) => void
  onInitClosing?: (prices: Array<{ time: number; price: number }>) => void
}

export function usePriceWorker(options: UsePriceWorkerOptions) {
  const optsRef = useRef(options)
  useEffect(() => { optsRef.current = options })

  useEffect(() => {
    if (typeof window === "undefined") return

    const win = window as any
    let ws: WebSocket | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let heartbeatTimer: ReturnType<typeof setTimeout> | null = null
    let closed = false

    const serverUrl = process.env.NEXT_PUBLIC_PRICE_SERVER_URL

    if (serverUrl) {
      // ── Price Server 모드 (프로덕션) ──────────────────────────
      // 30초 안에 메시지가 없으면 소켓을 강제로 닫고 재연결
      const HEARTBEAT_TIMEOUT = 30000

      const resetHeartbeat = () => {
        if (heartbeatTimer) clearTimeout(heartbeatTimer)
        heartbeatTimer = setTimeout(() => {
          ws?.close()
        }, HEARTBEAT_TIMEOUT)
      }

      const connect = () => {
        if (closed) return
        ws = new WebSocket(serverUrl)

        ws.onopen = () => {
          optsRef.current.onConnected?.()
          resetHeartbeat()
        }

        ws.onmessage = (event) => {
          resetHeartbeat()
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
              }
            }
          } catch { /* ignore malformed messages */ }
        }

        ws.onclose = () => {
          if (heartbeatTimer) clearTimeout(heartbeatTimer)
          optsRef.current.onDisconnected?.()
          if (!closed) retryTimer = setTimeout(connect, 3000)
        }

        ws.onerror = () => {
          ws?.close()
        }
      }

      connect()

    } else {
      // ── 개발용 폴백: Binance 직접 연결 ──────────────────────
      const tradeBuffer: Array<{ price: number; time: number }> = []
      let prevThirtyBucket: number | null = null

      const connect = () => {
        if (closed) return
        ws = new WebSocket("wss://fstream.binance.com/ws/btcusdt@aggTrade")

        ws.onopen = () => optsRef.current.onConnected?.()

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string)
            tradeBuffer.push({
              price: parseFloat(msg.p),
              time: Math.floor(msg.T / 1000),
            })
          } catch { /* ignore */ }
        }

        ws.onclose = () => {
          optsRef.current.onDisconnected?.()
          if (!closed) retryTimer = setTimeout(connect, 3000)
        }

        ws.onerror = () => ws?.close()
      }

      connect()

      const timer = setInterval(() => {
        const now = Math.floor(Date.now() / 1000)
        const trades = tradeBuffer.filter((t) => t.time >= now)
        if (trades.length === 0) return

        const closingPrice = trades[trades.length - 1].price
        optsRef.current.onPrice?.(closingPrice, now)
        win.__bitcoinCurrentPrice = closingPrice

        const thirtyBucket = now - (now % 30)
        if (prevThirtyBucket === null || thirtyBucket !== prevThirtyBucket) {
          prevThirtyBucket = thirtyBucket
          optsRef.current.onClosingPrice?.(closingPrice, thirtyBucket)
          const prev: Array<{ time: number; price: number }> = win.__bitcoinClosingPrices ?? []
          win.__bitcoinClosingPrices = [...prev, { time: thirtyBucket, price: closingPrice }].slice(-100)
        }

        const cutoff = now - 300
        const idx = tradeBuffer.findIndex((t) => t.time >= cutoff)
        if (idx > 0) tradeBuffer.splice(0, idx)
      }, 1000)

      return () => {
        closed = true
        if (retryTimer) clearTimeout(retryTimer)
        clearInterval(timer)
        ws?.close()
      }
    }

    return () => {
      closed = true
      if (retryTimer) clearTimeout(retryTimer)
      if (heartbeatTimer) clearTimeout(heartbeatTimer)
      ws?.close()
    }
  }, [])
}
