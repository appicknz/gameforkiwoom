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
 * bitcoin-chart.tsx가 Binance 현물(stream.binance.com)에서 직접 받아
 * window에 dispatch하는 baka:price / baka:closing 이벤트를 구독합니다.
 *
 * → 화면에 표시되는 가격과 3번째 카드에 사용되는 가격이 100% 동일한 단일 소스입니다.
 * → Railway price-server에 의존하지 않으므로 선물/현물 혼선이 없습니다.
 */
export function usePriceWorker(options: UsePriceWorkerOptions) {
  const optsRef = useRef(options)
  useEffect(() => { optsRef.current = options })

  useEffect(() => {
    if (typeof window === "undefined") return

    const win = window as any

    // DB에서 초기 마감가 로드 (새로고침 시 이전 마감가 복원)
    fetch("/api/closing-price")
      .then((r) => r.json())
      .then((data) => {
        if (data.prices && data.prices.length > 0 && !win.__bitcoinClosingPrices?.length) {
          win.__bitcoinClosingPrices = data.prices
          optsRef.current.onInitClosing?.(data.prices)
        }
      })
      .catch(() => {})

    // baka:price → onPrice (bitcoin-chart.tsx가 현물 aggTrade에서 발행)
    const onPrice = (e: Event) => {
      const { price } = (e as CustomEvent<{ price: number }>).detail
      const time = Math.floor(Date.now() / 1000)
      optsRef.current.onPrice?.(price, time)
      win.__bitcoinCurrentPrice = price
    }

    // baka:closing → onClosingPrice (bitcoin-chart.tsx가 현물 kline_1s k.x===true에서 발행)
    // 이 이벤트가 화면 "30초 마감 기준가"와 완전히 동일한 소스 → 3번째 카드도 동일한 값
    const onClosing = (e: Event) => {
      const { price, time } = (e as CustomEvent<{ price: number; time: number }>).detail
      optsRef.current.onClosingPrice?.(price, time)

      // DB 저장 (fire-and-forget)
      const prev: Array<{ time: number; price: number }> = win.__bitcoinClosingPrices ?? []
      const last = prev[prev.length - 1]
      if (!last || last.time !== time) {
        win.__bitcoinClosingPrices = [...prev, { time, price }].slice(-100)
        fetch("/api/closing-price", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ price, time }),
        }).catch(() => {})
      }
    }

    window.addEventListener("baka:price", onPrice)
    window.addEventListener("baka:closing", onClosing)
    optsRef.current.onConnected?.()

    return () => {
      window.removeEventListener("baka:price", onPrice)
      window.removeEventListener("baka:closing", onClosing)
    }
  }, [])
}
