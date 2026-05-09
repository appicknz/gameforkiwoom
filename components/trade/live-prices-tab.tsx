"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { TrendingUp, TrendingDown, Search, X } from "lucide-react"
import { Input } from "@/components/ui/input"

// ─── 숫자 포맷 ────────────────────────────────────────────────────
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
  if (vol >= 1_000_000)     return `${(vol / 1_000_000).toFixed(1)}M`
  if (vol >= 1_000)         return `${(vol / 1_000).toFixed(0)}K`
  return vol.toFixed(0)
}

// ─── 모듈 레벨 싱글톤 ────────────────────────────────────────────
// 컴포넌트가 언마운트돼도 소켓·데이터를 유지 → 재진입 시 즉시 표시
interface TickerData {
  symbol: string
  price: number
  change24h: number
  high24h: number
  low24h: number
  volume24h: number
}

const CHUNK_SIZE = 100

const _cache: {
  symbols: string[]
  tickers: Map<string, TickerData>
  sockets: WebSocket[]
  flushTimer: ReturnType<typeof setInterval> | null
  listeners: Set<() => void>
  connectedCount: number
  totalChunks: number
  initialized: boolean
} = {
  symbols: [],
  tickers: new Map(),
  sockets: [],
  flushTimer: null,
  listeners: new Set(),
  connectedCount: 0,
  totalChunks: 0,
  initialized: false,
}

function notifyListeners() {
  _cache.listeners.forEach((fn) => fn())
}

function openChunk(chunk: string[], idx: number) {
  // 이미 열려있는 소켓은 재사용
  const existing = _cache.sockets[idx]
  if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) return

  const streams = chunk.map((s) => s.toLowerCase() + "@miniTicker").join("/")
  const ws = new WebSocket(`wss://fstream.binance.com/market/stream?streams=${streams}`)
  _cache.sockets[idx] = ws

  ws.onopen = () => {
    _cache.connectedCount++
    notifyListeners()
  }

  ws.onmessage = (e) => {
    try {
      const msg = JSON.parse(e.data)
      const d = msg.data ?? msg
      if (!d?.s) return
      const price = parseFloat(d.c)
      const open  = parseFloat(d.o)
      _cache.tickers.set(d.s, {
        symbol:   d.s,
        price,
        change24h: open > 0 ? ((price - open) / open) * 100 : 0,
        high24h:  parseFloat(d.h),
        low24h:   parseFloat(d.l),
        volume24h: parseFloat(d.q),
      })
    } catch {}
  }

  ws.onerror = () => {}

  ws.onclose = () => {
    _cache.connectedCount = Math.max(0, _cache.connectedCount - 1)
    notifyListeners()
    // 3초 후 재연결
    setTimeout(() => openChunk(chunk, idx), 3000)
  }
}

async function initCache() {
  if (_cache.initialized) return
  _cache.initialized = true

  try {
    const res  = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo")
    const json = await res.json()
    _cache.symbols = (json.symbols ?? [])
      .filter((s: any) => s.status === "TRADING" && s.quoteAsset === "USDT" && s.contractType === "PERPETUAL")
      .map((s: any) => s.symbol as string)
      .sort()
  } catch {
    _cache.symbols = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT"]
  }

  const chunks: string[][] = []
  for (let i = 0; i < _cache.symbols.length; i += CHUNK_SIZE) {
    chunks.push(_cache.symbols.slice(i, i + CHUNK_SIZE))
  }
  _cache.totalChunks = chunks.length
  chunks.forEach((chunk, idx) => openChunk(chunk, idx))

  // 500ms마다 리스너에 flush 알림
  _cache.flushTimer = setInterval(() => {
    notifyListeners()
  }, 500)
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────
interface LivePricesTabProps {
  onSelect?:       (symbol: string, price: number) => void
  selectedSymbol?: string
}

export default function LivePricesTab({ onSelect, selectedSymbol }: LivePricesTabProps) {
  const [, forceUpdate]   = useState(0)
  const [searchTerm, setSearchTerm] = useState("")
  const [sortKey, setSortKey] = useState<"symbol" | "price" | "change24h" | "volume24h">("change24h")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const autoSelectedRef = useRef(false)

  // 싱글톤 초기화 (최초 1회만 실행)
  useEffect(() => {
    initCache()
  }, [])

  // 리스너 등록 — 컴포넌트가 마운트된 동안만 re-render 수신
  useEffect(() => {
    const listener = () => forceUpdate((n) => n + 1)
    _cache.listeners.add(listener)
    return () => { _cache.listeners.delete(listener) }
  }, [])

  // 데이터가 처음 들어오면 정렬 1위 자동 선택
  useEffect(() => {
    if (autoSelectedRef.current) return
    if (_cache.tickers.size === 0 || !onSelect || selectedSymbol) return
    const sorted = Array.from(_cache.tickers.values()).sort((a, b) => b.change24h - a.change24h)
    if (sorted.length > 0) {
      autoSelectedRef.current = true
      onSelect(sorted[0].symbol, sorted[0].price)
    }
  })

  const handleSort = useCallback((key: typeof sortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "symbol" ? "asc" : "desc")
    }
  }, [sortKey])

  const isConnected   = _cache.connectedCount === _cache.totalChunks && _cache.totalChunks > 0
  const symbolsLoading = _cache.symbols.length === 0

  const displayList = _cache.symbols
    .filter((sym) => !searchTerm || sym.toLowerCase().includes(searchTerm.toLowerCase()))
    .map((sym) => _cache.tickers.get(sym) ?? { symbol: sym, price: 0, change24h: 0, high24h: 0, low24h: 0, volume24h: 0 })
    .sort((a, b) => {
      let diff = 0
      if      (sortKey === "symbol")    diff = a.symbol.localeCompare(b.symbol)
      else if (sortKey === "price")     diff = a.price - b.price
      else if (sortKey === "change24h") diff = a.change24h - b.change24h
      else if (sortKey === "volume24h") diff = a.volume24h - b.volume24h
      return sortDir === "asc" ? diff : -diff
    })

  const SortBtn = ({ label, k }: { label: string; k: typeof sortKey }) => {
    const isActive = sortKey === k
    return (
      <button
        onClick={() => handleSort(k)}
        className={`text-[11px] flex items-center gap-0.5 transition-colors select-none ${
          isActive ? "text-[#d4af37]" : "text-gray-500 hover:text-gray-300"
        }`}
      >
        {label}
        <span className={`text-[9px] transition-opacity ${isActive ? "opacity-100" : "opacity-30"}`}>
          {isActive ? (sortDir === "asc" ? "▲" : "▼") : "▼"}
        </span>
      </button>
    )
  }

  return (
    <div className="flex flex-col h-full bg-[#0a0b0f]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/60 gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
            symbolsLoading ? "bg-gray-500 animate-pulse"
            : isConnected  ? "bg-emerald-500"
            : "bg-yellow-500 animate-pulse"
          }`} />
          <span className="text-xs text-gray-400 whitespace-nowrap">
            {symbolsLoading
              ? "심볼 로딩..."
              : isConnected
              ? `LIVE · ${_cache.symbols.length}개`
              : `연결 중 ${_cache.connectedCount}/${_cache.totalChunks}`}
          </span>
          {!symbolsLoading && (
            <span className="text-xs text-gray-600">{_cache.tickers.size}/{_cache.symbols.length}</span>
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
            <button onClick={() => setSearchTerm("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800/30">
        <SortBtn label="심볼" k="symbol" />
        <div className="flex items-center gap-5">
          <SortBtn label="가격"     k="price" />
          <SortBtn label="24H 변동" k="change24h" />
          <SortBtn label="거래량(U)" k="volume24h" />
        </div>
      </div>

      {symbolsLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="w-6 h-6 border-2 border-gray-700 border-t-gray-400 rounded-full animate-spin" />
            <p className="text-xs text-gray-500">바이낸스 심볼 로딩 중...</p>
          </div>
        </div>
      )}

      {!symbolsLoading && (
        <div className="flex-1 overflow-y-auto">
          {displayList.map((item) => {
            const isPositive = item.change24h >= 0
            const hasData    = item.price > 0
            const isSelected = item.symbol === selectedSymbol

            return (
              <div
                key={item.symbol}
                onClick={() => onSelect?.(item.symbol, item.price)}
                className={`flex items-center justify-between px-4 h-[52px] border-b border-gray-800/20 transition-colors cursor-pointer ${
                  isSelected ? "bg-[#d4af37]/10 border-l-2 border-l-[#d4af37]" : "hover:bg-gray-800/30"
                }`}
              >
                <div className="flex items-center gap-2 min-w-[100px]">
                  {hasData ? (
                    isPositive
                      ? <TrendingUp  className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                      : <TrendingDown className="h-3.5 w-3.5 text-red-500   flex-shrink-0" />
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

                <span className={`text-sm font-medium tabular-nums w-[72px] text-right ${
                  !hasData ? "text-gray-600" : isPositive ? "text-green-400" : "text-red-400"
                }`}>
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
