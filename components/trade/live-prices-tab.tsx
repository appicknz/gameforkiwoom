"use client"

import { useState, useEffect, useRef } from "react"
import { COIN_SYMBOLS } from "@/lib/coin-list"
import { TrendingUp, TrendingDown, Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"

interface TickerData {
  symbol: string
  price: number
  change24h: number
  high24h: number
  low24h: number
  volume24h: number
}

const CHUNK_SIZE = 180

function formatPrice(price: number): string {
  if (price === 0) return "-"
  if (price >= 10000) return price.toLocaleString("en-US", { maximumFractionDigits: 0 })
  if (price >= 1) return price.toFixed(4)
  if (price >= 0.001) return price.toFixed(5)
  return price.toFixed(8)
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(1)}B`
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}K`
  return vol.toFixed(0)
}

export default function LivePricesTab() {
  const [tickers, setTickers] = useState<Map<string, TickerData>>(new Map())
  const [connectedCount, setConnectedCount] = useState(0)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortKey, setSortKey] = useState<"symbol" | "price" | "change24h" | "volume24h">("volume24h")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const tickersRef = useRef<Map<string, TickerData>>(new Map())
  const socketsRef = useRef<WebSocket[]>([])
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const connectedRef = useRef(0)
  const totalChunksRef = useRef(0)

  useEffect(() => {
    // 청크 분할
    const chunks: string[][] = []
    for (let i = 0; i < COIN_SYMBOLS.length; i += CHUNK_SIZE) {
      chunks.push(COIN_SYMBOLS.slice(i, i + CHUNK_SIZE))
    }
    totalChunksRef.current = chunks.length
    connectedRef.current = 0

    function openChunk(chunk: string[], idx: number) {
      const streams = chunk.map((s) => s.toLowerCase() + "@miniTicker").join("/")
      // miniTicker는 /market 엔드포인트에 속함 (공식 문서 기준)
      const ws = new WebSocket(`wss://fstream.binance.com/market/stream?streams=${streams}`)
      socketsRef.current[idx] = ws

      ws.onopen = () => {
        connectedRef.current++
        setConnectedCount(connectedRef.current)
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          // combined stream: {"stream":"...","data":{...}}
          const d = msg.data ?? msg
          if (!d?.s) return
          const price = parseFloat(d.c)
          const open = parseFloat(d.o)
          tickersRef.current.set(d.s, {
            symbol: d.s,
            price,
            change24h: open > 0 ? ((price - open) / open) * 100 : 0,
            high24h: parseFloat(d.h),
            low24h: parseFloat(d.l),
            volume24h: parseFloat(d.q),
          })
        } catch {}
      }

      ws.onerror = () => {}

      ws.onclose = () => {
        connectedRef.current = Math.max(0, connectedRef.current - 1)
        setConnectedCount(connectedRef.current)
        // 3초 후 해당 청크만 재연결
        const t = setTimeout(() => openChunk(chunk, idx), 3000)
        timersRef.current.push(t)
      }
    }

    chunks.forEach((chunk, idx) => openChunk(chunk, idx))

    // 500ms마다 화면 갱신
    const flush = setInterval(() => {
      setTickers(new Map(tickersRef.current))
    }, 500)

    return () => {
      clearInterval(flush)
      timersRef.current.forEach(clearTimeout)
      timersRef.current = []
      socketsRef.current.forEach((ws) => {
        try { ws.onclose = null; ws.close() } catch {}
      })
      socketsRef.current = []
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "symbol" ? "asc" : "desc")
    }
  }

  const displayList = COIN_SYMBOLS
    .filter((sym) => {
      if (!searchTerm) return true
      return sym.toLowerCase().includes(searchTerm.toLowerCase())
    })
    .map((sym) => {
      const t = tickers.get(sym)
      return t ?? { symbol: sym, price: 0, change24h: 0, high24h: 0, low24h: 0, volume24h: 0 }
    })
    .sort((a, b) => {
      let diff = 0
      if (sortKey === "symbol") diff = a.symbol.localeCompare(b.symbol)
      else if (sortKey === "price") diff = a.price - b.price
      else if (sortKey === "change24h") diff = a.change24h - b.change24h
      else if (sortKey === "volume24h") diff = a.volume24h - b.volume24h
      return sortDir === "asc" ? diff : -diff
    })

  const SortBtn = ({ label, k }: { label: string; k: typeof sortKey }) => (
    <button
      onClick={() => handleSort(k)}
      className={`text-[11px] flex items-center gap-0.5 transition-colors ${
        sortKey === k ? "text-gray-200" : "text-gray-500 hover:text-gray-300"
      }`}
    >
      {label}
      {sortKey === k && (
        <span className="text-[9px]">{sortDir === "asc" ? "▲" : "▼"}</span>
      )}
    </button>
  )

  const isConnected = connectedCount === totalChunksRef.current && totalChunksRef.current > 0

  return (
    <div className="flex flex-col h-full bg-[#0a0b0f]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 gap-3">
        <div className="flex items-center gap-2">
          <div
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${isConnected ? "bg-emerald-500" : "bg-yellow-500 animate-pulse"}`}
          />
          <span className="text-xs text-gray-400">
            {isConnected ? "LIVE" : `연결 중 ${connectedCount}/${totalChunksRef.current}...`}
          </span>
          <span className="text-xs text-gray-600">
            {tickers.size} / {COIN_SYMBOLS.length}
          </span>
        </div>

        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-500 pointer-events-none" />
          <Input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="심볼 검색..."
            className="h-8 pl-8 pr-8 bg-gray-900 border-gray-700 text-sm text-gray-200 placeholder:text-gray-600"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800/30">
        <SortBtn label="심볼" k="symbol" />
        <div className="flex items-center gap-5">
          <SortBtn label="가격" k="price" />
          <SortBtn label="24H 변동" k="change24h" />
          <SortBtn label="거래량(U)" k="volume24h" />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {displayList.map((item) => {
          const isPositive = item.change24h >= 0
          const hasData = item.price > 0

          return (
            <div
              key={item.symbol}
              className="flex items-center justify-between px-4 h-[52px] border-b border-gray-800/20 hover:bg-gray-800/30 transition-colors"
            >
              {/* Symbol */}
              <div className="flex items-center gap-2 min-w-[100px]">
                {hasData ? (
                  isPositive ? (
                    <TrendingUp className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                  ) : (
                    <TrendingDown className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                  )
                ) : (
                  <div className="h-3.5 w-3.5 flex-shrink-0" />
                )}
                <span className="text-sm font-medium text-gray-200">
                  {item.symbol.replace("USDT", "")}
                </span>
              </div>

              {/* Price */}
              <span className={`text-sm font-mono tabular-nums w-[90px] text-right ${hasData ? "text-gray-100" : "text-gray-600"}`}>
                {hasData ? `$${formatPrice(item.price)}` : "-"}
              </span>

              {/* 24h Change */}
              <span
                className={`text-sm font-medium tabular-nums w-[72px] text-right ${
                  !hasData ? "text-gray-600" : isPositive ? "text-green-400" : "text-red-400"
                }`}
              >
                {hasData ? `${isPositive ? "+" : ""}${item.change24h.toFixed(2)}%` : "-"}
              </span>

              {/* Volume */}
              <span className={`text-xs tabular-nums w-[60px] text-right ${hasData ? "text-gray-400" : "text-gray-700"}`}>
                {hasData ? formatVolume(item.volume24h) : "-"}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
