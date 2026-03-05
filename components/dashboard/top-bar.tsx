"use client"

import { Menu, X, Wallet, User, Lock, Eye, EyeOff, ChevronDown, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useState, useEffect, useRef } from "react"
import { createClient } from "@supabase/supabase-js"

interface Profile {
  username: string
  role: string
  email: string
}

export function TopBar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [balance, setBalance] = useState(0)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  // 비밀번호 변경
  const [showPwForm, setShowPwForm] = useState(false)
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [pwLoading, setPwLoading] = useState(false)

  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch("/api/user/balance").then(r => r.json()).then(d => setBalance(d.balance ?? 0))
    fetch("/api/user/profile").then(r => r.json()).then(d => {
      if (d.profile) setProfile({ ...d.profile, email: d.email })
    })
  }, [])

  // 드롭다운 외부 클릭 시 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const handlePwChange = async () => {
    if (!newPw || !confirmPw) return setPwMsg({ text: "모든 항목을 입력해주세요.", ok: false })
    if (newPw !== confirmPw) return setPwMsg({ text: "비밀번호가 일치하지 않습니다.", ok: false })
    if (newPw.length < 4) return setPwMsg({ text: "4자 이상 입력해주세요.", ok: false })

    setPwLoading(true)
    const res = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: newPw }),
    })
    const data = await res.json()
    setPwLoading(false)

    if (res.ok) {
      setPwMsg({ text: "비밀번호가 변경되었습니다.", ok: true })
      setNewPw(""); setConfirmPw("")
    } else {
      setPwMsg({ text: data.error ?? "오류가 발생했습니다.", ok: false })
    }
  }

  const handleLogout = async () => {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
    await sb.auth.signOut()
    window.location.href = "/login"
  }

  const initials = profile?.username?.slice(0, 2).toUpperCase() ?? "?"

  return (
    <header className="sticky top-0 z-40 w-full bg-background border-b border-border">
      <div className="relative flex items-center justify-center px-3 md:px-4 lg:px-5 py-3">

        {/* 좌측 - 모바일 메뉴 버튼 */}
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

        {/* 가운데 - 잔고 */}
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/20">
          <Wallet className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">
            ₩ {balance.toLocaleString()}
          </span>
        </div>

        {/* 우측 - 프로필 드롭다운 */}
        <div className="absolute right-3 md:right-4 lg:right-5" ref={dropdownRef}>
          <button
            onClick={() => { setDropdownOpen(v => !v); setShowPwForm(false); setPwMsg(null) }}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <Avatar className="w-7 h-7 ring-2 ring-primary/20">
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
            </Avatar>
            <span className="text-xs font-semibold hidden sm:block text-foreground">
              {profile?.username ?? "..."}
            </span>
            <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {/* 드롭다운 패널 */}
          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-xl shadow-xl z-50">
              {/* 유저 정보 */}
              <div className="px-4 py-3 border-b border-border">
                <p className="text-xs text-muted-foreground mb-1">아이디</p>
                <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">{profile?.username ?? "-"}</span>
                </div>
              </div>

              {/* 비밀번호 변경 토글 */}
              <div className="px-4 py-3 border-b border-border">
                <button
                  onClick={() => { setShowPwForm(v => !v); setPwMsg(null) }}
                  className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>비밀번호 변경</span>
                  <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${showPwForm ? "rotate-180" : ""}`} />
                </button>

                {showPwForm && (
                  <div className="mt-3 space-y-2">
                    {/* 새 비밀번호 */}
                    <div className="relative">
                      <input
                        type={showNew ? "text" : "password"}
                        placeholder="새 비밀번호"
                        value={newPw}
                        onChange={e => setNewPw(e.target.value)}
                        className="w-full h-9 px-3 pr-9 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNew(v => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                      >
                        {showNew ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    {/* 비밀번호 확인 */}
                    <div className="relative">
                      <input
                        type={showConfirm ? "text" : "password"}
                        placeholder="비밀번호 확인"
                        value={confirmPw}
                        onChange={e => setConfirmPw(e.target.value)}
                        className="w-full h-9 px-3 pr-9 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirm(v => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
                      >
                        {showConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {pwMsg && (
                      <p className={`text-xs ${pwMsg.ok ? "text-primary" : "text-destructive"}`}>{pwMsg.text}</p>
                    )}

                    <Button
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={handlePwChange}
                      disabled={pwLoading}
                    >
                      {pwLoading ? "변경 중..." : "변경하기"}
                    </Button>
                  </div>
                )}
              </div>

              {/* 로그아웃 */}
              <div className="px-4 py-2">
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 text-xs text-destructive hover:text-destructive/80 transition-colors w-full py-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>로그아웃</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
