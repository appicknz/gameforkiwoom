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
              optsRef.current.onClosingPrice?.(data.price, data.time)
              const prev: Array<{ time: number; price: number }> = win.__bitcoinClosingPrices ?? []
              const last = prev[prev.length - 1]
              if (!last || last.time !== data.time) {
                win.__bitcoinClosingPrices = [...prev, { time: data.time, price: data.price }].slice(-100)
                // 마감가 확정 → DB 저장 (서버에 한 번만 저장, fire-and-forget)
                fetch("/api/closing-price", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ price: data.price, time: data.time }),
                }).catch(() => {/* 저장 실패해도 게임 진행에 영향 없음 */})
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
      // ── 개발용 폴백: Binance 직접 연결 ──────────────────────
      console.warn("[usePriceWorker] NEXT_PUBLIC_PRICE_SERVER_URL not set, falling back to Binance direct connection")

      // Railway 서버 없을 때 DB에서 초기 마감가 로드 (새로고침 대응)
      fetch("/api/closing-price")
        .then((r) => r.json())
        .then((data) => {
          if (data.prices && data.prices.length > 0 && !win.__bitcoinClosingPrices?.length) {
            win.__bitcoinClosingPrices = data.prices
            optsRef.current.onInitClosing?.(data.prices)
          }
        })
        .catch(() => {})

      let tradeWs: WebSocket | null = null
      let klineWs: WebSocket | null = null
      let tradeRetry: ReturnType<typeof setTimeout> | null = null
      let klineRetry: ReturnType<typeof setTimeout> | null = null

      // aggTrade: 현재가 실시간 브로드캐스트
      const connectTrade = () => {
        if (closed) return
        tradeWs = new WebSocket("wss://fstream.binance.com/ws/btcusdt@aggTrade")

        tradeWs.onopen = () => optsRef.current.onConnected?.()

        tradeWs.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string)
            const price = parseFloat(msg.p)
            const time = Math.floor(msg.T / 1000)
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

      // kline_30s: Binance 공식 30초봉 종가 — k.x===true 마감 확정 시만 처리
      const connectKline = () => {
        if (closed) return
        klineWs = new WebSocket("wss://fstream.binance.com/ws/btcusdt@kline_30s")

        klineWs.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string)
            const k = msg.k
            if (!k || !k.x) return  // 마감 확정된 캔들만 처리

            const closePrice = parseFloat(k.c)
            const closeTime = Math.floor(k.T / 1000)
            optsRef.current.onClosingPrice?.(closePrice, closeTime)
            const prev: Array<{ time: number; price: number }> = win.__bitcoinClosingPrices ?? []
            win.__bitcoinClosingPrices = [...prev, { time: closeTime, price: closePrice }].slice(-100)
            // 마감가 확정 → DB 저장 (fire-and-forget)
            fetch("/api/closing-price", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ price: closePrice, time: closeTime }),
            }).catch(() => {/* 저장 실패해도 게임 진행에 영향 없음 */})
          } catch { /* ignore */ }
        }

        klineWs.onclose = () => {
          if (!closed) klineRetry = setTimeout(connectKline, 3000)
        }

        klineWs.onerror = () => klineWs?.close()
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
    }

    return () => {
      closed = true
      if (retryTimer) clearTimeout(retryTimer)
      ws?.close()
    }
  }, [])
}
