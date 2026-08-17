"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart3, Bell, Bot, BookOpen, CircleDollarSign, Flag, Gamepad2, Landmark, LineChart,
  ListChecks, PackageCheck, Search, ShoppingBag, Store, TrendingUp, Trophy, WalletCards,
  Flame, Pencil, Download, History, RefreshCw, BarChart2, Timer,
} from "lucide-react"
import { liveCache } from "@/components/trade/live-prices-tab"
import { cn } from "@/lib/utils"

const basePortalItems = [
  { label: "랭킹", href: "/ranking", icon: BarChart3 },
  { label: "바카", href: "/baka", icon: Gamepad2 },
  { label: "레이스", href: "/race", icon: Flag },
  { label: "트레이딩", href: "/trading", icon: TrendingUp },
  { label: "마켓", href: "/market", icon: Store },
  { label: "현황", href: "/betting-status", icon: ListChecks },
  { label: "자동매매", href: "/trade", icon: Bot, mode: "auto" as const },
  { label: "매매기록", href: "/trade", icon: BookOpen, mode: "ledger" as const },
  { label: "구매내역", href: "/purchases", icon: PackageCheck },
  { label: "입금", href: "/deposit", icon: CircleDollarSign },
  { label: "판매관리", href: "/seller", icon: ShoppingBag },
  { label: "정산관리", href: "/settlement", icon: Landmark },
  { label: "토너먼트", href: "/tournament", icon: Trophy },
  { label: "지갑", href: "/wallet", icon: WalletCards },
] as const

type TradeMode = "mock" | "auto" | "ledger" | "auto2" | "closed"
type HeaderAction = { label: string; href?: string; icon: typeof Flame; onClick?: () => void }

export function PortalHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [searchOpen, setSearchOpen] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [, refreshSymbols] = useState(0)
  useEffect(() => {
    const refresh = () => refreshSymbols((value) => value + 1)
    liveCache.listeners.add(refresh)
    return () => { liveCache.listeners.delete(refresh) }
  }, [])

  useEffect(() => {
    const loadProfile = async () => {
      const token = localStorage.getItem("app_token")
      if (!token) {
        setIsLoggedIn(false)
        setUsername(null)
        return
      }
      try {
        const response = await fetch("/api/user/profile", {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) {
          setIsLoggedIn(false)
          setUsername(null)
          return
        }
        const data = await response.json()
        setIsLoggedIn(Boolean(data.profile))
        setUsername(data.profile?.username ?? null)
      } catch {
        setIsLoggedIn(false)
        setUsername(null)
      }
    }

    void loadProfile()
    window.addEventListener("auth:login", loadProfile)
    window.addEventListener("auth:logout", loadProfile)
    return () => {
      window.removeEventListener("auth:login", loadProfile)
      window.removeEventListener("auth:logout", loadProfile)
    }
  }, [])

  const headerConfig = useMemo(() => {
    if (pathname.startsWith("/market")) return {
      placeholder: "상품 검색...",
      actions: [
        { label: "인기순", icon: Flame, onClick: () => window.dispatchEvent(new CustomEvent("market:sort", { detail: "popular" })) },
        { label: "입금", href: "/deposit", icon: Download },
        { label: "상품 등록", href: "/seller", icon: Pencil },
      ] satisfies HeaderAction[],
    }
    if (pathname.startsWith("/baka")) return {
      placeholder: "바카라 기록 검색...",
      actions: [
        { label: "현황", href: "/betting-status", icon: BarChart2 },
        { label: "기록", href: "/ranking", icon: History },
      ] satisfies HeaderAction[],
    }
    if (pathname.startsWith("/race")) return {
      placeholder: "레이스 검색...",
      actions: [
        { label: "현황", href: "/betting-status", icon: Timer },
        { label: "기록", href: "/ranking", icon: History },
      ] satisfies HeaderAction[],
    }
    if (pathname.startsWith("/trade") || pathname.startsWith("/trading")) return {
      placeholder: "심볼 검색...",
      actions: [
        { label: "새로고침", icon: RefreshCw, onClick: () => window.dispatchEvent(new CustomEvent("trade:refresh")) },
        { label: "매매기록", href: "/trade?mode=ledger", icon: History },
      ] satisfies HeaderAction[],
    }
    return {
      placeholder: "메뉴 검색...",
      actions: [{ label: "새로고침", icon: RefreshCw, onClick: () => window.location.reload() }] satisfies HeaderAction[],
    }
  }, [pathname])

  const portalItems = useMemo(() => {
    const items: Array<{ label: string; href: string; icon: typeof Bot; mode?: TradeMode }> = [...basePortalItems]
    const tradeIndex = items.findIndex((item) => item.mode === "auto")
    if (isLoggedIn) {
      items.splice(tradeIndex, 0, { label: "모의매매", href: "/trade", icon: LineChart, mode: "mock" })
    }
    if (username === "역삼1") {
      const ledgerIndex = items.findIndex((item) => item.mode === "ledger")
      items.splice(ledgerIndex + 1, 0,
        { label: "자동매매2", href: "/trade", icon: Bot, mode: "auto2" },
        { label: "청산기록", href: "/trade", icon: ListChecks, mode: "closed" },
      )
    }
    return items
  }, [isLoggedIn, username])

  const matches = useMemo(() => {
    const normalized = query.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
    if (!normalized) return []
    return liveCache.symbols
      .filter((symbol) => symbol.includes(normalized))
      .slice(0, 8)
  }, [query, liveCache.symbols.length])

  function selectSymbol(symbol: string) {
    setQuery(symbol.replace("USDT", "/USDT"))
    if (pathname === "/trade") {
      window.dispatchEvent(new CustomEvent("trade:symbol", { detail: symbol }))
    } else {
      router.push(`/trade?symbol=${encodeURIComponent(symbol)}`)
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (matches[0]) selectSymbol(matches[0])
  }

  function openTradeMode(mode: TradeMode) {
    const target = `/trade?mode=${mode}`
    if (pathname === "/trade") {
      router.replace(target, { scroll: false })
      window.dispatchEvent(new CustomEvent("trade:mode", { detail: mode }))
    } else {
      router.push(target)
    }
  }

  return (
    <section className="px-4 py-3 md:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3">
        {searchOpen && (
          <form onSubmit={handleSubmit} className="relative animate-in fade-in slide-in-from-top-2 duration-200">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={headerConfig.placeholder}
              aria-label="심볼 검색"
              autoComplete="off"
              autoFocus
              className="h-11 w-full rounded-2xl border border-primary/45 bg-card pl-11 pr-4 text-sm font-semibold uppercase text-foreground outline-none transition-colors placeholder:normal-case placeholder:text-muted-foreground focus:border-primary"
            />
            {query.trim() && matches.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-2 grid grid-cols-2 gap-1 rounded-xl border border-border bg-popover p-2 shadow-xl sm:grid-cols-4">
                {matches.map((symbol) => (
                  <button key={symbol} type="button" onClick={() => selectSymbol(symbol)} className="rounded-lg px-3 py-2 text-left text-xs font-bold text-popover-foreground transition-colors hover:bg-accent">
                    {symbol.replace("USDT", "/USDT")}
                  </button>
                ))}
              </div>
            )}
          </form>
        )}

        <nav aria-label="주요 서비스" className="flex items-center gap-3 overflow-x-auto rounded-3xl border border-border bg-card/70 p-2 pb-2">
          <div className="flex min-w-max flex-1 items-center gap-2">
            {portalItems.map((item) => {
              const Icon = item.icon
              const active = pathname === item.href && !("mode" in item)
              const content = (
                <>
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="whitespace-nowrap">{item.label}</span>
                </>
              )
              const className = cn(
                "group inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl border px-4 text-sm font-semibold transition-all",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:bg-accent hover:text-foreground",
              )
              return item.mode ? (
                <button key={`${item.href}-${item.mode}`} type="button" onClick={() => openTradeMode(item.mode!)} className={className}>{content}</button>
              ) : (
                <a key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={className}>{content}</a>
              )
            })}
          </div>
          <div className="flex shrink-0 items-center gap-2 border-l border-border pl-3">
            {headerConfig.actions.map((action) => {
              const Icon = action.icon
              const className = "inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent hover:text-foreground"
              return action.href ? (
                <a key={action.label} href={action.href} className={className}>
                  <Icon className="size-4" aria-hidden="true" />
                  <span className="hidden whitespace-nowrap lg:inline">{action.label}</span>
                </a>
              ) : (
                <button key={action.label} type="button" onClick={action.onClick} className={className}>
                  <Icon className="size-4" aria-hidden="true" />
                  <span className="hidden whitespace-nowrap lg:inline">{action.label}</span>
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => setSearchOpen((open) => !open)}
              aria-label={searchOpen ? "검색 닫기" : "심볼 검색 열기"}
              title="심볼 검색"
              className={cn("flex h-11 items-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground", searchOpen && "border-primary/50 bg-primary/10 text-primary")}
            >
              <Search className="size-4" aria-hidden="true" />
              <span className="hidden whitespace-nowrap sm:inline">검색</span>
            </button>
            <a
              href="https://t.me/+HHv5pyuGGAw5YTc1"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="텔레그램 알림 채널 열기"
              title="알림"
              className="relative flex h-11 items-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
            >
              <Bell className="size-4" aria-hidden="true" />
              <span className="hidden whitespace-nowrap sm:inline">알림</span>
              <span className="absolute right-3 top-2 size-1.5 rounded-full bg-primary" aria-hidden="true" />
            </a>
          </div>
        </nav>
      </div>
    </section>
  )
}
