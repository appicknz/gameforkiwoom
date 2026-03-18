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
              // Railway의 closing 이벤트는 타이밍 트리거로만 사용
              // 실제 가격은 Railway price 타입으로 받은 현재가 사용 (선물가 문제 방지)
              const spotPrice = (win.__bitcoinCurrentPrice as number | undefined) ?? data.price
              optsRef.current.onClosingPrice?.(spotPrice, data.time)
              const prev: Array<{ time: number; price: number }> = win.__bitcoinClosingPrices ?? []
              const last = prev[prev.length - 1]
              if (!last || last.time !== data.time) {
                win.__bitcoinClosingPrices = [...prev, { time: data.time, price: spotPrice }].slice(-100)
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
      // ── 개발용 폴백: Binance 현물 직접 연결 (선물 제거) ──────
      console.warn("[usePriceWorker] NEXT_PUBLIC_PRICE_SERVER_URL not set, using Binance spot")

      let tradeWs: WebSocket | null = null

      // aggTrade: 현물 현재가 실시간 (@trade — 선물보다 정확함)
      const connectTrade = () => {
        if (closed) return
        tradeWs = new WebSocket("wss://stream.binance.com/ws/btcusdt@trade")

        tradeWs.onopen = () => optsRef.current.onConnected?.()

        tradeWs.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string)
            const price = parseFloat(msg.p)
            const time = Math.floor(msg.T / 1000)
            if (isNaN(price) || price <= 0) return
            optsRef.current.onPrice?.(price, time)
            win.__bitcoinCurrentPrice = price
          } catch { /* ignore */ }
        }

        tradeWs.onclose = () => {
          optsRef.current.onDisconnected?.()
          if (!closed) tradeRetry = setTimeout(connectTrade, 3000)
        }

        tradeWs.onerror = () => tradeWs?.close()
      }

      let tradeRetry: ReturnType<typeof setTimeout> | null = null
      connectTrade()

      return () => {
        closed = true
        if (tradeRetry) clearTimeout(tradeRetry)
        tradeWs?.close()
      }
    }

    return () => {
      closed = true
      if (retryTimer) clearTimeout(retryTimer)
      ws?.close()
    }
  }, [])
}
