"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { Home, BarChart2, Settings, ShoppingBag, Store, Landmark } from "lucide-react"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  {
    label: "홈",
    icon: Home,
    href: "/market",
    match: ["/market", "/"],
  },
  {
    label: "내역",
    icon: ShoppingBag,
    href: null, // 드로어 오픈
    match: ["/purchases", "/seller", "/settlement"],
  },
  {
    label: "시그널",
    icon: BarChart2,
    href: "/trade",
    match: ["/trade"],
  },
  {
    label: "설정",
    icon: Settings,
    href: "/settings",
    match: ["/settings"],
  },
]

const DRAWER_ITEMS = [
  { label: "구매내역", icon: ShoppingBag, href: "/purchases" },
  { label: "판매관리", icon: Store,       href: "/seller" },
  { label: "정산관리", icon: Landmark,    href: "/settlement" },
]

export function BottomNav() {
  const pathname  = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [visible,    setVisible]    = useState(true)
  const lastY = useRef(0)

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      // 최상단(100px 이하)이면 항상 표시
      if (y < 100) { setVisible(true); lastY.current = y; return }
      // 아래로 스크롤(y 증가) → 표시, 위로 스크롤(y 감소) → 투명
      setVisible(y > lastY.current)
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

      {/* 드로어 시트 — 하단에서 올라옴 */}
      <div
        className={cn(
          "fixed left-0 right-0 z-50 md:hidden transition-transform duration-300 ease-out",
          "bg-[oklch(0.15_0.01_155)] border-t border-border rounded-t-2xl pb-safe",
          drawerOpen ? "translate-y-0 bottom-[60px]" : "translate-y-full bottom-[60px]",
        )}
      >
        <div className="flex flex-col gap-1 px-3 py-4">
          {DRAWER_ITEMS.map(item => {
            const Icon = item.icon
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setDrawerOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors",
                  active
                    ? "bg-primary/10 text-primary"
                    : "text-foreground hover:bg-secondary",
                )}
              >
                <Icon className={cn("w-4 h-4", active ? "text-primary" : "text-muted-foreground")} />
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>

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
