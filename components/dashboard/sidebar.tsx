"use client"

import {
  ExternalLink,
  LogOut,
  LogIn,
  UserPlus,
  X,
  User,
  Lock,
  Eye,
  EyeOff,
  Zap,
  TrendingUp,
  Dice6,
  ChevronLeft,
  ChevronRight,
  BarChart2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import SidebarOrders from "@/components/market/sidebar-orders"

// ─── 모의매매 거래 통계 (소형) ────────────────────────────────────
const DAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"]

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
  const [open, setOpen] = useState(true)

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
    const onLogin = () => fetchAll()
    window.addEventListener("auth:login", onLogin)
    fetchAll()
    return () => window.removeEventListener("auth:login", onLogin)
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

  // 날짜 초기화 전 렌더링 방지
  if (viewYear === 0) return null

  const { firstDay, daysInMonth } = getMonthDays(viewYear, viewMonth)
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const UP   = "#00e676"
  const DOWN = "#ff3d57"
  const GOLD = "#d4af37"

  return (
    <div className="space-y-2 px-1">
      {/* 헤더 */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-1.5">
          <BarChart2 className="w-3 h-3 text-primary shrink-0" />
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">매매 통계</span>
        </div>
        <ChevronRight className={cn("w-3 h-3 text-muted-foreground transition-transform", open && "rotate-90")} />
      </button>

      {open && (
        <div className="space-y-2">
          {/* 요약 4칸 */}
          <div className="grid grid-cols-2 gap-1">
            {[
              { label: "총 매매", value: `${totalCount}회` },
              { label: "총 수익", value: `${totalPnl >= 0 ? "+" : ""}${Math.floor(totalPnl).toLocaleString("ko-KR")}`, color: totalPnl >= 0 ? UP : DOWN },
              { label: "수익률", value: `${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(1)}%`, color: totalPnlPct >= 0 ? UP : DOWN },
              { label: "승률(일)", value: `${winDayPct.toFixed(0)}%`, color: winDayPct >= 50 ? UP : DOWN },
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
              <span className="text-[10px] font-semibold text-foreground">{viewYear}년 {viewMonth + 1}월</span>
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
              {DAY_LABELS.map((d, i) => (
                <div key={d} className="text-[8px] font-medium" style={{ color: i === 0 ? DOWN : i === 6 ? "#4a9eff" : "var(--muted-foreground)" }}>{d}</div>
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
                <span className="text-[9px] text-muted-foreground">매매 횟수</span>
                <span className="text-[10px] font-bold text-foreground">{selectedStat.count}회</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[9px] text-muted-foreground">당일 손익</span>
                <span className="text-[10px] font-bold tabular-nums" style={{ color: selectedStat.pnl >= 0 ? UP : DOWN }}>
                  {selectedStat.pnl >= 0 ? "+" : ""}{Math.floor(selectedStat.pnl).toLocaleString("ko-KR")}원
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[9px] text-muted-foreground">당일 수익률</span>
                <span className="text-[10px] font-bold tabular-nums" style={{ color: selectedPnlPct >= 0 ? UP : DOWN }}>
                  {selectedPnlPct >= 0 ? "+" : ""}{selectedPnlPct.toFixed(2)}%
                </span>
              </div>
            </div>
          )}
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

const features = [
  { icon: Zap, title: "오늘의 비트", desc: "비트코인으로 할 수 있는 다양한 일을 합니다. 현금거래는 지원하지 않습니다." },
]

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [username, setUsername] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

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
    const check = () => {
      const token = getToken()
      setIsLoggedIn(!!token)
      if (token) {
        try { setUsername(localStorage.getItem("app_profile") ? JSON.parse(localStorage.getItem("app_profile")!).username : null) } catch {}
      } else {
        setUsername(null)
      }
    }
    check()
    window.addEventListener("storage", check)
    window.addEventListener("auth:login", check)
    return () => { window.removeEventListener("storage", check); window.removeEventListener("auth:login", check) }
  }, [])

  const handleLogin = async () => {
    setLoginMsg(null)
    if (!loginId.trim()) return setLoginMsg({ text: "아이디를 입력해주세요.", ok: false })
    if (!loginPw)        return setLoginMsg({ text: "비밀번호를 입력해주세요.", ok: false })
    setLoginLoading(true)
    try {
      const res  = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: loginId, password: loginPw }) })
      const data = await res.json()
      setLoginLoading(false)
      if (!res.ok) return setLoginMsg({ text: data.error ?? "로그인 실패", ok: false })
      saveToken(data.token)
      try { localStorage.setItem("app_profile", JSON.stringify({ username: data.username, role: data.role })) } catch {}
      setIsLoggedIn(true); setUsername(data.username)
      setLoginId(""); setLoginPw("")
      window.dispatchEvent(new Event("auth:login"))
      window.dispatchEvent(new StorageEvent("storage"))
    } catch { setLoginLoading(false); setLoginMsg({ text: "네트워크 오류", ok: false }) }
  }

  const handleRegister = async () => {
    setRegMsg(null)
    if (!regId.trim())          return setRegMsg({ text: "아이디를 입력해주세요.", ok: false })
    if (regId.length < 2)       return setRegMsg({ text: "아이디는 2자 이상이어야 합니다.", ok: false })
    if (!regPw)                 return setRegMsg({ text: "비밀번호를 입력해주세요.", ok: false })
    if (regPw.length < 4)       return setRegMsg({ text: "비밀번호는 4자 이상이어야 합니다.", ok: false })
    if (regPw !== regConfirm)   return setRegMsg({ text: "비밀번호가 일치하지 않습니다.", ok: false })
    setRegLoading(true)
    try {
      const res  = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: regId, password: regPw }) })
      const data = await res.json()
      setRegLoading(false)
      if (!res.ok) return setRegMsg({ text: data.error ?? "가입 실패", ok: false })
      if (data.needsLogin) { setRegMsg({ text: "가입 완료! 로그인해주세요.", ok: true }); setAuthTab("login"); return }
      saveToken(data.token)
      try { localStorage.setItem("app_profile", JSON.stringify({ username: data.username, role: data.role })) } catch {}
      setIsLoggedIn(true); setUsername(data.username)
      setRegId(""); setRegPw(""); setRegConfirm("")
      window.dispatchEvent(new Event("auth:login"))
      window.dispatchEvent(new StorageEvent("storage"))
    } catch { setRegLoading(false); setRegMsg({ text: "네트워크 오류", ok: false }) }
  }

  const handleLogout = () => {
    clearToken()
    try { localStorage.removeItem("app_profile") } catch {}
    setIsLoggedIn(false); setUsername(null)
    router.push("/")
    window.dispatchEvent(new Event("auth:logout"))
    window.dispatchEvent(new StorageEvent("storage"))
  }

  return (
    <>
      {mobileOpen && <div className="fixed inset-0 bg-black/50 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />}

      <aside className={cn(
        "fixed top-0 left-0 w-64 bg-card border-r border-border h-screen z-40 transition-transform duration-300 flex flex-col",
        "hidden lg:flex",
        mobileOpen && "flex -translate-x-0",
        !mobileOpen && "lg:flex -translate-x-full lg:translate-x-0"
      )}>
        {/* 로��� 헤더 */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-border shrink-0">
          <Link href="/" className="flex items-center gap-2 group" onClick={() => setMobileOpen(false)}>
            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center transition-transform group-hover:scale-110 duration-300 relative shrink-0">
              <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground absolute" style={{ top: "30%", left: "30%" }} />
              <div className="w-1.5 h-1.5 rounded-full bg-primary-foreground absolute" style={{ top: "30%", right: "30%" }} />
              <div className="w-3 h-1.5 border-b-2 border-primary-foreground rounded-full absolute bottom-2.5" />
            </div>
            <span className="text-lg font-semibold text-foreground">BitBet</span>
          </Link>
        </div>

        {/* 스크롤 영역 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0">

          {/* ① 게임 카드 */}
          <div className="space-y-2.5">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">게임</p>
            <div className="grid grid-cols-2 gap-2">
              {/* 마켓 */}
              <Link href="/market" onClick={() => setMobileOpen(false)}>
                <div className={cn(
                  "rounded-2xl border border-border p-3 flex flex-col gap-1.5 cursor-pointer transition-all duration-200 hover:bg-secondary/60 hover:border-primary/30 h-full",
                  (pathname === "/market" || pathname === "/") && "border-primary/50 bg-secondary/40"
                )}>
                  <p className="text-[11px] font-bold text-foreground leading-tight">마켓</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">아이템 거래소</p>
                  <p className="text-[9px] text-muted-foreground/60 tabular-nums mt-auto">준비중</p>
                </div>
              </Link>
              {/* 모의 매매 */}
              <Link href="/trade" onClick={() => setMobileOpen(false)}>
                <div className={cn(
                  "rounded-2xl border border-border p-3 flex flex-col gap-1.5 cursor-pointer transition-all duration-200 hover:bg-secondary/60 hover:border-primary/30 h-full",
                  pathname === "/trade" && "border-primary/50 bg-secondary/40"
                )}>
                  <p className="text-[11px] font-bold text-foreground leading-tight">모의 매매</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">비트코인 모의 투자</p>
                  <p className="text-[9px] text-muted-foreground/60 tabular-nums mt-auto">준비중</p>
                </div>
              </Link>
              {/* 바카라 */}
              <Link href="/baka" onClick={() => setMobileOpen(false)}>
                <div className={cn(
                  "rounded-2xl border border-border p-3 flex flex-col gap-1.5 cursor-pointer transition-all duration-200 hover:bg-secondary/60 hover:border-primary/30 h-full",
                  pathname === "/baka" && "border-primary/50 bg-secondary/40"
                )}>
                  <p className="text-[11px] font-bold text-foreground leading-tight">바카라</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">비트코인 30초 바카라</p>
                  <p className="text-[9px] text-muted-foreground/60 tabular-nums mt-auto">#{Math.floor(Date.now() / 1000 / 30).toLocaleString()} R</p>
                </div>
              </Link>
              {/* 차트차트 */}
              <Link href="/race" onClick={() => setMobileOpen(false)}>
                <div className={cn(
                  "rounded-2xl border border-border p-3 flex flex-col gap-1.5 cursor-pointer transition-all duration-200 hover:bg-secondary/60 hover:border-primary/30 h-full",
                  pathname === "/race" && "border-primary/50 bg-secondary/40"
                )}>
                  <p className="text-[11px] font-bold text-foreground leading-tight">차트차트</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">비트코인 3분 레이스</p>
                  <p className="text-[9px] text-muted-foreground/60 tabular-nums mt-auto">#{Math.floor(Date.now() / 1000 / 180).toLocaleString()} R</p>
                </div>
              </Link>
            </div>
          </div>

          {/* ③ 모의매매 거래 통계 */}
          <div className="border-t border-border pt-3">
            <TradeStatsMini />
          </div>

          {/* ④ 오늘의 비트 */}
          <div className="space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">오늘의 비트</p>
            {features.map((f) => (
              <div key={f.title} className="rounded-xl border border-border p-3 flex items-start gap-3">
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <f.icon className="w-3.5 h-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{f.title}</p>
                  <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* ⑤ 내 구매현황 */}
          <div className="border-t border-border pt-3">
            <SidebarOrders />
          </div>

          {/* ⑥ 외부 링크 */}
          <div className="shrink-0">
            <p className="text-[10px] font-medium text-muted-foreground mb-2 uppercase tracking-wider">외부링크</p>
            <Link
              href="https://www.binance.com/en/trade/BTC_USDT?type=spot"
              target="_blank" rel="noopener noreferrer"
              className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground transition-all duration-200"
            >
              <ExternalLink className="w-4 h-4 shrink-0" />
              <span className="text-sm">바이낸스</span>
              <ExternalLink className="w-3 h-3 ml-auto opacity-40" />
            </Link>
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
