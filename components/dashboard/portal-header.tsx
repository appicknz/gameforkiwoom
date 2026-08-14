"use client"

import { FormEvent, useMemo, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import {
  Bot,
  CircleDollarSign,
  Flag,
  Gamepad2,
  Landmark,
  ListChecks,
  PackageCheck,
  Search,
  ShoppingBag,
  Store,
  Trophy,
  WalletCards,
} from "lucide-react"
import { cn } from "@/lib/utils"

const portalItems = [
  { label: "바카", href: "/baka", icon: Gamepad2, keywords: "바카라 비트바카" },
  { label: "레이스", href: "/race", icon: Flag, keywords: "경마 레이스 비트토토" },
  { label: "자동매매", href: "/trade", icon: Bot, keywords: "모의매매 코인 트레이딩" },
  { label: "배팅현황", href: "/betting-status", icon: ListChecks, keywords: "베팅 현황" },
  { label: "마켓", href: "/market", icon: Store, keywords: "쇼핑 상품" },
  { label: "구매내역", href: "/purchases", icon: PackageCheck, keywords: "주문 구매" },
  { label: "입금", href: "/deposit", icon: CircleDollarSign, keywords: "충전 지갑" },
  { label: "판매관리", href: "/seller", icon: ShoppingBag, keywords: "판매자 상품관리" },
  { label: "정산관리", href: "/settlement", icon: Landmark, keywords: "수익 정산" },
  { label: "토너먼트", href: "/tournament", icon: Trophy, keywords: "대회 랭킹" },
  { label: "지갑", href: "/wallet", icon: WalletCards, keywords: "자산 출금" },
] as const

export function PortalHeader() {
  const pathname = usePathname()
  const router = useRouter()
  const [query, setQuery] = useState("")

  const match = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return null
    return portalItems.find((item) => `${item.label} ${item.keywords}`.toLowerCase().includes(normalized)) ?? null
  }, [query])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (match) router.push(match.href)
  }

  return (
    <section className="border-b border-border bg-background/95 px-4 py-5 backdrop-blur md:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <form onSubmit={handleSubmit} className="relative mx-auto w-full max-w-4xl">
          <Search className="pointer-events-none absolute left-5 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="메뉴를 검색해 주세요"
            aria-label="메뉴 검색"
            className="h-14 w-full rounded-2xl border border-primary/55 bg-card pl-14 pr-24 text-base font-semibold text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary md:h-16 md:text-lg"
          />
          <button
            type="submit"
            disabled={!match}
            className="absolute right-2 top-1/2 h-10 -translate-y-1/2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground transition-opacity disabled:opacity-35"
          >
            이동
          </button>
        </form>

        <nav aria-label="주요 서비스" className="overflow-x-auto pb-1">
          <div className="mx-auto flex min-w-max items-start justify-center gap-2 md:gap-4">
            {portalItems.map((item) => {
              const Icon = item.icon
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`)
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="group flex w-16 flex-col items-center gap-2 text-center md:w-20"
                >
                  <span className={cn(
                    "flex size-12 items-center justify-center rounded-2xl border bg-card text-muted-foreground shadow-sm transition-all group-hover:-translate-y-0.5 group-hover:border-primary/60 group-hover:text-primary md:size-14",
                    active && "border-primary bg-primary/10 text-primary",
                  )}>
                    <Icon className="size-5 md:size-6" aria-hidden="true" />
                  </span>
                  <span className={cn("text-[11px] font-semibold text-muted-foreground md:text-xs", active && "text-primary")}>{item.label}</span>
                </Link>
              )
            })}
          </div>
        </nav>
      </div>
    </section>
  )
}
