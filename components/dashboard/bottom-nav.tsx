"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useEffect, useRef } from "react"
import { Home, BarChart2, Settings, Dice6, Flag } from "lucide-react"
import { cn } from "@/lib/utils"

const getToken = () => {
  if (typeof window === "undefined") return null
  return localStorage.getItem("app_token")
}

const BASE_NAV_ITEMS = [
  {
    label: "홈",
    icon: Home,
    href: "/market",
    match: ["/market", "/"],
    requireDeposit: false,
  },
  {
    label: "바카라",
    icon: Dice6,
    href: "/baka",
    match: ["/baka"],
    requireDeposit: false,
  },
  {
    label: "레이스",
    icon: Flag,
    href: "/race",
    match: ["/race"],
    requireDeposit: false,
  },
  {
    label: "시그널",
    icon: BarChart2,
    href: "/trade",
    match: ["/trade"],
    requireDeposit: true,
  },
  {
    label: "설정",
    icon: Settings,
    href: "/settings",
    match: ["/settings"],
    requireDeposit: false,
  },
]

export function BottomNav() {
  const pathname  = usePathname()
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
      {/* 하단 탭 바 */}
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
            const Icon   = item.icon
            const active = isActive(item.match)

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
