"use client"

import { Menu, X, Wallet, User, Lock, Eye, EyeOff, ChevronDown, LogOut, UserPlus, LogIn, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useState, useEffect, useRef } from "react"
import { createClient } from "@supabase/supabase-js"
import { useRouter } from "next/navigation"

interface Profile {
  username: string
  role: string
}

// 모듈 레벨 싱글톤 - 절대로 컴포넌트 내부에서 createClient 호출 금지
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// React Strict Mode 에서 중복 구독 방지
let authSubscriptionUnsubscribe: (() => void) | null = null

const ADMIN_ROLES = ["master", "super_admin", "branch_admin"]

export function TopBar() {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [balance, setBalance] = useState(0)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // 비로그인 탭
  const [authTab, setAuthTab] = useState<"login" | "register">("login")

  // 로그인 폼
  const [loginUsername, setLoginUsername] = useState("")
  const [loginPw, setLoginPw] = useState("")
  const [showLoginPw, setShowLoginPw] = useState(false)
  const [loginMsg, setLoginMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)

  // 가입 폼
  const [regUsername, setRegUsername] = useState("")
  const [regPw, setRegPw] = useState("")
  const [regConfirmPw, setRegConfirmPw] = useState("")
  const [showRegPw, setShowRegPw] = useState(false)
  const [showRegConfirm, setShowRegConfirm] = useState(false)
  const [regMsg, setRegMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [regLoading, setRegLoading] = useState(false)

  // 비밀번호 변경 (로그인)
  const [showPwForm, setShowPwForm] = useState(false)
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [pwLoading, setPwLoading] = useState(false)

  // ── 초기화: 세션 확인 ──────────────────────────────────────
  useEffect(() => {
    const loadSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user && session.access_token) {
        setIsLoggedIn(true)
        // profiles 테이블에서 username/role 조회 (access_token으로 인증)
        const token = session.access_token
        const [profileRes, balanceRes] = await Promise.all([
          fetch("/api/user/profile", { headers: { Authorization: `Bearer ${token}` } }),
          fetch("/api/user/balance", { headers: { Authorization: `Bearer ${token}` } }),
        ])
        if (profileRes.ok) {
          const d = await profileRes.json()
          if (d.profile) setProfile({ username: d.profile.username, role: d.profile.role })
        }
        if (balanceRes.ok) {
          const d = await balanceRes.json()
          setBalance(d.balance ?? 0)
        }
      }
    }
    loadSession()

    // React Strict Mode에서 중복 구독 방지
    if (!authSubscriptionUnsubscribe) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user && session.access_token) {
          setIsLoggedIn(true)
          const token = session.access_token
          const [profileRes, balanceRes] = await Promise.all([
            fetch("/api/user/profile", { headers: { Authorization: `Bearer ${token}` } }),
            fetch("/api/user/balance", { headers: { Authorization: `Bearer ${token}` } }),
          ])
          if (profileRes.ok) {
            const d = await profileRes.json()
            if (d.profile) setProfile({ username: d.profile.username, role: d.profile.role })
          }
          if (balanceRes.ok) {
            const d = await balanceRes.json()
            setBalance(d.balance ?? 0)
          }
        } else {
          setIsLoggedIn(false)
          setProfile(null)
          setBalance(0)
        }
      })
      authSubscriptionUnsubscribe = () => subscription.unsubscribe()
    }

    return () => {}
  }, [])

  // 드롭다운 외부 클릭 닫기
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // ── 로그인 ─────────────────────────────────────────────────
  const handleLogin = async () => {
    setLoginMsg(null)
    if (!loginUsername.trim()) return setLoginMsg({ text: "아이디를 입력해주세요.", ok: false })
    if (!loginPw) return setLoginMsg({ text: "비밀번호를 입력해주세요.", ok: false })

    setLoginLoading(true)

    // 1) 서버에서 username → email 조회
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

    // 2) 클라이언트에서 signInWithPassword
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: loginPw,
    })

    setLoginLoading(false)

    if (signInError) {
      return setLoginMsg({ text: "아이디 또는 비밀번호가 올바르지 않습니다.", ok: false })
    }

    // 3) username을 API 응답에서 직접 받아 state에 저장 (DB/쿠키 읽기 불필요)
    setProfile({ username: data.username, role: data.role ?? "user" })
    setIsLoggedIn(true)
    setDropdownOpen(false)
    setLoginUsername("")
    setLoginPw("")
    fetch("/api/user/balance").then(r => r.json()).then(d => setBalance(d.balance ?? 0))
  }

  // ── 가입 ───────────────────────────────────────────────────
  const handleRegister = async () => {
    setRegMsg(null)
    if (!regUsername.trim()) return setRegMsg({ text: "아이디를 입력해주세요.", ok: false })
    if (regUsername.length < 2) return setRegMsg({ text: "아이디는 2자 이상이어야 합니다.", ok: false })
    if (!regPw) return setRegMsg({ text: "비밀번호를 입력해주세요.", ok: false })
    if (regPw.length < 4) return setRegMsg({ text: "비밀번호는 4자 이상이어야 합니다.", ok: false })
    if (regPw !== regConfirmPw) return setRegMsg({ text: "비밀번호가 일치하지 않습니다.", ok: false })

    setRegLoading(true)

    // 1) 서버에서 가입 처리
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: regUsername, password: regPw }),
    })
    const data = await res.json()

    if (!res.ok) {
      setRegLoading(false)
      return setRegMsg({ text: data.error ?? "가입에 실패했습니다.", ok: false })
    }

    // 2) 가입 성공 → signInWithPassword로 자동 로그인
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: regPw,
    })

    setRegLoading(false)

    if (signInError) {
      return setRegMsg({ text: "가입은 완료됐으나 로그인에 실패했습니다.", ok: false })
    }

    // 3) username을 API 응답에서 직접 받아 state에 저장
    setProfile({ username: data.username ?? regUsername, role: "user" })
    setIsLoggedIn(true)
    setDropdownOpen(false)
    setRegUsername(""); setRegPw(""); setRegConfirmPw("")
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.access_token) {
        fetch("/api/user/balance", { headers: { Authorization: `Bearer ${session.access_token}` } })
          .then(r => r.json()).then(d => setBalance(d.balance ?? 0))
      }
    })
  }

  // ── 비밀번호 변경 ──────────────────────────────────────────
  const handlePwChange = async () => {
    setPwMsg(null)
    if (!newPw) return setPwMsg({ text: "새 비밀번호를 입력해주세요.", ok: false })
    if (newPw.length < 4) return setPwMsg({ text: "비밀번호는 4자 이상이어야 합니다.", ok: false })
    if (newPw !== confirmPw) return setPwMsg({ text: "비밀번호가 일치하지 않습니다.", ok: false })

    setPwLoading(true)
    const { data: { session: pwSession } } = await supabase.auth.getSession()
    const res = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(pwSession?.access_token ? { Authorization: `Bearer ${pwSession.access_token}` } : {}),
      },
      body: JSON.stringify({ newPassword: newPw }),
    })
    const d = await res.json()
    setPwLoading(false)

    if (res.ok) {
      setPwMsg({ text: "비밀번호가 변경되었습니다.", ok: true })
      setNewPw(""); setConfirmPw(""); setShowPwForm(false)
    } else {
      setPwMsg({ text: d.error ?? "오류가 발생했습니다.", ok: false })
    }
  }

  // ── 로그아웃 ───────────────────────────────────────────────
  const handleLogout = async () => {
    await supabase.auth.signOut()
    setIsLoggedIn(false)
    setProfile(null)
    setBalance(0)
    setDropdownOpen(false)
  }

  const initials = profile?.username?.slice(0, 2).toUpperCase() ?? "?"

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur">
      <div className="flex h-14 items-center justify-between px-4">
        {/* 좌측 햄버거 */}
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          aria-label="메뉴"
        >
          {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

        {/* 중앙 잔고 */}
        <button className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full hover:bg-primary/20 transition-colors">
          <Wallet className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-primary">₩ {balance.toLocaleString()}</span>
        </button>

        {/* 우측 */}
        <div className="flex items-center gap-2" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(v => !v)}
            className="flex items-center gap-2 p-1 rounded-full hover:bg-muted transition-colors"
            aria-label="프로필"
          >
            <Avatar className="w-8 h-8 bg-primary">
              <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
          </button>

          {/* 드롭다운 */}
          {dropdownOpen && (
            <div className="absolute top-14 right-4 w-72 bg-background border border-border rounded-xl shadow-lg overflow-hidden z-50">

              {/* ── 로그인 상태 ── */}
              {isLoggedIn ? (
                <>
                  {/* 아이디 (읽기 전용) */}
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-xs text-muted-foreground mb-1">아이디</p>
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
                      <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium text-foreground">{profile?.username ?? "-"}</span>
                    </div>
                  </div>

                  {/* 비밀번호 변경 */}
                  <div className="border-b border-border">
                    <button
                      onClick={() => { setShowPwForm(v => !v); setPwMsg(null) }}
                      className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-2 text-sm text-foreground">
                        <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                        비밀번호 변경
                      </div>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showPwForm ? "rotate-180" : ""}`} />
                    </button>

                    {showPwForm && (
                      <div className="px-4 pb-3 space-y-2">
                        <div className="relative">
                          <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input
                            type={showNew ? "text" : "password"}
                            placeholder="새 비밀번호"
                            value={newPw}
                            onChange={e => setNewPw(e.target.value)}
                            className="w-full h-9 pl-8 pr-9 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {showNew ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input
                            type={showConfirm ? "text" : "password"}
                            placeholder="비밀번호 확인"
                            value={confirmPw}
                            onChange={e => setConfirmPw(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handlePwChange()}
                            className="w-full h-9 pl-8 pr-9 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {showConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        {pwMsg && <p className={`text-xs ${pwMsg.ok ? "text-primary" : "text-destructive"}`}>{pwMsg.text}</p>}
                        <Button className="w-full h-9 text-sm" onClick={handlePwChange} disabled={pwLoading}>
                          {pwLoading ? "변경 중..." : "변경하기"}
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* 관리자 패널 (master/super_admin/branch_admin만) */}
                  {ADMIN_ROLES.includes(profile?.role ?? "") && (
                    <button
                      onClick={() => { setDropdownOpen(false); router.push("/panel") }}
                      className="flex items-center gap-2 w-full px-4 py-3 text-sm text-primary hover:bg-primary/10 transition-colors border-b border-border"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      관리자 패널
                    </button>
                  )}

                  {/* 로그아웃 */}
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 w-full px-4 py-3 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    로그아웃
                  </button>
                </>
              ) : (
                /* ── 비로그인 상태 ── */
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
                          <button type="button" onClick={() => setShowLoginPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
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
                          <button type="button" onClick={() => setShowRegPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
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
                          <button type="button" onClick={() => setShowRegConfirm(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
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
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
