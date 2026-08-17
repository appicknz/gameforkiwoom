"use client"

import { useEffect, useState } from "react"
import { Search, Star, X } from "lucide-react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { initCache, liveCache } from "@/components/trade/live-prices-tab"

function formatPrice(price: number): string {
  if (!price) return "-"
  if (price >= 1000) return price.toLocaleString("en-US", { maximumFractionDigits: 2 })
  if (price >= 1) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })
  return price.toLocaleString("en-US", { minimumFractionDigits: 4, maximumFractionDigits: 6 })
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000_000) return `${(vol / 1_000_000_000).toFixed(1)}B`
  if (vol >= 1_000_000) return `${(vol / 1_000_000).toFixed(1)}M`
  if (vol >= 1_000) return `${(vol / 1_000).toFixed(0)}K`
  return vol.toFixed(0)
}

const FAVORITES_KEY = "trading_favorite_symbols"
const FALLBACK_SYMBOLS = [
  "BTCUSDT", "ETHUSDT", "BNBUSDT", "SOLUSDT", "XRPUSDT", "DOGEUSDT",
  "ADAUSDT", "AVAXUSDT", "LINKUSDT", "LTCUSDT", "TRXUSDT", "GASUSDT",
  "GPSUSDT", "GALAUSDT", "GMTUSDT", "GRTUSDT",
]

function loadFavorites(): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = localStorage.getItem(FAVORITES_KEY)
    return raw ? new Set(JSON.parse(raw)) : new Set()
  } catch {
    return new Set()
  }
}

function saveFavorites(favorites: Set<string>) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(Array.from(favorites)))
  } catch {}
}

type SortKey = "symbol" | "price" | "change24h" | "volume24h"

interface SymbolSelectSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedSymbol: string
  onSelect: (symbol: string) => void
}

export default function SymbolSelectSheet({ open, onOpenChange, selectedSymbol, onSelect }: SymbolSelectSheetProps) {
  const [, forceUpdate] = useState(0)
  const [search, setSearch] = useState("")
  const [tab, setTab] = useState<"all" | "favorites">("all")
  const [favorites, setFavorites] = useState<Set<string>>(() => loadFavorites())
  const [sortKey, setSortKey] = useState<SortKey>("volume24h")
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc")

  useEffect(() => {
    if (!open) return
    void initCache()
    const listener = () => forceUpdate((n) => n + 1)
    liveCache.listeners.add(listener)
    return () => { liveCache.listeners.delete(listener) }
  }, [open])

  useEffect(() => {
    if (!open) setSearch("")
  }, [open])

  function toggleFavorite(symbol: string, event: React.MouseEvent) {
    event.stopPropagation()
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(symbol)) next.delete(symbol)
      else next.add(symbol)
      saveFavorites(next)
      return next
    })
  }

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"))
    } else {
      setSortKey(key)
      setSortDir(key === "symbol" ? "asc" : "desc")
    }
  }

  const symbols = Array.from(new Set([...liveCache.symbols, ...FALLBACK_SYMBOLS]))
  const symbolsLoading = liveCache.symbols.length === 0
  const isConnected = liveCache.connectedCount === liveCache.totalChunks && liveCache.totalChunks > 0
  const query = search.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")

  const rows = symbols
    .filter((symbol) => !query || symbol.includes(query))
    .filter((symbol) => tab === "all" || favorites.has(symbol))
    .map((symbol) => liveCache.tickers.get(symbol) ?? { symbol, price: 0, change24h: 0, high24h: 0, low24h: 0, volume24h: 0 })
    .sort((a, b) => {
      let diff = 0
      if (sortKey === "symbol") diff = a.symbol.localeCompare(b.symbol)
      else if (sortKey === "price") diff = a.price - b.price
      else if (sortKey === "change24h") diff = a.change24h - b.change24h
      else if (sortKey === "volume24h") diff = a.volume24h - b.volume24h
      return sortDir === "asc" ? diff : -diff
    })

  const SortButton = ({ label, sortKeyValue }: { label: string; sortKeyValue: SortKey }) => {
    const active = sortKey === sortKeyValue
    return (
      <button
        type="button"
        onClick={() => handleSort(sortKeyValue)}
        className={cn(
          "flex items-center gap-0.5 text-xs font-semibold transition-colors",
          active ? "text-primary" : "text-muted-foreground hover:text-foreground",
        )}
      >
        {label}
        <span className={cn("text-[9px]", active ? "opacity-100" : "opacity-30")}>
          {active ? (sortDir === "asc" ? "\u25B2" : "\u25BC") : "\u25BC"}
        </span>
      </button>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex h-[85vh] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl border border-border bg-card p-0 sm:h-[80vh]"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <DialogTitle className="text-sm font-bold text-foreground">종목 선택</DialogTitle>
          <DialogDescription className="sr-only">거래할 종목을 검색하고 선택하세요.</DialogDescription>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="닫기"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="종목 검색 (예: BTC, ETH)"
              className="h-10 w-full rounded-xl border border-border bg-background pl-10 pr-4 text-sm font-semibold uppercase text-foreground outline-none placeholder:normal-case placeholder:text-muted-foreground focus:border-primary"
            />
          </div>
        </div>

        <div className="flex items-center gap-4 border-b border-border px-4 py-2">
          <button
            type="button"
            onClick={() => setTab("all")}
            className={cn(
              "text-sm font-semibold transition-colors",
              tab === "all" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            전체
          </button>
          <button
            type="button"
            onClick={() => setTab("favorites")}
            className={cn(
              "flex items-center gap-1 text-sm font-semibold transition-colors",
              tab === "favorites" ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Star className="h-3.5 w-3.5" />
            즐겨찾기
          </button>
          <div className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                symbolsLoading ? "animate-pulse bg-muted-foreground" : isConnected ? "bg-emerald-500" : "animate-pulse bg-yellow-500",
              )}
            />
            {symbolsLoading ? "로딩 중..." : `${liveCache.symbols.length}개`}
          </div>
        </div>

        <div className="flex items-center justify-between px-4 py-2">
          <SortButton label="심볼" sortKeyValue="symbol" />
          <div className="flex items-center gap-5">
            <SortButton label="가격" sortKeyValue="price" />
            <SortButton label="24H 변동" sortKeyValue="change24h" />
            <SortButton label="거래량(U)" sortKeyValue="volume24h" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {rows.length === 0 && (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {tab === "favorites" ? "즐겨찾기한 종목이 없습니다." : "검색 결과가 없습니다."}
            </div>
          )}

          {rows.map((item) => {
              const isPositive = item.change24h >= 0
              const hasData = item.price > 0
              const isSelected = item.symbol === selectedSymbol
              const isFavorite = favorites.has(item.symbol)
              return (
                <button
                  key={item.symbol}
                  type="button"
                  onClick={() => onSelect(item.symbol)}
                  className={cn(
                    "flex w-full items-center justify-between border-b border-border/50 px-4 py-3 text-left transition-colors",
                    isSelected ? "border-l-2 border-l-primary bg-primary/10" : "hover:bg-accent",
                  )}
                >
                  <div className="flex min-w-[110px] items-center gap-2">
                    <span onClick={(event) => toggleFavorite(item.symbol, event)} className="cursor-pointer">
                      <Star
                        className={cn(
                          "h-3.5 w-3.5",
                          isFavorite ? "fill-primary text-primary" : "text-muted-foreground",
                        )}
                      />
                    </span>
                    <span className="text-sm font-bold text-foreground">{item.symbol.replace("USDT", "")}</span>
                    <span className="text-[10px] text-muted-foreground">/USDT</span>
                  </div>
                  <span className={cn("w-[90px] text-right text-sm font-mono tabular-nums", hasData ? "text-foreground" : "text-muted-foreground")}>
                    {hasData ? `$${formatPrice(item.price)}` : "-"}
                  </span>
                  <span
                    className={cn(
                      "w-[72px] text-right text-sm font-semibold tabular-nums",
                      !hasData ? "text-muted-foreground" : isPositive ? "text-emerald-500" : "text-red-500",
                    )}
                  >
                    {hasData ? `${isPositive ? "+" : ""}${item.change24h.toFixed(2)}%` : "-"}
                  </span>
                  <span className={cn("w-[64px] text-right text-xs tabular-nums", hasData ? "text-muted-foreground" : "text-muted-foreground/50")}>
                    {hasData ? formatVolume(item.volume24h) : "-"}
                  </span>
                </button>
              )
            })}
        </div>
      </DialogContent>
    </Dialog>
  )
}
