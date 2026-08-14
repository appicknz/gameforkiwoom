"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Bot, Flag, Gamepad2, Home, Menu, Store } from "lucide-react"
import { cn } from "@/lib/utils"

const railItems = [
  { label: "홈", href: "/", icon: Home },
  { label: "바카", href: "/baka", icon: Gamepad2 },
  { label: "레이스", href: "/race", icon: Flag },
  { label: "자동매매", href: "/trade", icon: Bot },
  { label: "마켓", href: "/market", icon: Store },
] as const

export function PortalRail() {
  const pathname = usePathname()

  return (
    <aside className="fixed bottom-0 left-0 top-12 z-30 hidden w-16 border-r border-border bg-card lg:flex lg:flex-col lg:items-center lg:gap-3 lg:py-4" aria-label="빠른 메뉴">
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent("sidebar:toggle"))}
        className="flex size-10 items-center justify-center rounded-xl border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:bg-primary/10 hover:text-primary"
        aria-label="전체 메뉴 열기"
      >
        <Menu className="size-5" />
      </button>
      <div className="h-px w-8 bg-border" />
      <nav className="flex flex-col gap-2">
        {railItems.map((item) => {
          const Icon = item.icon
          const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`))
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
                active && "bg-primary/10 text-primary",
              )}
            >
              <Icon className="size-5" />
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
