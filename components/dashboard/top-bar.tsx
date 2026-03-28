"use client"

/**
 * TopBar - Supabase 클라이언트 SDK 완전 미사용
 * - 로그인/가입: 서버 API 호출 → 서버에서 토큰 발급 → localStorage 저장
 * - GoTrueClient 인스턴스 0개 → lock 경합 없음
 * - 잔고: balance:update 커스텀 이벤트로 betting-game과 동기화
 */

import { Home, X, Wallet, User, Lock, Eye, EyeOff, ChevronDown, LogOut, UserPlus, LogIn, Shield, GitBranch } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"

const STORAGE_KEY = "app_token"
const PROFILE_KEY = "app_profile"
const ADMIN_ROLES = ["master", "super_admin", "branch_admin"]

interface Profile { username: string; role: string; branch_code?: string | null }

function saveToken(token: string) {
  try { localStorage.setItem(STORAGE_KEY, token) } catch {}
}
function getToken(): string | null {
  try { return localStorage.getItem(STORAGE_KEY) } catch { return null }
}
function clearToken() {
  try { localStorage.removeItem(STORAGE_KEY) } catch {}
}

export function TopBar() {
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [balance, setBalance] = useState(0)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

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

  // 지점코드 입력
  const [showBranchForm, setShowBranchForm] = useState(false)
  const [branchCodeInput, setBranchCodeInput] = useState("")
  const [branchMsg, setBranchMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [branchLoading, setBranchLoading] = useState(false)

  // 비밀번호 변경
  const [showPwForm, setShowPwForm] = useState(false)
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [pwLoading, setPwLoading] = useState(false)

  // ── 초기화: localStorage 토큰으로 프로필 + 잔고 복원 ──────────────
  useEffect(() => {
    const token = getToken()
    if (!token) return

    Promise.all([
      fetch("/api/user/profile", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/user/balance", { headers: { Authorization: `Bearer ${token}` } }),
    ]).then(async ([pr, br]) => {
      if (pr.status === 401) { clearToken(); return } // 토큰 만료
      if (pr.ok) {
        const d = await pr.json()
        if (d.profile) {
          setProfile({ username: d.profile.username, role: d.profile.role, branch_code: d.profile.branch_code ?? null })
          setIsLoggedIn(true)
        }
      }
      if (br.ok) {
        const d = await br.json()
        setBalance(d.balance ?? 0)
      }
    }).catch(() => {})
  }, [])

  // ── balance:update 이벤트 수신 (같은 기기 내 betting-game → top-bar) ──
  useEffect(() => {
    const handler = (e: Event) => {
      const v = (e as CustomEvent<number>).detail
      if (typeof v === "number") setBalance(v)
    }
    window.addEventListener("balance:update", handler)
    return () => window.removeEventListener("balance:update", handler)
  }, [])

  // ── SSE 잔고 스트림: 서버에서 push (다기기 실시간 동기화, 폴링 없음) ──
  useEffect(() => {
    const token = getToken()
    if (!token) return

    let es: EventSource | null = null
    let retry: ReturnType<typeof setTimeout> | null = null

    const connect = () => {
      // EventSource는 헤더를 지원 안 하므로 토큰을 쿼리 파라미터로 전달
      es = new EventSource(`/api/user/balance/stream?token=${encodeURIComponent(token)}`)
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data)
          if (typeof d.balance === "number") {
            setBalance(d.balance)
            window.dispatchEvent(new CustomEvent("balance:update", { detail: d.balance }))
          }
        } catch {}
      }
      es.onerror = () => {
        es?.close()
        // 연결 끊기면 5초 후 재연결
        retry = setTimeout(connect, 5_000)
      }
    }

    connect()
    return () => {
      es?.close()
      if (retry) clearTimeout(retry)
    }
  }, [isLoggedIn])

  // ── 외부 클릭 닫기 ──────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  // ── 로그인: 서버 API가 토큰 반환 ─────────────────────────────────
  const handleLogin = async () => {
    setLoginMsg(null)
    if (!loginUsername.trim()) return setLoginMsg({ text: "아이디를 입력해주세요.", ok: false })
    if (!loginPw) return setLoginMsg({ text: "비밀번호를 입력해주세요.", ok: false })

    setLoginLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername, password: loginPw }),
      })
      const data = await res.json()
      setLoginLoading(false)

      if (!res.ok) return setLoginMsg({ text: data.error ?? "로그인 실패", ok: false })

      // 서버가 발급한 토큰 저장 (localStorage["app_token"] 전용)
      saveToken(data.token)

      setProfile({ username: data.username, role: data.role ?? "user" })
      setIsLoggedIn(true)
      setDropdownOpen(false)
      setLoginUsername("")
      setLoginPw("")

      // 잔고 로드
      fetch("/api/user/balance", { headers: { Authorization: `Bearer ${data.token}` } })
        .then(r => r.json()).then(d => setBalance(d.balance ?? 0))
    } catch {
      setLoginLoading(false)
      setLoginMsg({ text: "네트워크 오류가 발생했습니다.", ok: false })
    }
  }

  // ── 가입: 서버 API가 토큰 반환 ───────────────────────────────────
  const handleRegister = async () => {
    setRegMsg(null)
    if (!regUsername.trim()) return setRegMsg({ text: "아이디를 입력해주세요.", ok: false })
    if (regUsername.length < 2) return setRegMsg({ text: "아이디는 2자 이상이어야 합니다.", ok: false })
    if (!regPw) return setRegMsg({ text: "비밀번호를 입력해주세요.", ok: false })
    if (regPw.length < 4) return setRegMsg({ text: "비밀번호는 4자 이��이어야 합니다.", ok: false })
    if (regPw !== regConfirmPw) return setRegMsg({ text: "비밀번호가 일치하지 않습니다.", ok: false })

    setRegLoading(true)
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: regUsername, password: regPw }),
      })
      const data = await res.json()
      setRegLoading(false)

      if (!res.ok) return setRegMsg({ text: data.error ?? "가입 실패", ok: false })

      if (data.needsLogin) {
        setRegMsg({ text: "가입 완료! 로그인해주세요.", ok: true })
        setAuthTab("login")
        return
      }

      // 서버가 발급한 토큰 저장 (localStorage["app_token"] 전용)
      saveToken(data.token)

      setProfile({ username: data.username, role: data.role ?? "user" })
      setIsLoggedIn(true)
      setDropdownOpen(false)
      setRegUsername(""); setRegPw(""); setRegConfirmPw("")

      fetch("/api/user/balance", { headers: { Authorization: `Bearer ${data.token}` } })
        .then(r => r.json()).then(d => setBalance(d.balance ?? 0))
    } catch {
      setRegLoading(false)
      setRegMsg({ text: "네트워크 오류가 발생했습니다.", ok: false })
    }
  }

  // ── 비밀번호 변경 ─────────────────────────────────────────────────
  const handlePwChange = async () => {
    setPwMsg(null)
    if (!newPw) return setPwMsg({ text: "새 비밀번호를 입력해주세요.", ok: false })
    if (newPw.length < 4) return setPwMsg({ text: "비밀번호는 4자 이상이어야 합니다.", ok: false })
    if (newPw !== confirmPw) return setPwMsg({ text: "비밀번호가 일치하지 않습니다.", ok: false })

    setPwLoading(true)
    const token = getToken()
    const res = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
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

  // ── 로그아웃 ─────────────────────────────────────────────────────
  const handleLogout = () => {
    clearToken()
    setIsLoggedIn(false)
    setProfile(null)
    setBalance(0)
    setDropdownOpen(false)
  }

  const handleBranchJoin = async () => {
    setBranchLoading(true)
    setBranchMsg(null)
    const token = getToken()
    if (!token) { setBranchLoading(false); return }
    const res = await fetch("/api/user/branch/join", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ branchCode: branchCodeInput.trim().toUpperCase() }),
    })
    const data = await res.json()
    if (!res.ok) {
      setBranchMsg({ text: data.error ?? "오류가 발생했습니다.", ok: false })
    } else {
      setBranchMsg({ text: `${data.branchName} 지점에 가입됐습니다.`, ok: true })
      setBranchCodeInput("")
      setProfile(prev => prev ? { ...prev, branch_code: branchCodeInput.trim().toUpperCase() } : prev)
    }
    setBranchLoading(false)
  }

  const initials = profile?.username?.slice(0, 2).toUpperCase() ?? "?"

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur">
      <div className="flex h-14 items-center justify-between px-4">
        {/* 좌측 홈 버튼 */}
        <Link
          href="/"
          className="p-2 rounded-lg hover:bg-muted transition-colors"
          aria-label="홈으로 이동"
        >
          <Home className="w-5 h-5 text-green-500" />
        </Link>

        {/* 중앙 잔고 */}
        <button className="flex items-center gap-2 px-4 py-2 bg-primary/10 rounded-full hover:bg-primary/20 transition-colors">
          <Wallet className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-primary">₩ {balance.toLocaleString()}</span>
        </button>

        {/* 우측 프로필 */}
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

              {isLoggedIn ? (
                <>
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

                  {/* 지점코드 입력 (일반회원만) */}
                  {profile?.role === "user" && (
                    <div className="border-b border-border">
                      <button
                        onClick={() => { setShowBranchForm(v => !v); setBranchMsg(null) }}
                        className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted transition-colors"
                      >
                        <div className="flex items-center gap-2 text-sm text-foreground">
                          <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
                          {profile.branch_code ? `지점: ${profile.branch_code}` : "지점코드 입력"}
                        </div>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showBranchForm ? "rotate-180" : ""}`} />
                      </button>
                      {showBranchForm && (
                        <div className="px-4 pb-3 space-y-2">
                          <input
                            type="text"
                            placeholder="지점코드 입력 (예: YS001)"
                            value={branchCodeInput}
                            onChange={e => setBranchCodeInput(e.target.value.toUpperCase())}
                            onKeyDown={e => e.key === "Enter" && handleBranchJoin()}
                            className="w-full h-9 px-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          {branchMsg && <p className={`text-xs ${branchMsg.ok ? "text-primary" : "text-destructive"}`}>{branchMsg.text}</p>}
                          <Button className="w-full h-9 text-sm" onClick={handleBranchJoin} disabled={branchLoading || !branchCodeInput}>
                            {branchLoading ? "처리 중..." : "확인"}
                          </Button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 관리자 패널 */}
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
                <>
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
                          {regLoading ? "가입 중..." : "회원가입"}
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
