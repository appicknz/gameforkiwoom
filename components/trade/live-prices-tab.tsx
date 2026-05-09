"use client"

import { useState, useEffect, useRef } from "react"
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

const CHUNK_SIZE = 100

function formatPrice(price: number): string {
  if (price === 0) return "-"
  if (price >= 10000) return price.toLocaleString("en-US", { maximumFractionDigits: 2 })
  if (price >= 1000)  return price.toLocaleString("en-US", { maximumFractionDigits: 2 })
  if (price >= 1)     return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  if (price >= 0.01)  return price.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 })
  if (price >= 0.001) return price.toLocaleString("en-US", { minimumFractionDigits: 5, maximumFractionDigits: 7 })
  return price.toLocaleString("en-US", { minimumFractionDigits: 6, maximumFractionDigits: 10 })
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(1)}B`
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}K`
  return vol.toFixed(0)
}

interface LivePricesTabProps {
  onSelect?: (symbol: string, price: number) => void
  selectedSymbol?: string
}

export default function LivePricesTab({ onSelect, selectedSymbol }: LivePricesTabProps) {
  const [symbols, setSymbols] = useState<string[]>([])
  const [symbolsLoading, setSymbolsLoading] = useState(true)
  const [tickers, setTickers] = useState<Map<string, TickerData>>(new Map())
  const [connectedCount, setConnectedCount] = useState(0)
  const [totalChunks, setTotalChunks] = useState(0)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortKey, setSortKey] = useState<"symbol" | "price" | "change24h" | "volume24h">("volume24h")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  const tickersRef = useRef<Map<string, TickerData>>(new Map())
  const socketsRef = useRef<WebSocket[]>([])
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])
  const connectedRef = useRef(0)

  // 1단계: exchangeInfo로 전체 활성 심볼 동적 로드
  useEffect(() => {
    let cancelled = false
    async function fetchSymbols() {
      try {
        const res = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo")
        const json = await res.json()
        if (cancelled) return
        const activeUSDT: string[] = (json.symbols ?? [])
          .filter((s: any) => s.status === "TRADING" && s.quoteAsset === "USDT" && s.contractType === "PERPETUAL")
          .map((s: any) => s.symbol as string)
          .sort()
        setSymbols(activeUSDT)
      } catch {
        // 실패 시 최소 fallback
        if (!cancelled) setSymbols(["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"])
      } finally {
        if (!cancelled) setSymbolsLoading(false)
      }
    }
    fetchSymbols()
    return () => { cancelled = true }
  }, [])

  // 2단계: 심볼 로드 완료 후 WebSocket 청크 연결
  useEffect(() => {
    if (symbolsLoading || symbols.length === 0) return

    const chunks: string[][] = []
    for (let i = 0; i < symbols.length; i += CHUNK_SIZE) {
      chunks.push(symbols.slice(i, i + CHUNK_SIZE))
    }
    setTotalChunks(chunks.length)
    connectedRef.current = 0
    socketsRef.current = []
    timersRef.current = []

    function openChunk(chunk: string[], idx: number) {
      const streams = chunk.map((s) => s.toLowerCase() + "@miniTicker").join("/")
      const ws = new WebSocket(`wss://fstream.binance.com/market/stream?streams=${streams}`)
      socketsRef.current[idx] = ws

      ws.onopen = () => {
        connectedRef.current++
        setConnectedCount((c) => c + 1)
      }

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
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
        const t = setTimeout(() => openChunk(chunk, idx), 3000)
        timersRef.current.push(t)
      }
    }

    chunks.forEach((chunk, idx) => openChunk(chunk, idx))

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
      connectedRef.current = 0
      setConnectedCount(0)
    }
  }, [symbols, symbolsLoading])

  const handleSort = (key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "symbol" ? "asc" : "desc")
    }
  }

  const displayList = symbols
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

  const isConnected = connectedCount === totalChunks && totalChunks > 0

  return (
    <div className="flex flex-col h-full bg-[#0a0b0f]">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <div
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              symbolsLoading
                ? "bg-gray-500 animate-pulse"
                : isConnected
                ? "bg-emerald-500"
                : "bg-yellow-500 animate-pulse"
            }`}
          />
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {symbolsLoading
              ? "심볼 로딩..."
              : isConnected
              ? `LIVE · ${symbols.length}개`
              : `연결 중 ${connectedCount}/${totalChunks}`}
          </span>
          {!symbolsLoading && (
            <span className="text-xs text-gray-600">{tickers.size}/{symbols.length}</span>
          )}
        </div>

        <div className="relative flex-1">
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

      {/* 심볼 로딩 중 */}
      {symbolsLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-gray-700 border-t-gray-400 rounded-full animate-spin" />
            <p className="text-xs text-gray-500">바이낸스 심볼 로딩 중...</p>
          </div>
        </div>
      )}

      {/* List */}
      {!symbolsLoading && (
        <div className="flex-1 overflow-y-auto">
          {displayList.map((item) => {
            const isPositive = item.change24h >= 0
            const hasData = item.price > 0

            const isSelected = item.symbol === selectedSymbol
            return (
              <div
                key={item.symbol}
                onClick={() => onSelect?.(item.symbol, item.price)}
                className={`flex items-center justify-between px-4 h-[52px] border-b border-gray-800/20 transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-[#d4af37]/10 border-l-2 border-l-[#d4af37]"
                    : "hover:bg-gray-800/30"
                }`}
              >
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

                <span className={`text-sm font-mono tabular-nums w-[90px] text-right ${hasData ? "text-gray-100" : "text-gray-600"}`}>
                  {hasData ? `$${formatPrice(item.price)}` : "-"}
                </span>

                <span
                  className={`text-sm font-medium tabular-nums w-[72px] text-right ${
                    !hasData ? "text-gray-600" : isPositive ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {hasData ? `${isPositive ? "+" : ""}${item.change24h.toFixed(2)}%` : "-"}
                </span>

                <span className={`text-xs tabular-nums w-[60px] text-right ${hasData ? "text-gray-400" : "text-gray-700"}`}>
                  {hasData ? formatVolume(item.volume24h) : "-"}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
