"use client"

import { useEffect, useRef } from "react"

interface UseBitcoinPriceOptions {
  onConnected?: () => void
  onDisconnected?: () => void
  onPrice?: (price: number, time: number) => void
  onClosingPrice?: (price: number, time: number) => void
  onInitClosing?: (prices: Array<{ time: number; price: number }>) => void
}

// 모듈 레벨 공유 상태 — window 대신 모듈 변수 사용
let sharedClosingPrices: Array<{ time: number; price: number }> = []
let sharedCurrentPrice = 0

export function getSharedClosingPrices() {
  return sharedClosingPrices
}

export function getSharedCurrentPrice() {
  return sharedCurrentPrice
}

export function usePriceWorker(options: UseBitcoinPriceOptions) {
  const optsRef = useRef(options)
  useEffect(() => { optsRef.current = options })

  useEffect(() => {
    if (typeof window === "undefined") return

    let ws: WebSocket | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let closed = false

    const serverUrl = process.env.NEXT_PUBLIC_PRICE_SERVER_URL

    if (serverUrl) {
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
              sharedClosingPrices = data.closingPrices
              optsRef.current.onInitClosing?.(data.closingPrices)
              return
            }

            if (data.type === "price") {
              sharedCurrentPrice = data.price
              optsRef.current.onPrice?.(data.price, data.time)
              return
            }

            if (data.type === "closing") {
              optsRef.current.onClosingPrice?.(data.price, data.time)
              const last = sharedClosingPrices[sharedClosingPrices.length - 1]
              if (!last || last.time !== data.time) {
                const next = [...sharedClosingPrices, { time: data.time, price: data.price }]
                sharedClosingPrices = next.slice(-100)
              }
            }
          } catch { /* ignore malformed messages */ }
        }

        ws.onclose = () => {
          optsRef.current.onDisconnected?.()
          if (!closed) retryTimer = setTimeout(connect, 3000)
        }

        ws.onerror = () => {
          ws?.close()
        }
      }

      connect()

    } else {
      console.warn("[useBitcoinPrice] NEXT_PUBLIC_PRICE_SERVER_URL not set, falling back to Binance direct")

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
        sharedCurrentPrice = closingPrice
        optsRef.current.onPrice?.(closingPrice, now)

        const thirtyBucket = now - (now % 30)
        if (prevThirtyBucket === null || thirtyBucket !== prevThirtyBucket) {
          prevThirtyBucket = thirtyBucket
          optsRef.current.onClosingPrice?.(closingPrice, thirtyBucket)
          const next = [...sharedClosingPrices, { time: thirtyBucket, price: closingPrice }]
          sharedClosingPrices = next.slice(-100)
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
      ws?.close()
    }
  }, [])
}
