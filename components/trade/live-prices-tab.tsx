"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { TrendingUp, TrendingDown } from "lucide-react"

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

export interface LiveTickerData extends TickerData {}

const SYMBOL_TTL_MS = 10 * 60 * 1000 // 10분마다 심볼 목록 갱신

export const liveCache: {
  symbols: string[]
  tickers: Map<string, TickerData>
  sockets: WebSocket[]
  flushTimer: ReturnType<typeof setInterval> | null
  listeners: Set<() => void>
  connectedCount: number
  totalChunks: number
  initialized: boolean
  symbolsLoadedAt: number
} = {
  symbols: [],
  tickers: new Map(),
  sockets: [],
  flushTimer: null,
  listeners: new Set(),
  connectedCount: 0,
  totalChunks: 0,
  initialized: false,
  symbolsLoadedAt: 0,
}

const _cache = liveCache  // backward-compat alias

function notifyListeners() {
  liveCache.listeners.forEach((fn) => fn())
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
  // 이미 초기화됐고 TTL 내라면 스킵
  if (_cache.initialized && Date.now() - _cache.symbolsLoadedAt < SYMBOL_TTL_MS) return
  _cache.initialized = true

  try {
    const res  = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo")
    const json = await res.json()
    const newSymbols = (json.symbols ?? [])
      .filter((s: any) => s.status === "TRADING" && s.quoteAsset === "USDT" && s.contractType === "PERPETUAL")
      .map((s: any) => s.symbol as string)
      .sort()

    // 심볼 목록이 바뀐 경우 WebSocket 재연결
    const changed = newSymbols.length !== _cache.symbols.length ||
      newSymbols.some((s, i) => s !== _cache.symbols[i])

    _cache.symbols = newSymbols
    _cache.symbolsLoadedAt = Date.now()

    if (changed && _cache.sockets.length > 0) {
      // 기존 소켓 전부 닫고 재연결
      _cache.sockets.forEach(ws => { try { ws.close() } catch {} })
      _cache.sockets = []
      _cache.connectedCount = 0
      _cache.totalChunks = 0
    }
  } catch (e) {
    // fetch 실패 — initialized 해제 후 3초 뒤 재시도
    _cache.initialized = false
    notifyListeners()
    setTimeout(() => initCache(), 3000)
    return
  }

  // 심볼 로드 완료 즉시 리스너에게 알려서 로딩 화면을 바로 해제
  notifyListeners()

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

  // 10분마다 심볼 목록 재조회 (신규 상장 반영)
  setInterval(() => { initCache() }, SYMBOL_TTL_MS)
}

import { cn } from "@/lib/utils"

interface PositionRow {
  id:         string
  symbol:     string
  direction:  "long" | "short"
  entryPrice: number
  leverage:   number
  pnl:        number
  pnlPct:     number
  openedAt:   number
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────
interface LivePricesTabProps {
  onSelect?:       (symbol: string, price: number) => void
  onPriceUpdate?:  (symbol: string, price: number) => void
  onClose?:        (id: string) => void
  closingId?:      string | null
  selectedSymbol?: string
  positions?:      PositionRow[]
}

interface LivePricesTabProps2 extends LivePricesTabProps {
  externalSearch?: string
}

export default function LivePricesTab({ onSelect, onPriceUpdate, onClose, closingId, selectedSymbol, positions = [], externalSearch = "" }: LivePricesTabProps2) {
  const [, forceUpdate]   = useState(0)
  const searchTerm = externalSearch
  const [sortKey, setSortKey] = useState<"symbol" | "price" | "change24h" | "volume24h">("change24h")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")
  const autoSelectedRef    = useRef(false)
  const onPriceUpdateRef   = useRef(onPriceUpdate)
  const selectedSymbolRef  = useRef(selectedSymbol)

  useEffect(() => { onPriceUpdateRef.current = onPriceUpdate }, [onPriceUpdate])
  useEffect(() => { selectedSymbolRef.current = selectedSymbol }, [selectedSymbol])

  // 싱글톤 초기화 (최초 1회만 실행)
  useEffect(() => {
    initCache()
  }, [])

  // 리스너 등록 — flush마다 선택된 심볼 가격을 onPriceUpdate로 전달
  useEffect(() => {
    const listener = () => {
      forceUpdate((n) => n + 1)
      if (selectedSymbolRef.current && onPriceUpdateRef.current) {
        const ticker = _cache.tickers.get(selectedSymbolRef.current)
        if (ticker) onPriceUpdateRef.current(ticker.symbol, ticker.price)
      }
    }
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
      {/* 총 개수만 표시 */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800/60">
        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          symbolsLoading ? "bg-gray-500 animate-pulse"
          : isConnected  ? "bg-emerald-500"
          : "bg-yellow-500 animate-pulse"
        }`} />
        <span className="text-xs text-gray-400">
          {symbolsLoading ? "로딩 중..." : `${_cache.symbols.length}개`}
        </span>
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
            <p className="text-xs text-gray-500">로딩 중...</p>
          </div>
        </div>
      )}

      {!symbolsLoading && (
        <div className="flex-1 overflow-y-auto">
          {displayList.map((item) => {
            const isPositive  = item.change24h >= 0
            const hasData     = item.price > 0
            const isSelected  = item.symbol === selectedSymbol
            const myPositions = positions.filter(p => p.symbol === item.symbol)

            return (
              <div key={item.symbol}>
                {/* 종목 행 */}
                <div
                  onClick={() => onSelect?.(item.symbol, item.price)}
                  className={cn(
                    "flex items-center justify-between px-4 h-[52px] border-b border-gray-800/20 transition-colors cursor-pointer",
                    isSelected ? "bg-[#d4af37]/10 border-l-2 border-l-[#d4af37]" : "hover:bg-gray-800/30",
                    myPositions.length > 0 && "border-b-0"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-[100px]">
                    {hasData ? (
                      isPositive
                        ? <TrendingUp  className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                        : <TrendingDown className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
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

                {/* 인라인 포지션 패널 */}
                {myPositions.map(pos => {
                  const isLong    = pos.direction === "long"
                  const accent    = isLong ? "#22c55e" : "#ef4444"
                  const pnlColor  = pos.pnlPct >= 0 ? "#22c55e" : "#ef4444"
                  const isClosing = closingId === pos.id
                  return (
                    <div
                      key={pos.id}
                      className="border-b border-gray-800/20"
                      style={{ background: isLong ? "rgba(34,197,94,0.05)" : "rgba(239,68,68,0.05)", borderLeft: `2px solid ${accent}` }}
                    >
                      <div className="flex items-center justify-between px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ background: isLong ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: accent }}
                          >
                            {isLong ? "LONG" : "SHORT"} {pos.leverage}x
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <div className="text-[11px] font-bold tabular-nums" style={{ color: pnlColor }}>
                              {pos.pnlPct >= 0 ? "+" : ""}{pos.pnlPct.toFixed(2)}%
                            </div>
                            <div className="text-[10px] tabular-nums" style={{ color: pnlColor, opacity: 0.75 }}>
                              {pos.pnl >= 0 ? "+" : ""}₩{Math.floor(Math.abs(pos.pnl)).toLocaleString("ko-KR")}
                            </div>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); onClose?.(pos.id) }}
                            disabled={isClosing}
                            className="text-[10px] font-semibold px-2.5 py-1 rounded transition-colors"
                            style={{
                              background: "rgba(255,255,255,0.07)",
                              color: "rgba(255,255,255,0.5)",
                              border: "1px solid rgba(255,255,255,0.12)",
                              cursor: isClosing ? "not-allowed" : "pointer",
                            }}
                          >
                            {isClosing ? "청산중" : "청산"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
