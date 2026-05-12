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
import { useGatewayBalance } from "@/hooks/use-gateway"
import { useRouter } from "next/navigation"

const STORAGE_KEY = "app_token"
const PROFILE_KEY = "app_profile"
const ADMIN_ROLES = ["master", "super_admin", "branch_admin", "admin"]

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
  const [kickMsg, setKickMsg] = useState<string | null>(null)

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

  // 유저 계정 생성 요청 (admin 전용)
  const [showCreateUserModal, setShowCreateUserModal] = useState(false)
  const [cuUsername, setCuUsername]   = useState("")
  const [cuPassword, setCuPassword]   = useState("")
  const [cuCount, setCuCount]         = useState("1")
  const [cuMemo, setCuMemo]           = useState("")
  const [cuLoading, setCuLoading]     = useState(false)
  const [cuMsg, setCuMsg]             = useState<{ text: string; ok: boolean } | null>(null)
  const [showCuPw, setShowCuPw]       = useState(false)

  // 비밀번호 변경
  const [showPwForm, setShowPwForm] = useState(false)
  const [newPw, setNewPw] = useState("")
  const [confirmPw, setConfirmPw] = useState("")
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [pwMsg, setPwMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [pwLoading, setPwLoading] = useState(false)

  // ── 초기화 + 사이드바 로그인 이벤트 수신: 토큰으로 프로필 + 잔고 복원 ──────
  useEffect(() => {
    const loadFromToken = () => {
      const token = getToken()
      if (!token) { setIsLoggedIn(false); setProfile(null); setBalance(0); return }

      Promise.all([
        fetch("/api/user/profile", { headers: { Authorization: `Bearer ${token}` } }),
        fetch("/api/user/balance", { headers: { Authorization: `Bearer ${token}` } }),
      ]).then(async ([pr, br]) => {
        if (pr.status === 401) { clearToken(); setIsLoggedIn(false); setProfile(null); return }
        if (pr.ok) {
          const d = await pr.json()
          if (d.profile) {
            const role = d.profile.role
            setProfile({ username: d.profile.username, role, branch_code: d.profile.branch_code ?? null })
            setIsLoggedIn(true)
            // 관리자 계열 역할이고 현재 게임 화면(/)에 있으면 패널로 이동
            if (ADMIN_ROLES.includes(role) && window.location.pathname === "/") {
              router.push("/panel")
              return
            }
          }
        }
        if (br.ok) {
          const d = await br.json()
          setBalance(d.balance ?? 0)
        }
      }).catch(() => {})
    }

    loadFromToken()

    // 사이드바에서 로그인/로그아웃 시 동기화
    window.addEventListener("auth:login", loadFromToken)
    window.addEventListener("auth:logout", loadFromToken)
    return () => {
      window.removeEventListener("auth:login", loadFromToken)
      window.removeEventListener("auth:logout", loadFromToken)
    }
  }, [router])

  // ── 토큰 자동 갱신: 45분마다 /api/auth/refresh 호출 ────────────────────
  // Supabase access_token은 1시간 만료 — 만료 전에 갱신해 세션 유지
  useEffect(() => {
    const REFRESH_INTERVAL = 45 * 60 * 1000  // 45분

    const refresh = async () => {
      const token = getToken()
      if (!token) return
      try {
        const res = await fetch("/api/auth/refresh", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.ok) {
          const d = await res.json()
          if (d.token) {
            saveToken(d.token)
          }
        } else if (res.status === 401) {
          // 진짜 세션 만료 — ���그아웃 처리
          clearToken()
          setIsLoggedIn(false)
          setProfile(null)
          setBalance(0)
          setKickMsg("세션이 만료되었습니다. 다시 로그인해주세요.")
        }
      } catch {}
    }

    const timer = setInterval(refresh, REFRESH_INTERVAL)
    // 페이지 로드 후 1분 뒤 첫 갱신 시도 (초기 로드 직후 불필요한 호출 방지)
    const initial = setTimeout(refresh, 60_000)

    return () => {
      clearInterval(timer)
      clearTimeout(initial)
    }
  }, [isLoggedIn])

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
  // Railway WS 게이트웨이로 balance 구독 — Vercel SSE Function 제거
  useGatewayBalance((bal) => {
    setBalance(bal)
    window.dispatchEvent(new CustomEvent("balance:update", { detail: bal }))
  })

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

      const role = data.role ?? "user"

      // admin 계열은 패널로 이동, 일반 유저는 새로고침
      if (ADMIN_ROLES.includes(role) && role !== "master") {
        router.push("/panel")
        return
      }

      window.location.reload()
      return

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
      window.location.reload()
      return
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

  // ── 로그���웃 ─────────────────────────────────────────────────────
  const handleLogout = () => {
    clearToken()
    window.location.reload()
  }

  // ── 중복 로그인 감지 폴링 (60초마다) ────────────────────────────
  useEffect(() => {
    const check = async () => {
      const token = getToken()
      if (!token) return
      try {
        const res = await fetch("/api/auth/session-check", {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 401) {
          handleLogout()
          alert("다른 기기에서 로그인되어 자동 로그아웃되었습니다.")
        }
      } catch {
        // 네트워크 오류 무시
      }
    }
    const id = setInterval(check, 60_000)
    return () => clearInterval(id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    <>
    {/* 중복 로그인 알림 배너 */}
    {kickMsg && (
      <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between gap-3 bg-red-600 text-white px-4 py-2 text-sm font-medium shadow-lg">
        <span>{kickMsg}</span>
        <button onClick={() => setKickMsg(null)} className="ml-auto shrink-0 rounded p-1 hover:bg-red-700 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    )}
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur">
      <div className="flex h-12 items-center gap-2 px-4">

        {/* 좌측: 홈 버튼 */}
        <Link
          href="/"
          className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center hover:bg-primary/80 transition-colors shrink-0"
          aria-label="홈으로 이동"
        >
          <Home className="w-4 h-4 text-black" />
        </Link>

        {/* 중앙: 잔고 / 비로그인 안내 */}
        <div className="flex-1 flex justify-center">
          {isLoggedIn ? (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary border border-border">
              <Wallet className="w-3.5 h-3.5 text-primary shrink-0" />
              <span className="text-sm font-semibold text-primary tabular-nums">
                ₩{balance.toLocaleString()}
              </span>
            </div>
          ) : (
            <span className="text-[10px] text-muted-foreground/50 select-none">
              환전 또는 출금 기능은 제공되지 않습니다.
            </span>
          )}
        </div>

        {/* 우측: 로그인/아바타 */}
        <div className="flex items-center gap-2 shrink-0" ref={dropdownRef}>
          {isLoggedIn ? (
            <button
              onClick={() => setDropdownOpen(v => !v)}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-secondary transition-colors"
              aria-label="프로필"
            >
              <Avatar className="w-7 h-7">
                <AvatarFallback className="bg-primary text-black text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium text-foreground hidden sm:block">{profile?.username}</span>
              <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => { setAuthTab("login"); setDropdownOpen(true) }}
                className="px-3 py-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                로그인
              </button>
              <button
                onClick={() => { setAuthTab("register"); setDropdownOpen(true) }}
                className="px-3 py-1.5 text-sm font-semibold rounded-lg bg-primary text-black hover:bg-primary/90 transition-colors"
              >
                회원가입
              </button>
            </div>
          )}

          {/* 드롭다운 */}
          {dropdownOpen && (
            <div className="absolute top-12 right-4 w-72 bg-background border border-border rounded-xl shadow-lg overflow-hidden z-50">

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

                  {/* 유저 계정 생성 요청 (지점 전용) */}
                  {profile?.role === "admin" && (
                    <button
                      onClick={() => { setDropdownOpen(false); setShowCreateUserModal(true); setCuMsg(null) }}
                      className="flex items-center gap-2 w-full px-4 py-3 text-sm text-foreground hover:bg-muted/50 transition-colors border-b border-border"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      유저 계정 생성
                    </button>
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

                  {/* 토큰 입금 */}
                  {profile?.role === "user" && (
                    <Link
                      href="/deposit"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2 w-full px-4 py-3 text-sm text-foreground hover:bg-muted transition-colors border-t border-border"
                    >
                      <Wallet className="w-3.5 h-3.5 text-primary" />
                      <span>CHIPS 입금</span>
                      <span className="ml-auto text-[10px] text-primary font-semibold bg-primary/10 px-1.5 py-0.5 rounded">충전</span>
                    </Link>
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
                            className="w-full h-9 pl-8 pr-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/60"
                          />
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input type={showLoginPw ? "text" : "password"} placeholder="비밀번호"
                            value={loginPw} onChange={e => setLoginPw(e.target.value)}
                            onKeyDown={e => e.key === "Enter" && handleLogin()}
                            className="w-full h-9 pl-8 pr-9 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/60"
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
                            className="w-full h-9 pl-8 pr-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/60"
                          />
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input type={showRegPw ? "text" : "password"} placeholder="비밀번호"
                            value={regPw} onChange={e => setRegPw(e.target.value)}
                            className="w-full h-9 pl-8 pr-9 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/60"
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
                            className="w-full h-9 pl-8 pr-9 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/60"
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

    {/* ── 유저 계��� 생성 요청 모달 (admin 전용) ── */}
    {showCreateUserModal && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
        {/* 백드롭 */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowCreateUserModal(false)} />
        <div className="relative bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm p-6 space-y-4">
          {/* 헤더 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-primary" />
              <h2 className="text-base font-semibold text-foreground">유저 계정 생성 요청</h2>
            </div>
            <button onClick={() => setShowCreateUserModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            총판에게 요청이 전달되며, 승인 후 계정이 생성됩니다.<br />
            수량이 2 이상이면 ID 뒤에 번호가 자동으로 붙습니다. (예: user01, user02)
          </p>

          <div className="space-y-3">
            {/* ID */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">ID (아이디)</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text" placeholder="생성할 ID 입력"
                  value={cuUsername} onChange={e => setCuUsername(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/60"
                />
              </div>
            </div>

            {/* 비밀번호 */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">초기 비밀번호</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type={showCuPw ? "text" : "password"} placeholder="초기 비밀번호"
                  value={cuPassword} onChange={e => setCuPassword(e.target.value)}
                  className="w-full h-9 pl-9 pr-9 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/60"
                />
                <button type="button" onClick={() => setShowCuPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                  {showCuPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            {/* 수량 */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">수량</label>
              <input
                type="number" min="1" max="100" placeholder="1"
                value={cuCount} onChange={e => setCuCount(e.target.value)}
                className="w-full h-9 px-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>

            {/* 메모 */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">메모 (선택)</label>
              <textarea
                placeholder="총판에게 전달할 메모"
                value={cuMemo} onChange={e => setCuMemo(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/60 resize-none"
              />
            </div>
          </div>

          {cuMsg && (
            <p className={`text-xs ${cuMsg.ok ? "text-primary" : "text-destructive"}`}>{cuMsg.text}</p>
          )}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 h-9" onClick={() => setShowCreateUserModal(false)}>취소</Button>
            <Button
              className="flex-1 h-9"
              disabled={cuLoading}
              onClick={async () => {
                if (!cuUsername.trim() || !cuPassword.trim()) {
                  setCuMsg({ text: "ID와 비밀번호를 입력하세요.", ok: false }); return
                }
                setCuLoading(true); setCuMsg(null)
                const token = getToken()
                const res = await fetch("/api/admin/user-account-requests", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                  body: JSON.stringify({ username: cuUsername, password: cuPassword, count: parseInt(cuCount) || 1, memo: cuMemo }),
                })
                const d = await res.json()
                if (res.ok) {
                  setCuMsg({ text: "요청이 총판에게 전달되었습니다.", ok: true })
                  setCuUsername(""); setCuPassword(""); setCuCount("1"); setCuMemo("")
                } else {
                  setCuMsg({ text: d.error ?? "오류가 발생했습니다.", ok: false })
                }
                setCuLoading(false)
              }}
            >
              {cuLoading ? "요청 중..." : "요청 보내기"}
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
