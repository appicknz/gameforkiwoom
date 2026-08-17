"use client"

/**
 * TopBar - Supabase 클라이언트 SDK 완전 미사용
 * - 로그인/가입: 서버 API 호출 → 서버에서 토큰 발급 → localStorage 저장
 * - GoTrueClient 인스턴스 0개 → lock 경합 없음
 * - 잔고: balance:update 커스텀 이벤트로 betting-game과 동기화
 */

import { Home, X, Wallet, User, Lock, Eye, EyeOff, ChevronDown, LogOut, UserPlus, LogIn, Shield, GitBranch, Send, CheckCircle2, Loader2 } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useState, useEffect, useRef } from "react"
import { useGatewayBalance } from "@/hooks/use-gateway"
import LangSwitcher from "@/components/lang-switcher"
import { useTranslation } from "@/lib/i18n"
import { useRouter } from "next/navigation"
import { TopupModal } from "@/components/dashboard/topup-modal"
import { useTelegram } from "@/hooks/use-telegram"

const STORAGE_KEY = "app_token"
const PROFILE_KEY = "app_profile"
const ADMIN_ROLES = ["master", "super_admin", "branch_admin", "admin"]

interface Profile {
  username: string
  role: string
  branch_code?: string | null
  telegram_id?: string | null
  telegram_username?: string | null
}

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
  const { t } = useTranslation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [balance, setBalance]     = useState(0)
  const [topupOpen, setTopupOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [telegramLinking, setTelegramLinking] = useState(false)
  const [telegramLinkMsg, setTelegramLinkMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const telegramPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const [authTab, setAuthTab] = useState<"login" | "register">("login")
  const [kickMsg, setKickMsg] = useState<string | null>(null)

  // 텔레그램 미니앱
  const { tgUser, initData } = useTelegram()
  const isTelegramEnv = !!(tgUser || initData)
  const [tgLoginLoading, setTgLoginLoading] = useState(false)
  const [tgLoginMsg, setTgLoginMsg] = useState<string | null>(null)

  // 미니앱(텔레그램 앱 안) 전용: initData 기반 즉시 로그인
  const handleMiniAppTelegramLogin = async () => {
    setTgLoginLoading(true)
    setTgLoginMsg(null)
    try {
      const res = await fetch("/api/auth/telegram-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData }),
      })
      const data = await res.json()
      if (!res.ok) {
        setTgLoginMsg(data.error ?? "로그인에 실패했습니다.")
        setTgLoginLoading(false)
        return
      }
      saveToken(data.token)
      window.location.reload()
    } catch {
      setTgLoginMsg("네트워크 오류가 발생했습니다.")
      setTgLoginLoading(false)
    }
  }

  // 로그인 폼 — 비제어 입력으로 TopBar 전체의 키 입력별 재렌더링 방지
  const loginUsernameRef = useRef<HTMLInputElement>(null)
  const loginPwRef = useRef<HTMLInputElement>(null)
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
  const [showPwForm, setShowPwForm]         = useState(false)
  const [currentPw, setCurrentPw]           = useState("")
  const [showCurrent, setShowCurrent]       = useState(false)
  const [currentPwVerified, setCurrentPwVerified] = useState(false)
  const [currentPwLoading, setCurrentPwLoading]   = useState(false)
  const [newPw, setNewPw]                   = useState("")
  const [confirmPw, setConfirmPw]           = useState("")
  const [showNew, setShowNew]               = useState(false)
  const [showConfirm, setShowConfirm]       = useState(false)
  const [pwMsg, setPwMsg]                   = useState<{ text: string; ok: boolean } | null>(null)
  const [pwLoading, setPwLoading]           = useState(false)

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
            setProfile({
              username: d.profile.username,
              role,
              branch_code: d.profile.branch_code ?? null,
              telegram_id: d.profile.telegram_id ?? null,
              telegram_username: d.profile.telegram_username ?? null,
            })
            setIsLoggedIn(true)
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
  }, [])

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
          // 진짜 세��� 만료 — ���그아웃 처리
          clearToken()
          setIsLoggedIn(false)
          setProfile(null)
          setBalance(0)
          setKickMsg(t("auth.sessionExpired"))
        }
      } catch {}
    }

    const timer = setInterval(refresh, REFRESH_INTERVAL)
    // 페이지 로드 후 1분 뒤 첫 갱신 시도 (초기 로드 직후 불필요����� 호출 방지)
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

  // ── 외부 ��릭 닫�� ──────────────────────────────────────────────
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
    const username = loginUsernameRef.current?.value.trim() ?? ""
    const password = loginPwRef.current?.value ?? ""
    if (!username) return setLoginMsg({ text: t("auth.errorUsernameRequired"), ok: false })
    if (!password) return setLoginMsg({ text: t("auth.errorPasswordRequired"), ok: false })

    setLoginLoading(true)
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      setLoginLoading(false)

      if (!res.ok) return setLoginMsg({ text: data.error ?? t("auth.errorLoginFailed"), ok: false })

      // 서버가 발급한 토큰 저장 (localStorage["app_token"] 전용)
      saveToken(data.token)

      window.location.reload()
      return

      // 잔고 로드
      fetch("/api/user/balance", { headers: { Authorization: `Bearer ${data.token}` } })
        .then(r => r.json()).then(d => setBalance(d.balance ?? 0))
    } catch {
      setLoginLoading(false)
      setLoginMsg({ text: t("auth.errorNetwork"), ok: false })
    }
  }

  // ── 가입: 서버 API가 토큰 반환 ───────────────────────────────────
  const handleRegister = async () => {
    setRegMsg(null)
    if (!regUsername.trim()) return setRegMsg({ text: t("auth.errorUsernameRequired"), ok: false })
    if (regUsername.length < 2) return setRegMsg({ text: t("auth.errorUsernameTooShort"), ok: false })
    if (!regPw) return setRegMsg({ text: t("auth.errorPasswordRequired"), ok: false })
    if (regPw.length < 4) return setRegMsg({ text: t("auth.errorPasswordTooShort"), ok: false })
    if (regPw !== regConfirmPw) return setRegMsg({ text: t("auth.errorPasswordMismatch"), ok: false })

    setRegLoading(true)
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: regUsername, password: regPw }),
      })
      const data = await res.json()
      setRegLoading(false)

      if (!res.ok) return setRegMsg({ text: data.error ?? t("auth.errorRegisterFailed"), ok: false })

      if (data.needsLogin) {
        setRegMsg({ text: t("auth.registerSuccess"), ok: true })
        setAuthTab("login")
        return
      }

      // 서버가 발급한 토큰 저장 (localStorage["app_token"] 전용)
      saveToken(data.token)
      window.location.reload()
      return
    } catch {
      setRegLoading(false)
      setRegMsg({ text: t("auth.errorNetwork"), ok: false })
    }
  }

  // ── 비밀번호 변경 ─────────────────────────────────────────────────
  // 1단계: 현재 비밀번호 확인
  const handleVerifyCurrentPw = async () => {
    setPwMsg(null)
    if (!currentPw) return setPwMsg({ text: "현재 비밀번호를 입력해주세요.", ok: false })
    setCurrentPwLoading(true)
    const token = getToken()
    const res = await fetch("/api/auth/verify-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ password: currentPw }),
    })
    setCurrentPwLoading(false)
    if (res.ok) {
      setCurrentPwVerified(true)
      setPwMsg(null)
    } else {
      const d = await res.json()
      setPwMsg({ text: d.error ?? "현재 비밀번호가 일치하지 않습니다.", ok: false })
    }
  }

  // 2단계: 새 비밀번호 변경
  const handlePwChange = async () => {
    setPwMsg(null)
    if (!newPw) return setPwMsg({ text: t("auth.errorPasswordRequired"), ok: false })
    if (newPw.length < 4) return setPwMsg({ text: t("auth.errorPasswordTooShort"), ok: false })
    if (newPw === currentPw) return setPwMsg({ text: "현재 비밀번호와 다른 비밀번호를 입력해주세요.", ok: false })
    if (newPw !== confirmPw) return setPwMsg({ text: t("auth.errorPasswordMismatch"), ok: false })

    setPwLoading(true)
    const token = getToken()
    const res = await fetch("/api/user/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
    })
    const d = await res.json()
    setPwLoading(false)

    if (res.ok) {
      setPwMsg({ text: t("auth.changePasswordSuccess"), ok: true })
      setCurrentPw(""); setNewPw(""); setConfirmPw("")
      setCurrentPwVerified(false); setShowPwForm(false)
    } else {
      setPwMsg({ text: d.error ?? t("common.error"), ok: false })
    }
  }

  const stopTelegramPolling = () => {
    if (telegramPollRef.current) {
      clearInterval(telegramPollRef.current)
      telegramPollRef.current = null
    }
  }

  const handleTelegramLink = async () => {
    const token = getToken()
    if (!token) return

    setTelegramLinking(true)
    setTelegramLinkMsg(null)
    stopTelegramPolling()

    try {
      const response = await fetch("/api/user/telegram-link", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await response.json()
      if (!response.ok) {
        setTelegramLinkMsg({ text: data.error ?? "연동 링크를 만들 수 없습니다.", ok: false })
        setTelegramLinking(false)
        return
      }
      if (data.linked) {
        setProfile((current) => current ? {
          ...current,
          telegram_id: current.telegram_id ?? "linked",
          telegram_username: data.telegramUsername ?? null,
        } : current)
        setTelegramLinkMsg({ text: "이미 Telegram과 연동되어 있습니다.", ok: true })
        setTelegramLinking(false)
        return
      }

      const opened = window.open(data.url, "_blank", "noopener,noreferrer")
      if (!opened) window.location.href = data.url
      setTelegramLinkMsg({ text: "Telegram에서 시작 버튼을 눌러 연동을 완료해 주세요.", ok: true })

      let attempts = 0
      telegramPollRef.current = setInterval(async () => {
        attempts += 1
        try {
          const statusResponse = await fetch("/api/user/telegram-link", {
            headers: { Authorization: `Bearer ${token}` },
          })
          const status = await statusResponse.json()
          if (statusResponse.ok && status.linked) {
            stopTelegramPolling()
            setProfile((current) => current ? {
              ...current,
              telegram_id: "linked",
              telegram_username: status.telegramUsername ?? null,
            } : current)
            setTelegramLinkMsg({ text: "Telegram 연동이 완료되었습니다.", ok: true })
            setTelegramLinking(false)
          } else if (attempts >= 150) {
            stopTelegramPolling()
            setTelegramLinkMsg({ text: "연동 시간이 만료되었습니다. 다시 시도해 주세요.", ok: false })
            setTelegramLinking(false)
          }
        } catch {
          if (attempts >= 150) {
            stopTelegramPolling()
            setTelegramLinkMsg({ text: "연동 상태를 확인할 수 없습니다.", ok: false })
            setTelegramLinking(false)
          }
        }
      }, 2000)
    } catch {
      setTelegramLinkMsg({ text: "네트워크 오류가 발생했습니다.", ok: false })
      setTelegramLinking(false)
    }
  }

  useEffect(() => () => stopTelegramPolling(), [])

  // ── 로그아웃 ─────────────────────────────────────────────────────
  const handleLogout = () => {
    clearToken()
    window.location.reload()
  }

  // ── 중복 로그인 감지 폴링 (60초마다) ────────���───────────────────
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
        // ���트��크 오류 무시
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
      setBranchMsg({ text: data.error ?? "오류가 발생��습니다.", ok: false })
    } else {
      setBranchMsg({ text: t("topbar.branchJoined").replace("{name}", data.branchName) as string, ok: true })
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

        {/* 중앙: 잔고 */}
        <div className="flex-1 flex justify-center">
          <button
            onClick={() => isLoggedIn && setTopupOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary border border-border hover:border-primary/60 hover:bg-primary/5 transition-all"
          >
            <Wallet className="w-3.5 h-3.5 text-primary shrink-0" />
            <span className="text-sm font-semibold text-primary tabular-nums">
              {isLoggedIn ? `₩${balance.toLocaleString()}` : "₩0"}
            </span>
          </button>
        </div>

        {/* 우측: 로그인 버튼 또는 아바타 */}
        <div className="flex items-center gap-2 shrink-0" ref={dropdownRef}>
          {isLoggedIn ? (
            <button
              onClick={() => setDropdownOpen(v => !v)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-secondary transition-colors"
              aria-label="프로필"
            >
              <Avatar className="w-7 h-7">
                <AvatarFallback className="bg-primary text-black text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${dropdownOpen ? "rotate-180" : ""}`} />
            </button>
          ) : (
            <button
              onClick={() => { setAuthTab("login"); setLoginMsg(null); setTgLoginMsg(null); setDropdownOpen(true) }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold rounded-lg text-white hover:opacity-90 transition-opacity active:scale-95"
              style={{ background: "#229ED9" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
              </svg>
              {t("auth.login")}
            </button>
          )}

          {/* 드롭다운 */}
          {dropdownOpen && (
            <div className="absolute top-12 right-4 w-72 bg-background border border-border rounded-xl shadow-lg overflow-hidden z-50">

              {isLoggedIn ? (
                <>
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-xs text-muted-foreground mb-1">{t("auth.username")}</p>
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg">
                      <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium text-foreground">{profile?.username ?? "-"}</span>
                    </div>
                  </div>

                  <div className="border-b border-border px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {profile?.telegram_id
                          ? <CheckCircle2 className="size-4" aria-hidden="true" />
                          : <Send className="size-4" aria-hidden="true" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">Telegram</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {profile?.telegram_id
                            ? profile.telegram_username ? `@${profile.telegram_username} 연동됨` : "연동 완료"
                            : "배팅 알림과 계정 확인에 사용됩니다."}
                        </p>
                      </div>
                      {!profile?.telegram_id && (
                        <button
                          type="button"
                          onClick={handleTelegramLink}
                          disabled={telegramLinking}
                          className="flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity disabled:opacity-60"
                        >
                          {telegramLinking && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
                          {telegramLinking ? "연동 중" : "연동하기"}
                        </button>
                      )}
                    </div>
                    {telegramLinkMsg && (
                      <p className={`mt-2 text-xs ${telegramLinkMsg.ok ? "text-primary" : "text-destructive"}`} role="status">
                        {telegramLinkMsg.text}
                      </p>
                    )}
                  </div>

                  {/* 비밀번호 변경 */}
                  <div className="border-b border-border">
                    <button
                      onClick={() => { setShowPwForm(v => !v); setPwMsg(null); setCurrentPw(""); setNewPw(""); setConfirmPw(""); setCurrentPwVerified(false) }}
                      className="flex items-center justify-between w-full px-4 py-3 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-2 text-sm text-foreground">
                        <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                        {t("auth.changePassword")}
                      </div>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showPwForm ? "rotate-180" : ""}`} />
                    </button>

                    {showPwForm && (
                      <div className="px-4 pb-3 space-y-2">
                        {/* 1단계: 현재 비밀번호 확인 */}
                        {!currentPwVerified ? (
                          <>
                            <div className="relative">
                              <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                              <input
                                type={showCurrent ? "text" : "password"}
                                placeholder="현재 비밀번호"
                                value={currentPw}
                                onChange={e => setCurrentPw(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleVerifyCurrentPw()}
                                className="w-full h-9 pl-8 pr-9 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                              />
                              <button type="button" onClick={() => setShowCurrent(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                                {showCurrent ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                            {pwMsg && <p className={`text-xs ${pwMsg.ok ? "text-primary" : "text-destructive"}`}>{pwMsg.text}</p>}
                            <Button className="w-full h-9 text-sm" onClick={handleVerifyCurrentPw} disabled={currentPwLoading}>
                              {currentPwLoading ? "확인 중..." : "확인"}
                            </Button>
                          </>
                        ) : (
                          /* 2단계: 새 비밀번호 입력 */
                          <>
                            <div className="relative">
                              <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                              <input
                                type={showNew ? "text" : "password"}
                                placeholder={t("auth.newPasswordPlaceholder")}
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
                                placeholder={t("auth.confirmPasswordPlaceholder")}
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
                              {pwLoading ? t("auth.changePasswordLoading") : t("auth.changePasswordSubmit")}
                            </Button>
                          </>
                        )}
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
                          {profile.branch_code ? `${t("topbar.branchLabel")}: ${profile.branch_code}` : t("topbar.branchCode")}
                        </div>
                        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showBranchForm ? "rotate-180" : ""}`} />
                      </button>
                      {showBranchForm && (
                        <div className="px-4 pb-3 space-y-2">
                          <input
                            type="text"
                            placeholder={t("auth.branchCodePlaceholder") as string}
                            value={branchCodeInput}
                            onChange={e => setBranchCodeInput(e.target.value.toUpperCase())}
                            onKeyDown={e => e.key === "Enter" && handleBranchJoin()}
                            className="w-full h-9 px-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          {branchMsg && <p className={`text-xs ${branchMsg.ok ? "text-primary" : "text-destructive"}`}>{branchMsg.text}</p>}
                          <Button className="w-full h-9 text-sm" onClick={handleBranchJoin} disabled={branchLoading || !branchCodeInput}>
                            {branchLoading ? t("auth.branchCodeLoading") : t("auth.branchCodeSubmit")}
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
                      {t("panel.createUserTitle")}
                    </button>
                  )}

                  {/* 관리자 패널 */}
                  {ADMIN_ROLES.includes(profile?.role ?? "") && (
                    <button
                      onClick={() => { setDropdownOpen(false); router.push("/panel") }}
                      className="flex items-center gap-2 w-full px-4 py-3 text-sm text-primary hover:bg-primary/10 transition-colors border-b border-border"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      {t("nav.panel")}
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
                      <span>{t("topbar.chips")}</span>
                      <span className="ml-auto text-[10px] text-primary font-semibold bg-primary/10 px-1.5 py-0.5 rounded">{t("sidebar.charge")}</span>
                    </Link>
                  )}

                  {/* 언어 전환 — 로그아웃 바로 위 */}
                  <div className="border-b border-border px-4 py-2">
                    <LangSwitcher />
                  </div>

                  {/* 로그아웃 */}
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 w-full px-4 py-3 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    {t("auth.logout")}
                  </button>
                </>
              ) : (
                <>
                  <div className="flex border-b border-border">
                    <button
                      onClick={() => { setAuthTab("login"); setLoginMsg(null) }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors ${authTab === "login" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <LogIn className="w-3.5 h-3.5" /> {t("auth.login")}
                    </button>
                    <button
                      onClick={() => { setAuthTab("register"); setRegMsg(null) }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-semibold transition-colors ${authTab === "register" ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      <UserPlus className="w-3.5 h-3.5" /> {t("auth.register")}
                    </button>
                  </div>

                  <div className="px-4 py-3 space-y-2">
                    {authTab === "login" && (
                      <>
                        <div className="relative">
                          <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input
                            ref={loginUsernameRef}
                            type="text"
                            autoComplete="username"
                            placeholder={t("auth.usernamePlaceholder")}
                            className="w-full h-9 pl-8 pr-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/60"
                          />
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input
                            ref={loginPwRef}
                            type={showLoginPw ? "text" : "password"}
                            autoComplete="current-password"
                            placeholder={t("auth.passwordPlaceholder")}
                            onKeyDown={e => {
                              if (!e.nativeEvent.isComposing && e.keyCode !== 229 && e.key === "Enter") handleLogin()
                            }}
                            className="w-full h-9 pl-8 pr-9 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/60"
                          />
                          <button type="button" onClick={() => setShowLoginPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {showLoginPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        {loginMsg && <p className={`text-xs ${loginMsg.ok ? "text-primary" : "text-destructive"}`}>{loginMsg.text}</p>}
                        <Button className="w-full h-9 text-sm" onClick={handleLogin} disabled={loginLoading}>
                          {loginLoading ? t("auth.loginLoading") : t("auth.login")}
                        </Button>
                        <>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-px bg-border" />
                            <span className="text-[10px] text-muted-foreground">또는</span>
                            <div className="flex-1 h-px bg-border" />
                          </div>
                          {isTelegramEnv ? (
                            <button
                              onClick={handleMiniAppTelegramLogin}
                              disabled={tgLoginLoading}
                              className="w-full flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                              style={{ background: "#229ED9" }}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                              </svg>
                              {tgLoginLoading ? "처리 중..." : "텔레그램으로 바로 시작하기"}
                            </button>
                          ) : null}
                          {tgLoginMsg && <p className="text-xs text-destructive text-center">{tgLoginMsg}</p>}
                        </>
                      </>
                    )}

                    {authTab === "register" && (
                      <>
                        <div className="relative">
                          <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input type="text" placeholder={t("auth.usernamePlaceholder")} value={regUsername}
                            onChange={e => setRegUsername(e.target.value)}
                            className="w-full h-9 pl-8 pr-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/60"
                          />
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input type={showRegPw ? "text" : "password"} placeholder={t("auth.passwordPlaceholder")}
                            value={regPw} onChange={e => setRegPw(e.target.value)}
                            className="w-full h-9 pl-8 pr-9 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/60"
                          />
                          <button type="button" onClick={() => setShowRegPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                            {showRegPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                          <input type={showRegConfirm ? "text" : "password"} placeholder={t("auth.confirmPasswordPlaceholder")}
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
                          {regLoading ? t("auth.registerLoading") : t("auth.register")}
                        </Button>
                        <>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-px bg-border" />
                            <span className="text-[10px] text-muted-foreground">또는</span>
                            <div className="flex-1 h-px bg-border" />
                          </div>
                          {isTelegramEnv ? (
                            <button
                              onClick={handleMiniAppTelegramLogin}
                              disabled={tgLoginLoading}
                              className="w-full flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
                              style={{ background: "#229ED9" }}
                            >
                              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                              </svg>
                              {tgLoginLoading ? "처리 중..." : "텔레그램으로 바로 시작하기"}
                            </button>
                          ) : null}
                          {tgLoginMsg && <p className="text-xs text-destructive text-center">{tgLoginMsg}</p>}
                        </>
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
              <h2 className="text-base font-semibold text-foreground">{t("panel.createUserTitle")}</h2>
            </div>
            <button onClick={() => setShowCreateUserModal(false)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t("panel.createUserDesc")}
          </p>

          <div className="space-y-3">
            {/* ID */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">{t("panel.idLabel")}</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text" placeholder={t("panel.idPlaceholder") as string}
                  value={cuUsername} onChange={e => setCuUsername(e.target.value)}
                  className="w-full h-9 pl-9 pr-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/60"
                />
              </div>
            </div>

            {/* 비밀번호 */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">{t("panel.initialPassword")}</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type={showCuPw ? "text" : "password"} placeholder={t("panel.initialPasswordPlaceholder") as string}
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
              <label className="text-xs font-medium text-foreground">{t("panel.quantity")}</label>
              <input
                type="number" min="1" max="100" placeholder="1"
                value={cuCount} onChange={e => setCuCount(e.target.value)}
                className="w-full h-9 px-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
              />
            </div>

            {/* 메모 */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-foreground">{t("panel.memoOptional")}</label>
              <textarea
                placeholder={t("panel.memoPlaceholder") as string}
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
            <Button variant="outline" className="flex-1 h-9" onClick={() => setShowCreateUserModal(false)}>{t("panel.cancel")}</Button>
            <Button
              className="flex-1 h-9"
              disabled={cuLoading}
              onClick={async () => {
                if (!cuUsername.trim() || !cuPassword.trim()) {
                  setCuMsg({ text: t("panel.idPasswordRequired") as string, ok: false }); return
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
                  setCuMsg({ text: d.error ?? "오류��� 발생했습니다.", ok: false })
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

    {/* 충전 모달 */}
    <TopupModal
      open={topupOpen}
      onClose={() => setTopupOpen(false)}
      username={profile?.username}
      telegramId={profile?.telegram_id ?? undefined}
    />
    </>
  )
}
