"use client"

import {
  LayoutDashboard,
  TrendingUp,
  Hash,
  BookOpen,
  ExternalLink,
  LogOut,
  LogIn,
  X,
  Mail,
  Bell,
  MessageCircle,
  Layers,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { ChatPanel } from "@/components/dashboard/chat-panel"

const menuItems = [
  { icon: LayoutDashboard, label: "비트벳 공식", href: "/" },
  { icon: TrendingUp,      label: "마감가 분석", href: "/tasks" },
  { icon: Hash,            label: "끝자리 분석", href: "/calendar" },
  { icon: Layers,          label: "바카라 통계", href: "/baccarat-stats" },
  { icon: BookOpen,        label: "게임방법",    href: "/analytics" },
  {
    icon: ExternalLink,
    label: "바이낸스",
    href: "https://www.binance.com/en/trade/BTC_USDT?type=spot",
    external: true,
  },
]

export function Sidebar() {
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [chatOpen] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [initials, setInitials] = useState("?")
  const pathname = usePathname()
  const router = useRouter()

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 4000)
  }

  useEffect(() => {
    const check = () => {
      try {
        const hasLocal = !!localStorage.getItem("app_token")
        const hasSession = !!sessionStorage.getItem("guest_token")
        setIsLoggedIn(hasLocal || hasSession)
        if (hasSession) setInitials("게스트")
        else if (hasLocal) {
          try {
            const nick = localStorage.getItem("bitbet:chat:nickname")
            setInitials(nick ? nick.slice(0, 2) : "U")
          } catch { setInitials("U") }
        }
      } catch {
        setIsLoggedIn(false)
      }
    }
    check()
    window.addEventListener("storage", check)
    window.addEventListener("guest-login", check)
    return () => {
      window.removeEventListener("storage", check)
      window.removeEventListener("guest-login", check)
    }
  }, [])

  const handleGuestLogin = () => {
    try {
      sessionStorage.setItem("guest_token", "guest")
      sessionStorage.setItem("guest_balance", "100000")
    } catch {}
    setIsLoggedIn(true)
    setInitials("게스트")
    setMobileOpen(false)
    showToast("테스트 게임이 시작됩니다. 10만 포인트가 지급되었습니다.")
    window.dispatchEvent(new Event("guest-login"))
  }

  const handleLogout = () => {
    try {
      localStorage.removeItem("app_token")
      sessionStorage.removeItem("guest_token")
      sessionStorage.removeItem("guest_balance")
    } catch {}
    setIsLoggedIn(false)
    setChatOpen(false)
    router.push("/")
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
        "fixed top-0 left-0 w-64 bg-card border-r border-border h-screen z-40 transition-transform duration-300 flex flex-col",
        "hidden lg:flex",
        mobileOpen && "flex -translate-x-0",
        !mobileOpen && "lg:flex -translate-x-full lg:translate-x-0"
      )}>
        {/* 로고 + 아이콘 헤더 */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border shrink-0">
          <Link href="/" className="flex items-center gap-2 group" onClick={() => setMobileOpen(false)}>
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center transition-transform group-hover:scale-110 duration-300 relative shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground absolute" style={{ top: "30%", left: "30%" }} />
              <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground absolute" style={{ top: "30%", right: "30%" }} />
              <div className="w-3 h-1.5 border-b-2 border-primary-foreground rounded-full absolute bottom-2.5" />
            </div>
            <span className="text-lg font-semibold text-foreground">BitBet</span>
          </Link>

          {/* 아이콘 그룹 */}
          <div className="flex items-center gap-1.5">
            <button className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
              <Mail className="w-4 h-4" />
            </button>
            <button className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors relative">
              <Bell className="w-4 h-4" />
              <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-red-500 rounded-full" />
            </button>
            <div className="w-px h-4 bg-border mx-0.5" />
            {isLoggedIn ? (
              <div className="w-7 h-7 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center">
                <span className="text-[9px] font-bold text-primary">{initials.slice(0, 2)}</span>
              </div>
            ) : (
              <button
                onClick={handleGuestLogin}
                className="w-7 h-7 rounded-full bg-secondary border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors"
              >
                <LogIn className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 flex flex-col">
          {/* 메뉴 - 고정 크기, 스크롤 안 됨 */}
          <div className="shrink-0">
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

          {/* 채팅 섹션 - 고정 높이, 내부 스크롤만 */}
          <div className="flex flex-col shrink-0 max-h-[280px]">
            <div className="flex items-center gap-2 mb-2">
              <MessageCircle className="w-3.5 h-3.5 text-primary" />
              <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">채팅</p>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ChatPanel />
            </div>
          </div>
        </div>
      </aside>

      {/* 토스트 */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-foreground text-background px-5 py-3.5 rounded-xl shadow-2xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 max-w-xs w-full">
          <span className="flex-1">{toast}</span>
          <button onClick={() => setToast(null)} className="shrink-0 opacity-60 hover:opacity-100">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </>
  )
}
