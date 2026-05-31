"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { Home, BarChart2, Settings, ShoppingBag, Store, Landmark } from "lucide-react"
import { cn } from "@/lib/utils"

const getToken = () => {
  if (typeof window === "undefined") return null
  return localStorage.getItem("app_token")
}

const MARKET_DOMAIN = "https://market.dissig.com"

const BASE_NAV_ITEMS = [
  {
    label: "마켓",
    icon: Home,
    href: `${MARKET_DOMAIN}/market`,
    match: [] as string[],
    requireDeposit: false,
    external: true,
  },
  {
    label: "내역",
    icon: ShoppingBag,
    href: null,
    match: [] as string[],
    requireDeposit: false,
    external: false,
  },
  {
    label: "시그널",
    icon: BarChart2,
    href: "/trade",
    match: ["/trade"],
    requireDeposit: true,
    external: false,
  },
  {
    label: "설정",
    icon: Settings,
    href: "/settings",
    match: ["/settings"],
    requireDeposit: false,
    external: false,
  },
]

const DRAWER_ITEMS = [
  { label: "구매내역", icon: ShoppingBag, href: `${MARKET_DOMAIN}/purchases` },
  { label: "판매관리", icon: Store,       href: `${MARKET_DOMAIN}/seller` },
  { label: "정산관리", icon: Landmark,    href: `${MARKET_DOMAIN}/settlement` },
]

export function BottomNav() {
  const pathname  = usePathname()
  const [drawerOpen,        setDrawerOpen]        = useState(false)
  const [visible,           setVisible]           = useState(true)
  const [allowTokenDeposit, setAllowTokenDeposit] = useState(false)
  const lastY = useRef(0)

  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetch("/api/user/profile", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setAllowTokenDeposit(!!d?.profile?.allow_token_deposit))
      .catch(() => {})
  }, [])

  const NAV_ITEMS = BASE_NAV_ITEMS.filter(
    item => !item.requireDeposit || allowTokenDeposit
  )

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      // 최상단(60px 이하)이면 항상 표시
      if (y < 60) { setVisible(true); lastY.current = y; return }
      // 스크롤 올림 = scrollY 증가 → 탭바 숨김
      // 스크롤 내림 = scrollY 감소 → 탭바 표시
      if (y > lastY.current) setVisible(false)
      else if (y < lastY.current) setVisible(true)
      lastY.current = y
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const isActive = (match: string[]) =>
    match.some(m => m === "/" ? pathname === m : pathname.startsWith(m))

  return (
    <>
      {/* 드로어 오버레이 */}
      {drawerOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 md:hidden"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      {/* 드로어 시트 — drawerOpen 일 때만 렌더 */}
      {drawerOpen && visible && (
        <div
          className="fixed left-0 right-0 bottom-[60px] z-50 md:hidden rounded-t-2xl bg-[oklch(0.15_0.01_155)] pb-safe"
        >
          <div className="flex flex-col gap-1 px-3 py-4">
            {DRAWER_ITEMS.map(item => {
              const Icon = item.icon
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setDrawerOpen(false)}
                  className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors text-foreground hover:bg-secondary"
                >
                  <Icon className="w-4 h-4 text-muted-foreground" />
                  {item.label}
                </a>
              )
            })}
          </div>
        </div>
      )}

      {/* 하단 탭 바 — 위로 스크롤 시 투명(콘텐츠 비침), 아래로 스크롤 시 불투명 */}
      <nav
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 md:hidden",
          "transition-opacity duration-300 ease-in-out",
          visible
            ? "opacity-100 bg-[oklch(0.12_0.01_155)] pointer-events-auto"
            : "opacity-0 bg-transparent pointer-events-none",
        )}
      >
        <div className="flex items-stretch h-[60px] pb-safe">
          {NAV_ITEMS.map(item => {
            const Icon = item.icon
            const active = isActive(item.match)
            const isDrawer = item.href === null

            if (isDrawer) {
              return (
                <button
                  key="drawer"
                  onClick={() => setDrawerOpen(v => !v)}
                  className="flex flex-1 flex-col items-center justify-center gap-1 transition-colors"
                >
                  <Icon
                    className={cn(
                      "w-5 h-5 transition-colors",
                      active || drawerOpen ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <span
                    className={cn(
                      "text-[10px] font-medium transition-colors",
                      active || drawerOpen ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {item.label}
                  </span>
                </button>
              )
            }

            if (item.external) {
              return (
                <a
                  key={item.href}
                  href={item.href!}
                  className="flex flex-1 flex-col items-center justify-center gap-1 transition-colors"
                >
                  <Icon className="w-5 h-5 text-muted-foreground" />
                  <span className="text-[10px] font-medium text-muted-foreground">{item.label}</span>
                </a>
              )
            }

            return (
              <Link
                key={item.href}
                href={item.href!}
                className="flex flex-1 flex-col items-center justify-center gap-1 transition-colors"
              >
                <Icon
                  className={cn(
                    "w-5 h-5 transition-colors",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span
                  className={cn(
                    "text-[10px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </nav>
    </>
  )
}
