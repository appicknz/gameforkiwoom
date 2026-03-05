"use client"

import { useEffect, useRef, useCallback } from "react"

export interface TradeMessage {
  type: "trade"
  price: number
  quantity: number
  time: number
}

type WorkerMessage =
  | TradeMessage
  | { type: "connected" }
  | { type: "disconnected" }
  | { type: "pong" }

interface UsePriceWorkerOptions {
  onTrade: (msg: TradeMessage) => void
  onConnected?: () => void
  onDisconnected?: () => void
}

/**
 * SharedWorker를 통해 Binance aggTrade 스트림을 구독합니다.
 * SharedWorker를 지원하지 않는 환경(일부 Safari)에서는
 * 자동으로 직접 WebSocket 폴백으로 전환합니다.
 */
export function usePriceWorker({ onTrade, onConnected, onDisconnected }: UsePriceWorkerOptions) {
  const onTradeRef = useRef(onTrade)
  const onConnectedRef = useRef(onConnected)
  const onDisconnectedRef = useRef(onDisconnected)

  useEffect(() => { onTradeRef.current = onTrade }, [onTrade])
  useEffect(() => { onConnectedRef.current = onConnected }, [onConnected])
  useEffect(() => { onDisconnectedRef.current = onDisconnected }, [onDisconnected])

  useEffect(() => {
    if (typeof window === "undefined") return

    // SharedWorker 지원 여부 확인
    if (typeof SharedWorker !== "undefined") {
      // SharedWorker 경로: /price-worker.js
      let worker: SharedWorker
      try {
        worker = new SharedWorker("/price-worker.js", { name: "binance-price-worker" })
      } catch (e) {
        // 생성 실패 시 폴백
        startFallbackWs()
        return
      }

      const port = worker.port

      port.onmessage = (e: MessageEvent<WorkerMessage>) => {
        const msg = e.data
        if (msg.type === "trade") onTradeRef.current(msg)
        else if (msg.type === "connected") onConnectedRef.current?.()
        else if (msg.type === "disconnected") onDisconnectedRef.current?.()
      }

      port.start()

      return () => {
        port.close()
      }
    } else {
      // SharedWorker 미지원 환경 폴백 (직접 WebSocket)
      return startFallbackWs()
    }
  }, [])

  // SharedWorker 미지원 시 직접 WebSocket 연결
  function startFallbackWs() {
    let ws: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let destroyed = false

    const connect = () => {
      if (destroyed) return
      ws = new WebSocket("wss://fstream.binance.com/ws/btcusdt@aggTrade")

      ws.onopen = () => onConnectedRef.current?.()
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data)
        onTradeRef.current({
          type: "trade",
          price: parseFloat(msg.p),
          quantity: parseFloat(msg.q),
          time: Math.floor(msg.T / 1000),
        })
      }
      ws.onerror = () => onDisconnectedRef.current?.()
      ws.onclose = () => {
        onDisconnectedRef.current?.()
        if (!destroyed) {
          reconnectTimer = setTimeout(connect, 3000)
        }
      }
    }

    connect()

    return () => {
      destroyed = true
      ws?.close()
      if (reconnectTimer) clearTimeout(reconnectTimer)
    }
  }
}
