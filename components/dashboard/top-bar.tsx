"use client"

import { Menu, X, Wallet, User, Lock, Eye, EyeOff, ChevronDown, LogOut, UserPlus, LogIn } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useState, useEffect, useRef } from "react"
import { createClient } from "@supabase/supabase-js"

interface Profile {
  username: string
  role: string
}

export function TopBar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [balance, setBalance] = useState(0)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // --- 비로그인 탭 ---
  const [authTab, setAuthTab] = useState<"login" | "register">("login")

  // --- 로그인 폼 ---
  const [loginUsername, setLoginUsername] = useState("")
  const [loginPw, setLoginPw] = useState("")
  const [showLoginPw, setShowLoginPw] = useState(false)
  const [loginMsg, setLoginMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)

  // --- 가입 폼 상태 (비로그인) ---
  const [regUsername, setRegUsername] = useState("")
  const [regPw, setRegPw] = useState("")
  const [regConfirmPw, setRegConfirmPw] = useState("")
  const [showRegPw, setShowRegPw] = useState(false)
  const [showRegConfirm, setShowRegConfirm] = useState(false)
  const [regMsg, setRegMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [regLoading, setRegLoading] = useState(false)

  // --- 아이디 변경 상태 (로그인) ---
  const [editingUsername, setEditingUsername] = useState(false)
  const [newUsername, setNewUsername] = useState("")
  const [usernameMsg, setUsernameMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [usernameLoading, setUsernameLoading] = useState(false)

  // --- 비밀번호 변경 상태 (로그인) ---
  const [showPwForm, setShowPwForm] = useState(false)
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [pwLoading, setPwLoading] = useState(false)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    const fetchProfile = async (userId: string) => {
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('id, username, role')
        .eq('id', userId)
        .single()
      console.log("[v0] profileData:", profileData, "error:", profileError)
      if (profileData) setProfile(profileData)
    }

    const init = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      console.log("[v0] session:", session?.user?.id, "sessionError:", sessionError)
      if (session?.user) {
        setIsLoggedIn(true)
        await fetchProfile(session.user.id)
        fetch("/api/user/balance").then(r => r.json()).then(d => setBalance(d.balance ?? 0))
      } else {
        setIsLoggedIn(false)
      }
    }
    init()

    // 로그인/로그아웃 상태 변경 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log("[v0] authStateChange event:", event, "userId:", session?.user?.id)
      if (session?.user) {
        setIsLoggedIn(true)
        await fetchProfile(session.user.id)
        fetch("/api/user/balance").then(r => r.json()).then(d => setBalance(d.balance ?? 0))
      } else {
        setIsLoggedIn(false)
        setProfile(null)
        setBalance(0)
      }
    })
    return () => subscription.unsubscribe()
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

  // 로그인
  const handleLogin = async () => {
    setLoginMsg(null)
    if (!loginUsername.trim()) return setLoginMsg({ text: "아이디를 입력해주세요.", ok: false })
    if (!loginPw) return setLoginMsg({ text: "비밀번호를 입력해주세요.", ok: false })

    setLoginLoading(true)
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: loginUsername, password: loginPw }),
    })
    const data = await res.json()

    if (!res.ok) {
      setLoginLoading(false)
      return setLoginMsg({ text: data.error ?? "로그인에 실패했습니다.", ok: false })
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: loginPw,
    })

    setLoginLoading(false)

    if (signInError) {
      return setLoginMsg({ text: "아이디 또는 비밀번호가 올바르지 않습니다.", ok: false })
    }

    setIsLoggedIn(true)
    setDropdownOpen(false)
    setLoginUsername(""); setLoginPw("")
    window.location.reload()
  }

  // 가입하기
  const handleRegister = async () => {
    setRegMsg(null)
    if (!regUsername.trim()) return setRegMsg({ text: "아이디를 입력해주세요.", ok: false })
    if (!regPw) return setRegMsg({ text: "비밀번호를 입력해주세요.", ok: false })
    if (regPw !== regConfirmPw) return setRegMsg({ text: "비밀번호가 일치하지 않습니다.", ok: false })
    if (regPw.length < 4) return setRegMsg({ text: "비밀번호는 4자 이상이어야 합니다.", ok: false })

    setRegLoading(true)
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: regUsername, password: regPw }),
    })
    const data = await res.json()

    if (!res.ok) {
      setRegLoading(false)
      return setRegMsg({ text: data.error ?? "오류가 발생했습니다.", ok: false })
    }

    // 가입 성공 → 자동 로그인
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: regPw,
    })

    setRegLoading(false)

    if (signInError) {
      return setRegMsg({ text: "가입은 완료됐으나 로그인에 실패했습니다.", ok: false })
    }

    // 상태 갱신
    setIsLoggedIn(true)
    setProfile({ username: regUsername, role: "user" })
    setDropdownOpen(false)
    setRegUsername(""); setRegPw(""); setRegConfirmPw("")
    window.location.reload()
  }

  // 아이디 변경
  const handleUsernameSave = async () => {
    if (!newUsername.trim()) return setUsernameMsg({ text: "아이디를 입력해주세요.", ok: false })
    if (newUsername.length < 2) return setUsernameMsg({ text: "2자 이상 입력해주세요.", ok: false })
    setUsernameLoading(true)
    const res = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newUsername }),
    })
    const data = await res.json()
    setUsernameLoading(false)
    if (res.ok) {
      setProfile(prev => prev ? { ...prev, username: newUsername } : prev)
      setUsernameMsg({ text: "아이디가 변경되었습니다.", ok: true })
      setEditingUsername(false)
    } else {
      setUsernameMsg({ text: data.error ?? "오류가 발생했습니다.", ok: false })
    }
  }

  // 비밀번호 변경
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

  // 로그아웃
  const handleLogout = async () => {
    await supabase.auth.signOut()
    setIsLoggedIn(false)
    setProfile(null)
    setBalance(0)
    setDropdownOpen(false)
    window.location.reload()
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
            onClick={() => setDropdownOpen(v => !v)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <Avatar className="w-7 h-7 ring-2 ring-primary/20">
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                {isLoggedIn ? initials : <UserPlus className="w-3.5 h-3.5" />}
              </AvatarFallback>
            </Avatar>
            <span className="text-xs font-semibold hidden sm:block text-foreground">
              {isLoggedIn ? (profile?.username ?? "...") : "가입"}
            </span>
            <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-72 bg-card border border-border rounded-xl shadow-xl z-50">

              {/* ===== 비로그인: 로그인 / 가입 탭 ===== */}
              {!isLoggedIn && (
                <>
                  {/* 탭 */}
                  <div className="flex border-b border-border">
                    <button
                      onClick={() => { setAuthTab("login"); setLoginMsg(null) }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors ${authTab === "login" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <LogIn className="w-3.5 h-3.5" /> 로그인
                    </button>
                    <button
                      onClick={() => { setAuthTab("register"); setRegMsg(null) }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors ${authTab === "register" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <UserPlus className="w-3.5 h-3.5" /> 회원가입
                    </button>
                  </div>

                  <div className="px-4 py-3 space-y-2">
                    {/* 로그인 폼 */}
                    {authTab === "login" && (
                      <>
                        <div className="relative">
                          <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input type="text" placeholder="아이디" value={loginUsername}
                            onChange={e => setLoginUsername(e.target.value)}
                            className="w-full h-9 pl-8 pr-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input type={showLoginPw ? "text" : "password"} placeholder="비밀번호"
                            value={loginPw} onChange={e => setLoginPw(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleLogin()}
                            className="w-full h-9 pl-8 pr-9 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button type="button" onClick={() => setShowLoginPw(v => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {showLoginPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        {loginMsg && <p className={`text-xs ${loginMsg.ok ? "text-primary" : "text-destructive"}`}>{loginMsg.text}</p>}
                        <Button className="w-full h-9 text-sm" onClick={handleLogin} disabled={loginLoading}>
                          {loginLoading ? "로그인 중..." : "로그인"}
                        </Button>
                      </>
                    )}

                    {/* 가입 폼 */}
                    {authTab === "register" && (
                      <>
                        <div className="relative">
                          <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input type="text" placeholder="아이디" value={regUsername}
                            onChange={e => setRegUsername(e.target.value)}
                            className="w-full h-9 pl-8 pr-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input type={showRegPw ? "text" : "password"} placeholder="비밀번호"
                            value={regPw} onChange={e => setRegPw(e.target.value)}
                            className="w-full h-9 pl-8 pr-9 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button type="button" onClick={() => setShowRegPw(v => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {showRegPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input type={showRegConfirm ? "text" : "password"} placeholder="비밀번호 확인"
                            value={regConfirmPw} onChange={e => setRegConfirmPw(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleRegister()}
                            className="w-full h-9 pl-8 pr-9 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button type="button" onClick={() => setShowRegConfirm(v => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {showRegConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        {regMsg && <p className={`text-xs ${regMsg.ok ? "text-primary" : "text-destructive"}`}>{regMsg.text}</p>}
                        <Button className="w-full h-9 text-sm" onClick={handleRegister} disabled={regLoading}>
                          {regLoading ? "처리 중..." : "가입하기"}
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}

              {/* ===== 로그인: 아이디/비밀번호 변경 + 로그아웃 ===== */}
              {isLoggedIn && (
                <>
                  {/* 아이디 */}
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-xs text-muted-foreground mb-1">아이디</p>
                    {editingUsername ? (
                      <div className="space-y-2">
                        <div className="relative">
                          <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input
                            autoFocus
                            type="text"
                            value={newUsername}
                            onChange={e => setNewUsername(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleUsernameSave()}
                            placeholder="새 아이디"
                            className="w-full h-9 pl-8 pr-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                        </div>
                        {usernameMsg && (
                          <p className={`text-xs ${usernameMsg.ok ? "text-primary" : "text-destructive"}`}>{usernameMsg.text}</p>
                        )}
                        <div className="flex gap-2">
                          <Button size="sm" className="flex-1 h-8 text-xs" onClick={handleUsernameSave} disabled={usernameLoading}>
                            {usernameLoading ? "저장 중..." : "저장"}
                          </Button>
                          <Button size="sm" variant="outline" className="flex-1 h-8 text-xs" onClick={() => setEditingUsername(false)}>
                            취소
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setNewUsername(profile?.username ?? ""); setUsernameMsg(null); setEditingUsername(true) }}
                        className="flex items-center gap-2 w-full px-3 py-2 bg-muted rounded-lg hover:bg-secondary transition-colors text-left"
                      >
                        <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium text-foreground flex-1">{profile?.username ?? "-"}</span>
                        <span className="text-[10px] text-muted-foreground">수정</span>
                      </button>
                    )}
                  </div>

                  {/* 비밀번호 변경 */}
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
                        <div className="relative">
                          <input type={showNew ? "text" : "password"} placeholder="새 비밀번호"
                            value={newPw} onChange={e => setNewPw(e.target.value)}
                            className="w-full h-9 px-3 pr-9 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button type="button" onClick={() => setShowNew(v => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {showNew ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <div className="relative">
                          <input type={showConfirm ? "text" : "password"} placeholder="비밀번호 확인"
                            value={confirmPw} onChange={e => setConfirmPw(e.target.value)}
                            className="w-full h-9 px-3 pr-9 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button type="button" onClick={() => setShowConfirm(v => !v)}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {showConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        {pwMsg && (
                          <p className={`text-xs ${pwMsg.ok ? "text-primary" : "text-destructive"}`}>{pwMsg.text}</p>
                        )}
                        <Button size="sm" className="w-full h-8 text-xs" onClick={handlePwChange} disabled={pwLoading}>
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
                </>
              )}

            </div>
          )}
        </div>
      </div>
    </header>
  )
}
