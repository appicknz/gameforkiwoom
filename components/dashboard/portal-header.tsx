"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  BarChart3, Bell, Bot, BookOpen, CircleDollarSign, Flag, Gamepad2, Landmark,
  ListChecks, PackageCheck, Search, ShoppingBag, Store, TrendingUp, Trophy, WalletCards,
  Flame, Pencil, Download, History, RefreshCw, BarChart2, Timer,
} from "lucide-react"
import { initCache, liveCache } from "@/components/trade/live-prices-tab"
import { cn } from "@/lib/utils"

const basePortalItems = [
  { label: "바카", href: "/baka", icon: Gamepad2 },
  { label: "레이스", href: "/race", icon: Flag },
  { label: "트레이딩", href: "/trading", icon: TrendingUp },
  { label: "게시판", href: "/board", icon: BookOpen },
  { label: "마켓", href: "/market", icon: Store },
  { label: "현황", href: "/betting-status", icon: ListChecks },
  { label: "랭킹", href: "/ranking", icon: BarChart3 },
  { label: "자동매매", href: "/trade", icon: Bot, mode: "auto" as const },
  { label: "매매기록", href: "/trade", icon: BookOpen, mode: "ledger" as const },
  { label: "구매내역", href: "/purchases", icon: PackageCheck },
  { label: "입금", href: "/deposit", icon: CircleDollarSign },
  { label: "판매관리", href: "/seller", icon: ShoppingBag },
  { label: "정산관리", href: "/settlement", icon: Landmark },
  { label: "토너먼트", href: "/tournament", icon: Trophy },
  { label: "지갑", href: "/wallet", icon: WalletCards },
] as const

type TradeMode = "auto" | "ledger" | "auto2" | "closed"
type HeaderAction = { label: string; href?: string; icon: typeof Flame; onClick?: () => void }

export function PortalHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [searchResults, setSearchResults] = useState<Array<{ id: string; title: string; description: string | null }>>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [boardActive, setBoardActive] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [menuGroups, setMenuGroups] = useState({ group1: false, group2: false, group3: false })
  const [authReady, setAuthReady] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [, refreshSymbols] = useState(0)

  useEffect(() => {
    setMounted(true)
  }, [])
  useEffect(() => {
    setBoardActive(pathname === "/board")
  }, [pathname])

  useEffect(() => {
    const refresh = () => refreshSymbols((value) => value + 1)
    liveCache.listeners.add(refresh)
    void initCache()
    return () => { liveCache.listeners.delete(refresh) }
  }, [])

  useEffect(() => {
    const term = query.trim()
    if (!term) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      setSearchLoading(true)
      try {
        const response = await fetch(`/api/market/items?q=${encodeURIComponent(term)}&sort=newest&limit=6`, { signal: controller.signal })
        if (!response.ok) return
        const data = await response.json()
        setSearchResults(data.items ?? [])
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setSearchResults([])
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false)
      }
    }, 250)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  useEffect(() => {
    const loadProfile = async () => {
      const token = localStorage.getItem("app_token")
      if (!token) {
        setUsername(null)
        setIsLoggedIn(false)
        setMenuGroups({ group1: false, group2: false, group3: false })
        setAuthReady(true)
        return
      }
      setIsLoggedIn(true)
      try {
        const response = await fetch("/api/user/profile", {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!response.ok) {
          setUsername(null)
          setIsLoggedIn(false)
          setMenuGroups({ group1: false, group2: false, group3: false })
          setAuthReady(true)
          return
        }
        const data = await response.json()
        setUsername(data.profile?.username ?? null)
        setAuthReady(true)
        const groupsResponse = await fetch("/api/user/menu-groups", {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (groupsResponse.ok) setMenuGroups(await groupsResponse.json())
      } catch {
        setUsername(null)
        setIsLoggedIn(false)
        setMenuGroups({ group1: false, group2: false, group3: false })
        setAuthReady(true)
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
        { label: "글쓰기", href: "/seller", icon: Pencil },
      ] satisfies HeaderAction[],
    }
    if (pathname.startsWith("/baka")) return {
      placeholder: "바카라 기록 검색...",
      actions: [
        { label: "현황", href: "/betting-status", icon: BarChart2 },
        { label: "기록", href: "/ranking", icon: History },
        { label: "글쓰기", href: "/seller", icon: Pencil },
      ] satisfies HeaderAction[],
    }
    if (pathname.startsWith("/race")) return {
      placeholder: "레이스 검색...",
      actions: [
        { label: "현황", href: "/betting-status", icon: Timer },
        { label: "기록", href: "/ranking", icon: History },
        { label: "글쓰기", href: "/seller", icon: Pencil },
      ] satisfies HeaderAction[],
    }
    if (pathname.startsWith("/trade") || pathname.startsWith("/trading")) return {
      placeholder: "심볼 검색...",
      actions: [
        { label: "매매기록", href: "/trade?mode=ledger", icon: History },
        { label: "글쓰기", href: "/seller", icon: Pencil },
      ] satisfies HeaderAction[],
    }
    return {
      placeholder: "메뉴 검색...",
      actions: [
        { label: "새로고침", icon: RefreshCw, onClick: () => window.location.reload() },
        { label: "글쓰기", href: "/seller", icon: Pencil },
      ] satisfies HeaderAction[],
    }
  }, [pathname])

  const portalItems = useMemo(() => {
    const publicLabels = new Set(["바카", "레이스", "트레이딩", "게시판", "마켓", "매매기록"])
    const groupForLabel: Record<string, keyof typeof menuGroups> = {
      "현황": "group3", "랭킹": "group3", "토너먼트": "group3",
      "구매내역": "group2", "입금": "group2",
      "판매관리": "group2", "정산관리": "group2", "지갑": "group2",
    }
    const items: Array<{ label: string; href: string; icon: typeof Bot; mode?: TradeMode }> = basePortalItems.filter((item) => {
      if (publicLabels.has(item.label)) return true
      if (item.label === "자동매매") return authReady && isLoggedIn && username === "역삼1"
      const requiredGroup = groupForLabel[item.label]
      return authReady && isLoggedIn && !!requiredGroup && menuGroups[requiredGroup]
    })
    if (isLoggedIn && username === "역삼1") {
      const ledgerIndex = items.findIndex((item) => item.mode === "ledger")
      items.splice(ledgerIndex + 1, 0,
        { label: "자동매매2", href: "/trade", icon: Bot, mode: "auto2" },
        { label: "청산기록", href: "/trade", icon: ListChecks, mode: "closed" },
      )
    }
    return items
  }, [authReady, isLoggedIn, menuGroups, username])

  function selectSymbol(symbol: string) {
    setQuery("")
    if (pathname === "/trading") {
      router.replace(`/trading?symbol=${encodeURIComponent(symbol)}`, { scroll: false })
      window.dispatchEvent(new CustomEvent("trading:symbol", { detail: symbol }))
    } else {
      router.push(`/trading?symbol=${encodeURIComponent(symbol)}`)
    }
  }

  function openBoardSearch(term: string) {
    const normalized = term.trim()
    if (!normalized) return
    router.push(`/market?q=${encodeURIComponent(normalized)}`)
    window.dispatchEvent(new CustomEvent("market:search", { detail: normalized }))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    openBoardSearch(query)
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
        <div className="rounded-2xl border border-border bg-card/40 px-3 py-3 md:px-5 md:py-4">
          <form onSubmit={handleSubmit} className="relative mx-auto max-w-3xl">
            <div className="flex h-11 items-center rounded-full border border-primary bg-background px-4 md:h-12 md:px-5">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="코인·게시글 통합 검색"
                aria-label="게시판 통합 검색"
                autoComplete="off"
                className="min-w-0 flex-1 bg-transparent text-center text-sm font-bold text-foreground outline-none placeholder:text-muted-foreground md:text-base"
              />
              <button type="submit" className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-primary transition-colors hover:bg-primary/10" aria-label="검색 실행">
                <Search className="size-5" aria-hidden="true" />
              </button>
            </div>
            {query.trim() && (
              <div className="absolute left-3 right-3 top-full z-50 mt-2 max-h-80 overflow-y-auto rounded-2xl border border-border bg-popover p-2 shadow-2xl">
                {searchLoading && <p className="px-3 py-4 text-center text-sm text-muted-foreground">검색 중...</p>}
                {!searchLoading && searchResults.length === 0 && <p className="px-3 py-4 text-center text-sm text-muted-foreground">검색 결과가 없습니다.</p>}
                {searchResults.map((item) => (
                  <button key={item.id} type="button" onClick={() => openBoardSearch(item.title)} className="flex w-full flex-col gap-1 rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent">
                    <span className="truncate text-sm font-bold text-foreground">{item.title}</span>
                    {item.description && <span className="line-clamp-1 text-xs text-muted-foreground">{item.description}</span>}
                  </button>
                ))}
              </div>
            )}
          </form>
        </div>

        <nav aria-label="주요 서비스" className="flex overflow-x-auto pb-1 md:justify-center">
          <div className="flex min-w-max items-center gap-2">
            {mounted && portalItems.map((item) => {
              const Icon = item.icon
              const active = !("mode" in item) && (item.href === "/board" ? boardActive : pathname === item.href)
              const content = <><Icon className="size-4 shrink-0" aria-hidden="true" /><span className="whitespace-nowrap">{item.label}</span></>
              const className = cn("group inline-flex h-8 shrink-0 cursor-pointer touch-manipulation items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-all", active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground")
              return item.mode ? <button key={`${item.href}-${item.mode}`} type="button" onClick={() => openTradeMode(item.mode!)} className={className}>{content}</button> : <a key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={className}>{content}</a>
            })}
          </div>
        </nav>
      </div>
    </section>
  )
}
