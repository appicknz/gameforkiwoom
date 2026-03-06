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
 * 서버(price-server/index.js)가 Binance aggTrade WebSocket 하나를 열고
 * 1초 집계 후 모든 클라이언트에 동시 브로드캐스트합니다.
 * → 전 세계 모든 사용자가 정확히 동일한 가격을 수신합니다.
 *
 * 환경변수: NEXT_PUBLIC_PRICE_SERVER_URL
 * 예) wss://your-app.railway.app
 *
 * 미설정 시 Binance에 직접 연결(개발용 폴백)
 */
export function usePriceWorker(options: UsePriceWorkerOptions) {
  const optsRef = useRef(options)
  useEffect(() => { optsRef.current = options })

  useEffect(() => {
    if (typeof window === "undefined") return

    const win = window as any
    let ws: WebSocket | null = null
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let closed = false

    const serverUrl = process.env.NEXT_PUBLIC_PRICE_SERVER_URL

    if (serverUrl) {
      // ── Price Server 모드 (프로덕션) ──────────────────────────
      let heartbeatTimer: ReturnType<typeof setTimeout> | null = null

      // 5초 안에 메시지가 없으면 소켓을 강제로 닫고 재연결
      const HEARTBEAT_TIMEOUT = 5000

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
          console.log("[v0] PriceWorker connected to", serverUrl)
          optsRef.current.onConnected?.()
          resetHeartbeat()
        }

        ws.onmessage = (event) => {
          resetHeartbeat()
          try {
            const data = JSON.parse(event.data as string)
            console.log("[v0] PriceWorker message:", data.type, data.type === "price" ? data.price : "")

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

        ws.onclose = (e) => {
          console.log("[v0] PriceWorker disconnected, code:", e.code, "reason:", e.reason)
          if (heartbeatTimer) clearTimeout(heartbeatTimer)
          optsRef.current.onDisconnected?.()
          if (!closed) retryTimer = setTimeout(connect, 3000)
        }

        ws.onerror = (e) => {
          console.log("[v0] PriceWorker error:", e)
          ws?.close()
        }
      }

      connect()

    } else {
      // ── 개발용 폴백: Binance 직접 연결 ──────────────────────
      console.warn("[usePriceWorker] NEXT_PUBLIC_PRICE_SERVER_URL not set, falling back to Binance direct connection")

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
