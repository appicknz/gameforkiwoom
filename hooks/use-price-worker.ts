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
 * Railway BTC price WebSocket 서버 단일 연결
 * - type:"price"   → 1초마다 현재가 (aggTrade 1초 집계)
 * - type:"closing" → 30초 버킷 마감가 (모든 클라이언트 동시 수신)
 * - type:"init"    → 접속 시 최근 closing 100개 초기값
 *
 * 모든 비트코인 가격 (차트, 1초 실시간, 30초 마감, 3번째 카드) 을
 * Railway 단일 소스에서 수신합니다. 폴백 없음.
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
    if (!serverUrl) {
      console.error("[usePriceWorker] NEXT_PUBLIC_PRICE_SERVER_URL is not set")
      return
    }

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
            win.__bitcoinClosingPrices = data.closingPrices
            optsRef.current.onInitClosing?.(data.closingPrices)
            // race-game 스코어 동기화: 서버의 현재 race 스코어를 즉시 반영
            window.dispatchEvent(new CustomEvent("baka:init", {
              detail: { closingPrices: data.closingPrices, raceScore: data.raceScore }
            }))
            return
          }

          if (data.type === "price") {
            win.__bitcoinCurrentPrice = data.price
            optsRef.current.onPrice?.(data.price, data.time)
            window.dispatchEvent(new CustomEvent("baka:price", {
              detail: { price: data.price, time: data.time }
            }))
            // race 스코어가 포함된 경우 race-game에 전달 (d1/d2: 이번 tick 소수점 끝자리)
            if (data.raceScore) {
              window.dispatchEvent(new CustomEvent("baka:race-score", {
                detail: data.raceScore  // { roundId, bit, coin, d1, d2 }
              }))
            }
            return
          }

          if (data.type === "closing") {
            // window 전역에 최신 closing 누적 (차트 등 직접 참조하는 곳에서 사용)
            const prev: Array<{ time: number; price: number }> = win.__bitcoinClosingPrices ?? []
            const last = prev[prev.length - 1]
            // 소수점 둘째 자리로 바카라 결과 계산 (0~4=player, 5~8=banker, 9=tie)
            const dec2 = parseInt(data.price.toFixed(2).split(".")[1]?.[1] ?? "0")
            const baccaratResult: "player" | "banker" | "tie" =
              dec2 <= 4 ? "player" : dec2 <= 8 ? "banker" : "tie"

            if (!last || last.time !== data.time) {
              win.__bitcoinClosingPrices = [...prev, { time: data.time, price: data.price }].slice(-100)
              // DB 저장 (fire-and-forget) — baccarat_result 포함
              fetch("/api/closing-price", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ price: data.price, time: data.time, baccarat_result: baccaratResult }),
              }).catch(() => {})
            }
            // 3번째 카드 트리거
            optsRef.current.onClosingPrice?.(data.price, data.time)
            // 패널·차트 등 모든 구독자에게 단일 이벤트로 전달 (baccaratResult 포함)
            window.dispatchEvent(new CustomEvent("baka:closing", {
              detail: { price: data.price, time: data.time, baccaratResult }
            }))
          }
        } catch { /* ignore malformed messages */ }
      }

      ws.onclose = () => {
        optsRef.current.onDisconnected?.()
        if (!closed) retryTimer = setTimeout(connect, 3000)
      }

      ws.onerror = () => { ws?.close() }
    }

    connect()

    return () => {
      closed = true
      if (retryTimer) clearTimeout(retryTimer)
      ws?.close()
    }
  }, [])
}
