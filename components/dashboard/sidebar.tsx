"use client"

import {
  LayoutDashboard,
  TrendingUp,
  Hash,
  BookOpen,
  ExternalLink,
  Settings,
  HelpCircle,
  LogOut,
  LogIn,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

const menuItems = [
  { icon: LayoutDashboard, label: "비트벳 공식", href: "/" },
  { icon: TrendingUp,      label: "마감가 분석", href: "/tasks" },
  { icon: Hash,            label: "끝자리 분석", href: "/calendar" },
  { icon: BookOpen,        label: "게임방법",    href: "/analytics" },
  {
    icon: ExternalLink,
    label: "바이낸스",
    href: "https://www.binance.com/en/trade/BTC_USDT?type=spot",
    external: true,
  },
]

const generalItems = [
  { icon: Settings,    label: "설정",    href: "/settings" },
  { icon: HelpCircle,  label: "고객센터", href: "/help" },
]

export function Sidebar() {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    const check = () => {
      try {
        setIsLoggedIn(!!localStorage.getItem("app_token"))
      } catch {
        setIsLoggedIn(false)
      }
    }
    check()
    window.addEventListener("storage", check)
    return () => window.removeEventListener("storage", check)
  }, [])

  const handleLogout = () => {
    try { localStorage.removeItem("app_token") } catch {}
    setIsLoggedIn(false)
    router.push("/login")
  }

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside className={cn(
        "fixed top-0 left-0 w-64 bg-card border-r border-border p-4 h-screen overflow-y-auto z-40 transition-transform duration-300",
        "hidden lg:block",
        mobileOpen && "block -translate-x-0",
        !mobileOpen && "lg:block -translate-x-full lg:translate-x-0"
      )}>
        <div className="flex items-center gap-2 mb-6 group cursor-pointer">
          <Link href="/" className="flex items-center gap-2" onClick={() => setMobileOpen(false)}>
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center transition-transform group-hover:scale-110 duration-300 relative">
              <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground absolute" style={{ top: "30%", left: "30%" }} />
              <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground absolute" style={{ top: "30%", right: "30%" }} />
              <div className="w-3 h-1.5 border-b-2 border-primary-foreground rounded-full absolute bottom-2.5" />
            </div>
            <span className="text-lg font-semibold text-foreground">BitBet</span>
          </Link>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">메뉴</p>
            <nav className="space-y-0.5">
              {menuItems.map((item) => {
                const isActive = !item.external && pathname === item.href
                const linkProps = item.external
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {}
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    {...linkProps}
                    onClick={() => !item.external && setMobileOpen(false)}
                    onMouseEnter={() => setHoveredItem(item.label)}
                    onMouseLeave={() => setHoveredItem(null)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-300",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                      hoveredItem === item.label && !isActive && "translate-x-1",
                    )}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    <span className="text-sm">{item.label}</span>
                    {item.external && (
                      <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
                    )}
                  </Link>
                )
              })}
            </nav>
          </div>

          <div>
            <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">General</p>
            <nav className="space-y-0.5">
              {generalItems.map((item) => {
                const isActive = pathname === item.href
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    onMouseEnter={() => setHoveredItem(item.label)}
                    onMouseLeave={() => setHoveredItem(null)}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-300",
                      isActive
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                      hoveredItem === item.label && !isActive && "translate-x-1",
                    )}
                  >
                    <item.icon className="w-4 h-4 shrink-0" />
                    <span className="text-sm">{item.label}</span>
                  </Link>
                )
              })}

              {/* 로그아웃 / 로그인 동적 버튼 */}
              {isLoggedIn ? (
                <button
                  onClick={handleLogout}
                  onMouseEnter={() => setHoveredItem("auth")}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-300 text-muted-foreground hover:bg-secondary hover:text-foreground",
                    hoveredItem === "auth" && "translate-x-1",
                  )}
                >
                  <LogOut className="w-4 h-4 shrink-0" />
                  <span className="text-sm">로그아웃</span>
                </button>
              ) : (
                <Link
                  href="/login"
                  onClick={() => setMobileOpen(false)}
                  onMouseEnter={() => setHoveredItem("auth")}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-300 text-muted-foreground hover:bg-secondary hover:text-foreground",
                    hoveredItem === "auth" && "translate-x-1",
                  )}
                >
                  <LogIn className="w-4 h-4 shrink-0" />
                  <span className="text-sm">로그인</span>
                </Link>
              )}
            </nav>
          </div>
        </div>
      </aside>
    </>
  )
}
