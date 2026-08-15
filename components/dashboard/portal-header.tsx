"use client"

import { FormEvent, useEffect, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import {
  Bell, Bot, BookOpen, CircleDollarSign, Flag, Gamepad2, Landmark,
  ListChecks, PackageCheck, Search, ShoppingBag, Store, Trophy, WalletCards,
} from "lucide-react"
import { liveCache } from "@/components/trade/live-prices-tab"
import { cn } from "@/lib/utils"

const portalItems = [
  { label: "바카", href: "/baka", icon: Gamepad2 },
  { label: "레이스", href: "/race", icon: Flag },
  { label: "자동매매", href: "/trade", icon: Bot, mode: "auto" },
  { label: "매매기록", href: "/trade", icon: BookOpen, mode: "ledger" },
  { label: "배팅현황", href: "/betting-status", icon: ListChecks },
  { label: "마켓", href: "/market", icon: Store },
  { label: "구매내역", href: "/purchases", icon: PackageCheck },
  { label: "입금", href: "/deposit", icon: CircleDollarSign },
  { label: "판매관리", href: "/seller", icon: ShoppingBag },
  { label: "정산관리", href: "/settlement", icon: Landmark },
  { label: "토너먼트", href: "/tournament", icon: Trophy },
  { label: "지갑", href: "/wallet", icon: WalletCards },
] as const

export function PortalHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [, refreshSymbols] = useState(0)

  useEffect(() => {
    const refresh = () => refreshSymbols((value) => value + 1)
    liveCache.listeners.add(refresh)
    return () => { liveCache.listeners.delete(refresh) }
  }, [])

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

  function openTradeMode(mode: "auto" | "ledger") {
    if (pathname === "/trade") {
      window.dispatchEvent(new CustomEvent("trade:mode", { detail: mode }))
    } else {
      router.push(`/trade?mode=${mode}`)
    }
  }

  return (
    <section className="px-4 py-3 md:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3">
        <div className="flex items-center gap-2">
          <form onSubmit={handleSubmit} className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="심볼 검색..."
              aria-label="심볼 검색"
              autoComplete="off"
              className="h-10 w-full rounded-xl border border-primary/35 bg-card pl-11 pr-4 text-sm font-semibold uppercase text-foreground outline-none transition-colors placeholder:normal-case placeholder:text-muted-foreground focus:border-primary md:h-11"
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
          <a
            href="https://t.me/+HHv5pyuGGAw5YTc1"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="텔레그램 알림 채널 열기"
            title="알림"
            className="relative flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary md:size-11"
          >
            <Bell className="size-4" aria-hidden="true" />
            <span className="absolute right-2 top-2 size-1.5 rounded-full bg-primary" aria-hidden="true" />
          </a>
        </div>

        <nav aria-label="주요 서비스" className="overflow-x-auto pb-1">
          <div className="mx-auto flex min-w-max w-max items-center justify-center gap-1.5 md:gap-2">
            {portalItems.map((item) => {
              const Icon = item.icon
              const active = pathname === item.href && !("mode" in item)
              const content = (
                <>
                  <span className={cn("flex size-9 items-center justify-center rounded-xl border bg-card text-muted-foreground transition-colors group-hover:border-primary/60 group-hover:text-primary", active && "border-primary bg-primary/10 text-primary")}>
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className={cn("text-[10px] font-semibold text-muted-foreground", active && "text-primary")}>{item.label}</span>
                </>
              )
              const className = "group flex w-14 flex-col items-center gap-1 text-center md:w-16"
              return "mode" in item ? (
                <button key={`${item.href}-${item.mode}`} type="button" onClick={() => openTradeMode(item.mode)} className={className}>{content}</button>
              ) : (
                <a key={item.href} href={item.href} aria-current={active ? "page" : undefined} className={className}>{content}</a>
              )
            })}
          </div>
        </nav>
      </div>
    </section>
  )
}
