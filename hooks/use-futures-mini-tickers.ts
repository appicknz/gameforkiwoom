"use client"

import { useEffect, useMemo, useRef, useState } from "react"

export type FuturesTickerConnection = "idle" | "connecting" | "live" | "reconnecting" | "offline"

type TickerSnapshot = {
  prices: ReadonlyMap<string, number>
  status: FuturesTickerConnection
  lastMessageAt: number | null
}

const priceCache = new Map<string, number>()

function normalizeSymbol(symbol: string) {
  return symbol.replace(/^[A-Z]+:/, "").replace(/\.P$/, "").toUpperCase()
}

export function useFuturesMiniTickers(symbols: string[]): TickerSnapshot {
  const symbolKey = useMemo(
    () => [...new Set(symbols.map(normalizeSymbol).filter(Boolean))].sort().join(","),
    [symbols],
  )
  const [snapshot, setSnapshot] = useState<TickerSnapshot>({
    prices: new Map(),
    status: symbolKey ? "connecting" : "idle",
    lastMessageAt: null,
  })
  const latestMessageAtRef = useRef<number | null>(null)

  useEffect(() => {
    const subscribedSymbols = symbolKey ? symbolKey.split(",") : []
    if (!subscribedSymbols.length) {
      setSnapshot({ prices: new Map(), status: "idle", lastMessageAt: null })
      return
    }

    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let flushTimer: ReturnType<typeof setInterval> | null = null
    let closed = false
    let reconnectAttempt = 0
    const subscribedSet = new Set(subscribedSymbols)

    const publish = (status?: FuturesTickerConnection) => {
      if (document.hidden && !status) return
      const prices = new Map<string, number>()
      for (const symbol of subscribedSymbols) {
        const price = priceCache.get(symbol)
        if (price != null) prices.set(symbol, price)
      }
      setSnapshot((current) => ({
        prices,
        status: status ?? current.status,
        lastMessageAt: latestMessageAtRef.current,
      }))
    }

    const scheduleReconnect = () => {
      if (closed) return
      if (!navigator.onLine) {
        publish("offline")
        return
      }
      publish("reconnecting")
      const delay = Math.min(30_000, 1_000 * 2 ** reconnectAttempt)
      reconnectAttempt += 1
      reconnectTimer = setTimeout(connect, delay)
    }

    const connect = () => {
      if (closed) return
      if (!navigator.onLine) {
        publish("offline")
        return
      }

      publish(reconnectAttempt ? "reconnecting" : "connecting")
      const streams = subscribedSymbols.map((symbol) => `${symbol.toLowerCase()}@miniTicker`).join("/")
      socket = new WebSocket(`wss://fstream.binance.com/market/stream?streams=${streams}`)

      socket.onopen = () => {
        reconnectAttempt = 0
        publish("live")
      }
      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string)
          const ticker = message.data ?? message
          const symbol = typeof ticker.s === "string" ? normalizeSymbol(ticker.s) : ""
          const price = Number(ticker.c)
          if (!subscribedSet.has(symbol) || !Number.isFinite(price) || price <= 0) return
          priceCache.set(symbol, price)
          latestMessageAtRef.current = Date.now()
        } catch {
          // Ignore malformed exchange messages and keep the stream alive.
        }
      }
      socket.onerror = () => socket?.close()
      socket.onclose = scheduleReconnect
    }

    const handleOnline = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
        reconnectTimer = null
      }
      if (!socket || socket.readyState === WebSocket.CLOSED) connect()
    }
    const handleOffline = () => publish("offline")
    const handleVisibility = () => {
      if (!document.hidden) publish(socket?.readyState === WebSocket.OPEN ? "live" : undefined)
    }

    flushTimer = setInterval(() => publish(), 500)
    window.addEventListener("online", handleOnline)
    window.addEventListener("offline", handleOffline)
    document.addEventListener("visibilitychange", handleVisibility)
    connect()

    return () => {
      closed = true
      if (reconnectTimer) clearTimeout(reconnectTimer)
      if (flushTimer) clearInterval(flushTimer)
      window.removeEventListener("online", handleOnline)
      window.removeEventListener("offline", handleOffline)
      document.removeEventListener("visibilitychange", handleVisibility)
      socket?.close()
    }
  }, [symbolKey])

  return snapshot
}
