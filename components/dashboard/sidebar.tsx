"use client"

import {
  LogOut,
  LogIn,
  UserPlus,
  X,
  User,
  Lock,
  Eye,
  EyeOff,
  TrendingUp,
  Dice6,
  ChevronLeft,
  ChevronRight,
  ShoppingCart,
  ShoppingBag,
  BarChart2,
  Wallet,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useState, useEffect, useCallback } from "react"
import { QRCodeSVG } from "qrcode.react"
import { useTranslation } from "@/lib/i18n"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"

// ─── 모의매매 거래 통계 (소형) ────────────────────────────────────

function toKSTDateStr(d: Date) {
  return d.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })
}

function getMonthDays(year: number, month: number) {
  return {
    firstDay: new Date(year, month, 1).getDay(),
    daysInMonth: new Date(year, month + 1, 0).getDate(),
  }
}

interface DayStat { count: number; pnl: number; bet: number }

function TradeStatsMini() {
  // Date는 서버·클라이언트 시각 차이로 hydration mismatch 발생 → useEffect에서 초기화
  const [todayKST, setTodayKST] = useState("")
  const [viewYear, setViewYear]   = useState(0)
  const [viewMonth, setViewMonth] = useState(0)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [byDate, setByDate] = useState<Record<string, DayStat>>({})
  useEffect(() => {
    const kst = toKSTDateStr(new Date())
    setTodayKST(kst)
    setViewYear(parseInt(kst.slice(0, 4)))
    setViewMonth(parseInt(kst.slice(5, 7)) - 1)
  }, [])

  const getToken = () => { try { return localStorage.getItem("app_token") } catch { return null } }

  const fetchAll = useCallback(async () => {
    const token = getToken()
    if (!token) return
    try {
      const res = await fetch("/api/user/trade/history", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) return
      const data = await res.json()
      setByDate(data.byDate ?? {})
    } catch {}
  }, [])

  useEffect(() => {
    const refresh = () => fetchAll()
    window.addEventListener("auth:login", refresh)
    window.addEventListener("trade:refresh", refresh)
    fetchAll()
    return () => {
      window.removeEventListener("auth:login", refresh)
      window.removeEventListener("trade:refresh", refresh)
    }
  }, [fetchAll])

  // 전체 통계 집계
  const allDays = Object.values(byDate)
  const totalCount = allDays.reduce((s, d) => s + d.count, 0)
  const totalPnl   = allDays.reduce((s, d) => s + d.pnl, 0)
  const totalBet   = allDays.reduce((s, d) => s + d.bet, 0)
  const winDays    = allDays.filter(d => d.pnl >= 0).length
  const totalPnlPct = totalBet > 0 ? (totalPnl / totalBet) * 100 : 0
  const winDayPct   = allDays.length > 0 ? (winDays / allDays.length) * 100 : 0

  const selectedStat = selectedDate ? byDate[selectedDate] : null
  const selectedPnlPct = selectedStat && selectedStat.bet > 0
    ? (selectedStat.pnl / selectedStat.bet) * 100 : 0

  // Hook은 조건부 return 전에 반드시 호출해야 함
  const { t } = useTranslation()

  // 날짜 초기화 전 렌더링 방지
  if (viewYear === 0) return null

  const { firstDay, daysInMonth } = getMonthDays(viewYear, viewMonth)
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const UP   = "#00e676"
  const DOWN = "#ff3d57"
  const GOLD = "#d4af37"

  return (
    <div className="space-y-2 px-1">
      {/* 헤더 — /trade 이동 버튼 */}
      <Link href="/trade">
        <div className="w-full rounded-2xl border border-border p-3 flex items-center gap-2.5 hover:bg-secondary/60 hover:border-primary/40 transition-all duration-200 cursor-pointer">
          <div className="w-7 h-7 rounded-lg border border-primary/40 bg-primary/10 flex items-center justify-center shrink-0" style={{ boxShadow: "0 0 8px rgba(var(--primary-rgb, 74,222,128), 0.3)" }}>
            <TrendingUp className="w-3.5 h-3.5 text-primary" />
          </div>
          <div className="flex flex-col gap-0.5 items-start">
            <p className="text-[11px] font-bold text-foreground leading-tight">{t("nav.trade")}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">{t("nav.tradeSub")}</p>
          </div>
        </div>
      </Link>

      <div className="space-y-2">
          {/* 요약 4칸 */}
          <div className="grid grid-cols-2 gap-1">
            {[
              { label: t("stats.totalTrades"), value: `${totalCount}${t("stats.times")}` },
              { label: t("stats.totalPnl"), value: `${totalPnl >= 0 ? "+" : ""}${Math.floor(totalPnl).toLocaleString("ko-KR")}`, color: totalPnl >= 0 ? UP : DOWN },
              { label: t("stats.winRate"), value: `${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(1)}%`, color: totalPnlPct >= 0 ? UP : DOWN },
              { label: t("stats.dailyWinRate"), value: `${winDayPct.toFixed(0)}%`, color: winDayPct >= 50 ? UP : DOWN },
            ].map(({ label, value, color }) => (
              <div key={label} className="rounded-lg border border-border bg-background/40 p-1.5">
                <p className="text-[9px] text-muted-foreground mb-0.5">{label}</p>
                <p className="text-[10px] font-bold tabular-nums" style={{ color: color ?? "var(--foreground)" }}>{value}</p>
              </div>
            ))}
          </div>

          {/* 캘린더 */}
          <div className="rounded-lg border border-border bg-background/40 p-2 space-y-1.5">
            {/* 월 헤더 */}
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-semibold text-foreground">
                {(() => {
                  const months = t("calendar.months")
                  const monthName = Array.isArray(months) ? months[viewMonth] : String(viewMonth + 1)
                  return (t("calendar.yearMonthFormat") as string)
                    .replace("{year}", String(viewYear))
                    .replace("{month}", monthName)
                })()}
              </span>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => {
                    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
                    else setViewMonth(m => m - 1)
                    setSelectedDate(null)
                  }}
                  className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <ChevronLeft className="w-2.5 h-2.5" />
                </button>
                <button
                  onClick={() => {
                    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
                    else setViewMonth(m => m + 1)
                    setSelectedDate(null)
                  }}
                  className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <ChevronRight className="w-2.5 h-2.5" />
                </button>
              </div>
            </div>

            {/* 요일 헤더 */}
            <div className="grid grid-cols-7 text-center">
              {(Array.isArray(t("calendar.days")) ? t("calendar.days") as string[] : ["S","M","T","W","T","F","S"]).map((d: string, i: number) => (
                <div key={i} className="text-[8px] font-medium" style={{ color: i === 0 ? DOWN : i === 6 ? "#4a9eff" : "var(--muted-foreground)" }}>{d}</div>
              ))}
            </div>

            {/* 날짜 격자 */}
            <div className="grid grid-cols-7 gap-px">
              {cells.map((day, idx) => {
                if (!day) return <div key={`e-${idx}`} />
                const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                const stat = byDate[dateStr]
                const isToday = dateStr === todayKST
                const isSel   = dateStr === selectedDate
                const dotColor = stat ? (stat.pnl >= 0 ? UP : DOWN) : null

                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(isSel ? null : dateStr)}
                    className={cn(
                      "relative flex flex-col items-center justify-center h-5 rounded text-[9px] font-medium transition-colors",
                      isToday ? "ring-1 ring-primary text-primary" : "text-foreground hover:bg-secondary",
                      isSel && "bg-primary/15",
                      !stat && "text-muted-foreground/50",
                    )}
                  >
                    {day}
                    {dotColor && (
                      <span className="absolute bottom-0.5 w-1 h-1 rounded-full" style={{ background: dotColor }} />
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* 선택일 상세 */}
          {selectedDate && selectedStat && (
            <div className="rounded-lg border border-border bg-background/40 p-2 space-y-1">
              <p className="text-[9px] text-muted-foreground">{selectedDate}</p>
              <div className="flex justify-between items-center">
                <span className="text-[9px] text-muted-foreground">{t("stats.tradeCount")}</span>
                <span className="text-[10px] font-bold text-foreground">{selectedStat.count}{t("stats.times")}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[9px] text-muted-foreground">{t("stats.dailyPnl")}</span>
                <span className="text-[10px] font-bold tabular-nums" style={{ color: selectedStat.pnl >= 0 ? UP : DOWN }}>
                  {selectedStat.pnl >= 0 ? "+" : ""}{Math.floor(selectedStat.pnl).toLocaleString("ko-KR")}원
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[9px] text-muted-foreground">{t("stats.dailyReturn")}</span>
                <span className="text-[10px] font-bold tabular-nums" style={{ color: selectedPnlPct >= 0 ? UP : DOWN }}>
                  {selectedPnlPct >= 0 ? "+" : ""}{selectedPnlPct.toFixed(2)}%
                </span>
              </div>
            </div>
          )}
        </div>
    </div>
  )
}
// ─── 토큰 입금 QR 위젯 ───────────────────────────────────────────
function DepositQRWidget({ isLoggedIn: _unused }: { isLoggedIn: boolean }) {
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [open, setOpen] = useState(true)
  const { t } = useTranslation()

  // 로그인 후 새로고침으로 진입하므로 마운트 시 한 번만 fetch
  useEffect(() => {
    const token = typeof window !== "undefined" ? localStorage.getItem("app_token") : null
    if (!token) return
    fetch("/api/deposit/wallet", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.walletAddress) setWalletAddress(d.walletAddress) })
      .catch(() => {})
  }, [])

  // walletAddress가 있을 때만 로그인 상태로 간주 — fetch 완료 전엔 블러 유지
  const revealed = !!walletAddress

  return (
    <div className="space-y-2 px-1">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-primary shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v10m0 0-3-3m3 3 3-3"/><rect width="20" height="8" x="2" y="14" rx="2"/>
          </svg>
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{t("deposit.title")}</span>
        </div>
        <ChevronRight className={cn("w-3 h-3 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>

      {open && (
        <div className="rounded-xl border border-border bg-background/40 p-3 flex flex-col items-center gap-2">
          <div className="relative">
            {/* 블러 해제 조건: walletAddress fetch 완료 후 */}
            <div className={cn(
              "p-2 bg-white rounded-lg transition-all duration-300",
              !revealed && "blur-sm pointer-events-none select-none"
            )}>
              <QRCodeSVG
                value={walletAddress ?? "https://placeholder.local"}
                size={112}
                bgColor="#ffffff"
                fgColor="#000000"
              />
            </div>

            {!revealed && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-muted-foreground/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="18" height="11" x="3" y="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                <span className="text-[9px] text-muted-foreground/70 font-medium">{t("deposit.loginRequired")}</span>
              </div>
            )}
          </div>

          {revealed ? (
            <p className="text-[9px] font-mono text-muted-foreground text-center break-all leading-relaxed px-1">
              {walletAddress}
            </p>
          ) : (
            <p className="text-[9px] text-muted-foreground/40 text-center">로그인하면 입금 주소가 표시됩니다</p>
          )}

          <Link
            href="/deposit"
            className="text-[9px] text-primary/70 hover:text-primary underline underline-offset-2 transition-colors"
          >
            자세히 보기
          </Link>
        </div>
      )}
    </div>
  )
}

// import { ChatPanel } from "@/components/dashboard/chat-panel"

const STORAGE_KEY = "app_token"
function saveToken(t: string) { try { localStorage.setItem(STORAGE_KEY, t) } catch {} }
function getToken(): string | null { try { return localStorage.getItem(STORAGE_KEY) } catch { return null } }
function clearToken() { try { localStorage.removeItem(STORAGE_KEY) } catch {} }



const SELLER_ROLES = ["master", "super_admin", "branch_admin", "admin", "seller"]

function getJwtRole(): string | null {
  try {
    const token = localStorage.getItem("app_token")
    if (!token) return null
    return JSON.parse(atob(token.split(".")[1]))?.role ?? null
  } catch { return null }
}

export function Sidebar() {
  const { t } = useTranslation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [sellerRole, setSellerRole] = useState<string | null>(null)
  const [gameEnabled, setGameEnabled] = useState(false)

  // 로그인 폼
  const [authTab, setAuthTab]           = useState<"login" | "register">("login")
  const [loginId, setLoginId]           = useState("")
  const [loginPw, setLoginPw]           = useState("")
  const [showLoginPw, setShowLoginPw]   = useState(false)
  const [loginMsg, setLoginMsg]         = useState<{ text: string; ok: boolean } | null>(null)
  const [loginLoading, setLoginLoading] = useState(false)

  // 가입 폼
  const [regId, setRegId]               = useState("")
  const [regPw, setRegPw]               = useState("")
  const [regConfirm, setRegConfirm]     = useState("")
  const [showRegPw, setShowRegPw]       = useState(false)
  const [showRegConfirm, setShowRegConfirm] = useState(false)
  const [regMsg, setRegMsg]             = useState<{ text: string; ok: boolean } | null>(null)
  const [regLoading, setRegLoading]     = useState(false)

  const pathname = usePathname()
  const router   = useRouter()

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 4000) }

  useEffect(() => {
    const check = async () => {
      const token = getToken()
      setIsLoggedIn(!!token)
      if (token) {
        try { setUsername(localStorage.getItem("app_profile") ? JSON.parse(localStorage.getItem("app_profile")!).username : null) } catch {}
        const role = getJwtRole()
        if (role && SELLER_ROLES.includes(role)) {
          // role 자���가 판매 권한 있음
          setSellerRole(role)
        } else {
          // role이 user여도 write_permission_requests approved면 seller로 간주
          try {
            const res = await fetch("/api/market/write-permission", {
              headers: { Authorization: `Bearer ${token}` },
            })
            const data = await res.json()
            if (data?.request?.status === "approved") {
              setSellerRole("seller")
            } else {
              setSellerRole(role)
            }
          } catch {
            setSellerRole(role)
          }
        }
        // 게임 접근 권한 체크
        try {
          const gRes = await fetch("/api/user/game-access", {
            headers: { Authorization: `Bearer ${token}` },
          })
          const gData = await gRes.json()
          setGameEnabled(!!gData?.hasAccess)
        } catch {
          setGameEnabled(false)
        }
      } else {
        setUsername(null)
        setSellerRole(null)
        setGameEnabled(false)
      }
    }
    check()
    window.addEventListener("storage", check)
    window.addEventListener("auth:login", check)
    return () => { window.removeEventListener("storage", check); window.removeEventListener("auth:login", check) }
  }, [])

  const handleLogin = async () => {
    setLoginMsg(null)
    if (!loginId.trim()) return setLoginMsg({ text: t("auth.errorUsernameRequired"), ok: false })
    if (!loginPw)        return setLoginMsg({ text: t("auth.errorPasswordRequired"), ok: false })
    setLoginLoading(true)
    try {
      const res  = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: loginId, password: loginPw }) })
      const data = await res.json()
      setLoginLoading(false)
      if (!res.ok) return setLoginMsg({ text: data.error ?? t("auth.errorLoginFailed"), ok: false })
      saveToken(data.token)
      try { localStorage.setItem("app_profile", JSON.stringify({ username: data.username, role: data.role })) } catch {}
      setIsLoggedIn(true); setUsername(data.username)
      setLoginId(""); setLoginPw("")
      window.dispatchEvent(new Event("auth:login"))
      window.dispatchEvent(new StorageEvent("storage"))
    } catch { setLoginLoading(false); setLoginMsg({ text: t("auth.errorNetwork"), ok: false }) }
  }

  const handleRegister = async () => {
    setRegMsg(null)
    if (!regId.trim())          return setRegMsg({ text: t("auth.errorUsernameRequired"), ok: false })
    if (regId.length < 2)       return setRegMsg({ text: t("auth.errorUsernameTooShort"), ok: false })
    if (!regPw)                 return setRegMsg({ text: t("auth.errorPasswordRequired"), ok: false })
    if (regPw.length < 4)       return setRegMsg({ text: t("auth.errorPasswordTooShort"), ok: false })
    if (regPw !== regConfirm)   return setRegMsg({ text: t("auth.errorPasswordMismatch"), ok: false })
    setRegLoading(true)
    try {
      const res  = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: regId, password: regPw }) })
      const data = await res.json()
      setRegLoading(false)
      if (!res.ok) return setRegMsg({ text: data.error ?? t("auth.errorRegisterFailed"), ok: false })
      if (data.needsLogin) { setRegMsg({ text: t("auth.registerSuccess"), ok: true }); setAuthTab("login"); return }
      saveToken(data.token)
      try { localStorage.setItem("app_profile", JSON.stringify({ username: data.username, role: data.role })) } catch {}
      setIsLoggedIn(true); setUsername(data.username)
      setRegId(""); setRegPw(""); setRegConfirm("")
      window.dispatchEvent(new Event("auth:login"))
      window.dispatchEvent(new StorageEvent("storage"))
    } catch { setRegLoading(false); setRegMsg({ text: t("auth.errorNetwork"), ok: false }) }
  }

  const handleLogout = () => {
    clearToken()
    try { localStorage.removeItem("app_profile") } catch {}
    window.location.href = "/"
  }

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />}

      <aside className={cn(
        "fixed top-0 left-0 w-64 bg-card border-r border-border h-screen z-40 transition-transform duration-300 flex flex-col",
        mobileOpen
          ? "flex translate-x-0"
          : "-translate-x-full lg:translate-x-0 hidden lg:flex"
      )}>
        {/* 상단 top-bar 높이만큼 여백 */}
        <div className="h-12 border-b border-border shrink-0" />

        {/* 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0">

          {/* ① 보너스 게임 — 접근 권한 있는 유저만 표시 */}
          {gameEnabled && <div className="space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">보너스 게임</p>
            <div className="grid grid-cols-2 gap-2">
              {/* 바카라 */}
              <Link href="/baka" onClick={() => setMobileOpen(false)}>
                <div className={cn(
                  "rounded-2xl border border-border p-3 flex flex-col gap-1.5 cursor-pointer transition-all duration-200 hover:bg-secondary/60 hover:border-primary/30 h-full",
                  pathname === "/baka" && "border-primary/50 bg-secondary/40"
                )}>
                  <p className="text-[11px] font-bold text-foreground leading-tight">{t("nav.baccarat")}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{t("nav.baccaratSub")}</p>
                  <p className="text-[9px] text-muted-foreground/60 tabular-nums mt-auto">#{Math.floor(Date.now() / 1000 / 30).toLocaleString()} R</p>
                </div>
              </Link>
              {/* ��트차트 */}
              <Link href="/race" onClick={() => setMobileOpen(false)}>
                <div className={cn(
                  "rounded-2xl border border-border p-3 flex flex-col gap-1.5 cursor-pointer transition-all duration-200 hover:bg-secondary/60 hover:border-primary/30 h-full",
                  pathname === "/race" && "border-primary/50 bg-secondary/40"
                )}>
                  <p className="text-[11px] font-bold text-foreground leading-tight">{t("nav.race")}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{t("nav.raceSub")}</p>
                  <p className="text-[9px] text-muted-foreground/60 tabular-nums mt-auto">#{Math.floor(Date.now() / 1000 / 180).toLocaleString()} R</p>
                </div>
              </Link>
            </div>
          </div>}

          {/* ② 관리 — 2x2 그리드 */}
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">관리</p>
            <div className="grid grid-cols-2 gap-2">
              {/* 마켓 */}
              <Link href="/market" onClick={() => setMobileOpen(false)}>
                <div className={cn(
                  "rounded-2xl border border-border p-3 flex flex-col gap-1 cursor-pointer transition-all duration-200 hover:bg-secondary/60 hover:border-primary/40 h-full",
                  (pathname === "/market" || pathname === "/") && "border-primary/50 bg-secondary/40"
                )}>
                  <p className="text-[11px] font-bold text-foreground leading-tight flex items-center gap-1">
                    <ShoppingCart className="w-3 h-3 text-primary shrink-0" />
                    {t("nav.market")}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{t("nav.marketSub")}</p>
                </div>
              </Link>
              {/* 구매내역 */}
              <Link href="/purchases" onClick={() => setMobileOpen(false)}>
                <div className={cn(
                  "rounded-2xl border border-border p-3 flex flex-col gap-1 cursor-pointer transition-all duration-200 hover:bg-secondary/60 hover:border-primary/40 h-full",
                  pathname === "/purchases" && "border-primary/50 bg-secondary/40"
                )}>
                  <p className="text-[11px] font-bold text-foreground leading-tight flex items-center gap-1">
                    <ShoppingBag className="w-3 h-3 text-primary shrink-0" />
                    구매내역
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight">내 구매 상품</p>
                </div>
              </Link>
              {/* 판매관리 — seller 이상만 */}
              {isLoggedIn && sellerRole && SELLER_ROLES.includes(sellerRole) ? (
                <Link href="/seller" onClick={() => setMobileOpen(false)}>
                  <div className={cn(
                    "rounded-2xl border border-border p-3 flex flex-col gap-1 cursor-pointer transition-all duration-200 hover:bg-secondary/60 hover:border-primary/40 h-full",
                    pathname === "/seller" && "border-primary/50 bg-secondary/40"
                  )}>
                    <p className="text-[11px] font-bold text-foreground leading-tight flex items-center gap-1">
                      <BarChart2 className="w-3 h-3 text-primary shrink-0" />
                      판매관리
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-tight">내 컨텐츠 통계</p>
                  </div>
                </Link>
              ) : (
                <div className="rounded-2xl border border-border/50 p-3 flex flex-col gap-1 opacity-40 cursor-not-allowed h-full">
                  <p className="text-[11px] font-bold text-foreground leading-tight flex items-center gap-1">
                    <BarChart2 className="w-3 h-3 text-primary shrink-0" />
                    판매관리
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight">셀러 권한 필요</p>
                </div>
              )}
              {/* 정산관리 */}
              <Link href="/settlement" onClick={() => setMobileOpen(false)}>
                <div className={cn(
                  "rounded-2xl border border-border p-3 flex flex-col gap-1 cursor-pointer transition-all duration-200 hover:bg-secondary/60 hover:border-primary/40 h-full",
                  pathname === "/settlement" && "border-primary/50 bg-secondary/40"
                )}>
                  <p className="text-[11px] font-bold text-foreground leading-tight flex items-center gap-1">
                    <Wallet className="w-3 h-3 text-primary shrink-0" />
                    정산관리
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight">수익 정산</p>
                </div>
              </Link>
            </div>
          </div>

          {/* ③ 토큰 입금 QR */}
          <div className="border-t border-border pt-3">
            <DepositQRWidget isLoggedIn={isLoggedIn} />
          </div>

          {/* ④ 모의매매 — 버튼 + 통계 통합 */}
          <div className="border-t border-border pt-3">
            <TradeStatsMini />
          </div>

        </div>
      </aside>

      {/* 채팅 섹션 (비활성화) */}
      {/*
      <ChatPanel />
      */}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-foreground text-background px-5 py-3.5 rounded-xl shadow-2xl text-sm font-medium animate-in slide-in-from-bottom-4 duration-300 max-w-xs w-full">
          <span className="flex-1">{toast}</span>
          <button onClick={() => setToast(null)} className="shrink-0 opacity-60 hover:opacity-100"><X className="w-4 h-4" /></button>
        </div>
      )}
    </>
  )
}
