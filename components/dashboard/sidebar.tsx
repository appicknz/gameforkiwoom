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
import { liveCache } from "@/components/trade/live-prices-tab"

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
interface AutoPos {
  id: string; symbol: string; direction: string
  entry_price: number; size_usd: number; leverage: number; signal_time: string
}

function TradeStatsMini() {
  // Date는 서버·클라이언트 시각 차이로 hydration mismatch 발생 → useEffect에서 초기화
  const [todayKST, setTodayKST] = useState("")
  const [viewYear, setViewYear]   = useState(0)
  const [viewMonth, setViewMonth] = useState(0)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [byDate, setByDate] = useState<Record<string, DayStat>>({})
  // 자동매매 포지션 (오늘치)
  const [autoPositions, setAutoPositions] = useState<AutoPos[]>([])
  const [, setTick] = useState(0) // 1초 tick — liveCache 가격 재계산용

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

  // 자동매매 — 선택 날짜 or 오늘 fetch
  const fetchAutoForDate = useCallback(async (date: string) => {
    try {
      const res = await fetch(`/api/auto-signal/positions?date=${date}`)
      if (!res.ok) return
      const data = await res.json()
      setAutoPositions(data.positions ?? [])
    } catch {}
  }, [])

  const fetchAutoToday = useCallback(() => {
    fetchAutoForDate(toKSTDateStr(new Date()))
  }, [fetchAutoForDate])

  useEffect(() => {
    const refresh = () => { fetchAll(); fetchAutoToday() }
    window.addEventListener("auth:login", refresh)
    window.addEventListener("trade:refresh", refresh)
    fetchAll()
    // autoToday 초기 fetch는 selectedDate effect에서 처리됨
    const tickInterval = setInterval(() => setTick(n => n + 1), 1000)
    return () => {
      window.removeEventListener("auth:login", refresh)
      window.removeEventListener("trade:refresh", refresh)
      clearInterval(tickInterval)
    }
  }, [fetchAll, fetchAutoToday])

  // 달력에서 날짜 선택 시 해당 날짜 자동매매 포지션 fetch
  // 선택 없음(오늘) → 30초 실시간 갱신 / 과거 날짜 선택 → 1회 fetch 후 interval 없음
  useEffect(() => {
    if (selectedDate) {
      // 과거 날짜: 1회만 fetch
      fetchAutoForDate(selectedDate)
      return
    }
    // 오늘(선택 없음): 즉시 fetch + 30초 interval
    fetchAutoToday()
    const id = setInterval(fetchAutoToday, 30_000)
    return () => clearInterval(id)
  }, [selectedDate, fetchAutoForDate, fetchAutoToday])

  // 달력 dot 표시용 집계만 유지 (모의매매 전체 합계 통계 제거)
  const allDays = Object.values(byDate)

  // 자동매매 실시간 통계 — liveCache에서 현재가 읽기
  const normalize = (raw: string) => raw.replace(/\.P$/, "").replace(/\//g, "")
  const autoCalc = autoPositions.map(pos => {
    const sym    = normalize(pos.symbol)
    const cur    = liveCache.tickers.get(sym)?.price ?? 0
    const entry  = Number(pos.entry_price)
    const hasCur = cur > 0 && entry > 0
    const delta  = hasCur ? (pos.direction === "long" ? (cur - entry) / entry : (entry - cur) / entry) : 0
    const roi = delta * pos.leverage * 100
    const pnl = pos.size_usd * delta * pos.leverage
    return { ...pos, cur, hasCur, roi, pnl }
  })
  const autoTotalPnl  = autoCalc.reduce((s, p) => s + p.pnl, 0)
  const autoTotalRoi  = autoCalc.length > 0 ? autoCalc.reduce((s, p) => s + p.roi, 0) / autoCalc.length : 0
  const autoProfit    = autoCalc.filter(p => p.roi > 0).length
  const autoLoss      = autoCalc.filter(p => p.roi <= 0 && p.hasCur).length

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
    <div className="space-y-3">
      {/* 오늘의 비트 — 헤더 + 스탯 통합 카드 */}
      {(() => {
        const isDateSelected = !!selectedDate
        const autoCount  = autoCalc.length
        const autoPnl$   = autoTotalPnl
        const autoRoi    = autoTotalRoi
        const autoWinPct = autoCount > 0 ? (autoProfit / autoCount) * 100 : 0

        const boxes = [
          { label: "총 포지션",  value: `${autoCount}건`,                                              color: undefined },
          { label: "총 손익($)", value: `${autoPnl$ >= 0 ? "+" : ""}$${autoPnl$.toFixed(2)}`,         color: autoPnl$ >= 0 ? UP : DOWN },
          { label: "평균 ROI",   value: `${autoRoi >= 0 ? "+" : ""}${autoRoi.toFixed(2)}%`,            color: autoRoi >= 0 ? UP : DOWN },
          { label: "수익 비율",  value: `${autoWinPct.toFixed(0)}%`,                                   color: autoWinPct >= 50 ? UP : DOWN },
        ]

        return (
          <Link href="/trade">
            <div className="w-full rounded-2xl border border-border bg-background/40 overflow-hidden hover:border-primary/40 transition-all duration-200 cursor-pointer">
              {/* 상단 헤더 */}
              <div className="flex items-center justify-between px-3 pt-3 pb-2.5">
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 rounded-lg border border-primary/40 bg-primary/10 flex items-center justify-center shrink-0"
                    style={{ boxShadow: "0 0 8px rgba(74,222,128,0.25)" }}
                  >
                    <TrendingUp className="w-3 h-3 text-primary" />
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-foreground leading-tight tracking-tight">오늘의 비트</p>
                    <p className="text-[9px] text-muted-foreground leading-tight mt-0.5">
                      {isDateSelected
                        ? `자동매매 시그널 · ${parseInt(selectedDate!.slice(5,7))}월 ${parseInt(selectedDate!.slice(8,10))}일`
                        : "자동매매 시그널 · 오늘 (실시간)"}
                    </p>
                  </div>
                </div>
                {/* 수익 / 손실 카운트 */}
                <div className="flex items-center gap-1 bg-secondary/60 rounded-lg px-2 py-1">
                  <span className="text-[9px] font-bold tabular-nums" style={{ color: UP }}>+{autoProfit}</span>
                  <span className="text-[8px] text-muted-foreground">/</span>
                  <span className="text-[9px] font-bold tabular-nums" style={{ color: DOWN }}>{autoLoss}</span>
                </div>
              </div>
              {/* 구분선 */}
              <div className="mx-3 border-t border-border/60" />
              {/* 2×2 스탯 그리드 */}
              <div className="grid grid-cols-2">
                {boxes.map(({ label, value, color }, i) => (
                  <div
                    key={String(label)}
                    className={cn(
                      "px-3 py-2.5",
                      i % 2 === 0 ? "border-r border-border/60" : "",
                      i < 2       ? "border-b border-border/60" : "",
                    )}
                  >
                    <p className="text-[8px] text-muted-foreground mb-0.5 uppercase tracking-wide">{label}</p>
                    <p className="text-[10px] font-bold tabular-nums" style={{ color: color ?? "var(--foreground)" }}>{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </Link>
        )
      })()}

          {/* 캘린더 */}
          <div className="rounded-lg border border-border bg-background/40 p-2 space-y-1.5">
            {/* 월 헤더 */}
            <div className="flex items-center justify-between">
              {/* 선택된 날짜 있으면 선택 날짜 표시, 없으면 현재 뷰 월 표시 */}
              <span className="text-[10px] font-semibold text-foreground">
                {selectedDate
                  ? (() => {
                      const m = parseInt(selectedDate.slice(5, 7))
                      const d = parseInt(selectedDate.slice(8, 10))
                      return `${m}월 ${d}일`
                    })()
                  : `${viewYear}년 ${viewMonth + 1}월`}
              </span>
              <div className="flex items-center gap-0.5">
                {/* 오늘 버튼 */}
                <button
                  onClick={() => {
                    const kst = toKSTDateStr(new Date())
                    setViewYear(parseInt(kst.slice(0, 4)))
                    setViewMonth(parseInt(kst.slice(5, 7)) - 1)
                    setSelectedDate(null)
                  }}
                  className="px-1.5 h-4 text-[8px] font-semibold rounded border border-primary/40 text-primary hover:bg-primary/10 transition-colors mr-1"
                >
                  오늘
                </button>
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
                // 자동매매 dot: 선택된 날짜이고 포지션이 있으면 표시 (오늘도 포함)
                const showAutoDot = (isSel || isToday) && autoPositions.length > 0

                return (
                  <button
                    key={dateStr}
                    onClick={() => setSelectedDate(isSel ? null : dateStr)}
                    className={cn(
                      "relative flex flex-col items-center justify-center h-5 rounded text-[9px] font-medium transition-colors",
                      isToday && !isSel  ? "ring-1 ring-primary text-primary" : "",
                      isSel              ? "ring-1 ring-primary bg-primary/20 text-primary font-bold" : "hover:bg-secondary",
                      !isSel && !isToday && !stat ? "text-muted-foreground/50" : "",
                      !isSel && !isToday &&  stat ? "text-foreground" : "",
                    )}
                  >
                    {day}
                    <span className="absolute bottom-0.5 flex items-center gap-px">
                      {dotColor && <span className="w-1 h-1 rounded-full" style={{ background: dotColor }} />}
                    </span>
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
  )
}
// ─── 토큰 입금 QR 위젯 ────────────────────────────���──────────────
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
            <p className="text-[9px] text-muted-foreground/40 text-center">{t("sidebar.loginToViewAddress")}</p>
          )}

          <Link
            href="/deposit"
            className="text-[9px] text-primary/70 hover:text-primary underline underline-offset-2 transition-colors"
          >
            {t("deposit.detail")}
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
  const [allowTokenDeposit, setAllowTokenDeposit] = useState(false)

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
        // 토큰 입금 허용 여부
        try {
          const pRes = await fetch("/api/user/profile", {
            headers: { Authorization: `Bearer ${token}` },
          })
          const pData = await pRes.json()
          setAllowTokenDeposit(!!pData?.profile?.allow_token_deposit)
        } catch {
          setAllowTokenDeposit(false)
        }
      } else {
        setUsername(null)
        setSellerRole(null)
        setGameEnabled(false)
        setAllowTokenDeposit(false)
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
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("sidebar.bonusGames")}</p>
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
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">{t("sidebar.manage")}</p>
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
                    {t("nav.purchases")}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{t("nav.purchasesSub")}</p>
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
                      {t("nav.seller")}
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-tight">{t("nav.sellerSub")}</p>
                  </div>
                </Link>
              ) : (
                <div className="rounded-2xl border border-border/50 p-3 flex flex-col gap-1 opacity-40 cursor-not-allowed h-full">
                  <p className="text-[11px] font-bold text-foreground leading-tight flex items-center gap-1">
                    <BarChart2 className="w-3 h-3 text-primary shrink-0" />
                    {t("nav.seller")}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{t("sidebar.sellerRequired")}</p>
                </div>
              )}
              {/* 정산관리 — seller 이상만 */}
              {isLoggedIn && sellerRole && SELLER_ROLES.includes(sellerRole) ? (
                <Link href="/settlement" onClick={() => setMobileOpen(false)}>
                  <div className={cn(
                    "rounded-2xl border border-border p-3 flex flex-col gap-1 cursor-pointer transition-all duration-200 hover:bg-secondary/60 hover:border-primary/40 h-full",
                    pathname === "/settlement" && "border-primary/50 bg-secondary/40"
                  )}>
                    <p className="text-[11px] font-bold text-foreground leading-tight flex items-center gap-1">
                      <Wallet className="w-3 h-3 text-primary shrink-0" />
                      {t("nav.settlementNav")}
                    </p>
                    <p className="text-[10px] text-muted-foreground leading-tight">{t("nav.settlementSub")}</p>
                  </div>
                </Link>
              ) : (
                <div className="rounded-2xl border border-border/50 p-3 flex flex-col gap-1 opacity-40 cursor-not-allowed h-full">
                  <p className="text-[11px] font-bold text-foreground leading-tight flex items-center gap-1">
                    <Wallet className="w-3 h-3 text-primary shrink-0" />
                    {t("nav.settlementNav")}
                  </p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{t("sidebar.sellerRequired")}</p>
                </div>
              )}
            </div>
          </div>

          {/* ③ 오늘의 비트 + 달력 + 토큰 입금 — 마스터가 허용한 회원만 */}
          {isLoggedIn && allowTokenDeposit && (
            <>
              <div className="border-t border-border pt-3">
                <TradeStatsMini />
              </div>
              <div className="border-t border-border pt-3">
                <DepositQRWidget isLoggedIn={isLoggedIn} />
              </div>
            </>
          )}

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
