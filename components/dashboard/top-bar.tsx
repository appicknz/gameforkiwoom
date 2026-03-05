"use client"

import { Mail, Bell, Menu, X, Wallet } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useState, useEffect } from "react"

export function TopBar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [balance, setBalance] = useState(0)

  useEffect(() => {
    // 현재 로그인한 사용자의 잔고 조회
    const fetchBalance = async () => {
      try {
        const res = await fetch("/api/user/balance")
        if (res.ok) {
          const { balance } = await res.json()
          setBalance(balance ?? 0)
        }
      } catch (err) {
        console.error("[v0] Failed to fetch balance:", err)
      }
    }
    fetchBalance()
  }, [])

  return (
    <header className="sticky top-0 z-40 w-full bg-background border-b border-border">
      <div className="flex items-center justify-center gap-3 px-3 md:px-4 lg:px-5 py-3 md:py-4">
        {/* 모바일 메뉴 버튼 - 왼쪽 */}
        <div className="absolute left-3 md:left-4 lg:left-5">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden h-8 w-8 hover:bg-secondary"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </Button>
        </div>

        {/* 가운데 - 잔고 표시 */}
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
            <Wallet className="w-4 h-4 text-primary" />
            <span className="text-xs md:text-sm font-semibold text-foreground">
              ₩ {balance.toLocaleString()}
            </span>
          </div>
        </div>

        {/* 오른쪽 - 아이콘 및 프로필 */}
        <div className="absolute right-3 md:right-4 lg:right-5 flex items-center gap-1.5 md:gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="relative hover:bg-secondary transition-all duration-300 hover:scale-110 h-8 w-8"
          >
            <Mail className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="relative hover:bg-secondary transition-all duration-300 hover:scale-110 h-8 w-8"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-destructive rounded-full animate-pulse" />
          </Button>

          <div className="flex items-center gap-2 pl-2 md:pl-3 border-l border-border">
            <Avatar className="w-7 h-7 md:w-8 md:h-8 ring-2 ring-primary/20 transition-all duration-300 hover:ring-primary/40">
              <AvatarImage src="/profile.jpg" alt="User" />
              <AvatarFallback className="text-xs">U</AvatarFallback>
            </Avatar>
            <div className="text-xs hidden sm:block">
              <p className="font-semibold text-foreground">User</p>
              <p className="text-muted-foreground text-[10px]">user@game.local</p>
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
