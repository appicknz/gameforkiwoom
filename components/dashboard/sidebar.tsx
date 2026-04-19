"use client"

import {
  ExternalLink,
  LogOut,
  LogIn,
  UserPlus,
  X,
  ArrowRight,
  User,
  Lock,
  Eye,
  EyeOff,
  Zap,
  TrendingUp,
  Dice6,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
// import { ChatPanel } from "@/components/dashboard/chat-panel"

const STORAGE_KEY = "app_token"
function saveToken(t: string) { try { localStorage.setItem(STORAGE_KEY, t) } catch {} }
function getToken(): string | null { try { return localStorage.getItem(STORAGE_KEY) } catch { return null } }
function clearToken() { try { localStorage.removeItem(STORAGE_KEY) } catch {} }

const features = [
  { icon: Zap,        title: "즉시 거래",      desc: "하루 평균 20조원 규모 거래소의 101% 실시간 가격" },
  { icon: TrendingUp, title: "투명한 결과",     desc: "블록체인 기반 공정한 결과 판정" },
  { icon: Dice6,      title: "낮은 하우스 엣지", desc: "업계 최고의 배팅 배당률 제공" },
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
        {/* 로고 헤더 */}
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

          {/* ① 로그인 폼 / 로그인된 경우 사용자 정보 */}
          {isLoggedIn ? (
            <div className="rounded-xl border border-border p-4 space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
                  <span className="text-[10px] font-bold text-primary">{(username ?? "U").slice(0, 2).toUpperCase()}</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">{username}</p>
                  <p className="text-[10px] text-muted-foreground">로그인됨</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors border border-destructive/20"
              >
                <LogOut className="w-3.5 h-3.5" /> 로그아웃
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-border overflow-hidden">
              {/* 탭 */}
              <div className="flex border-b border-border">
                <button
                  onClick={() => { setAuthTab("login"); setLoginMsg(null) }}
                  className={cn("flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors",
                    authTab === "login" ? "text-primary border-b-2 border-primary bg-primary/5" : "text-muted-foreground hover:text-foreground")}
                >
                  <LogIn className="w-3.5 h-3.5" /> 로그인
                </button>
                <button
                  onClick={() => { setAuthTab("register"); setRegMsg(null) }}
                  className={cn("flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors",
                    authTab === "register" ? "text-primary border-b-2 border-primary bg-primary/5" : "text-muted-foreground hover:text-foreground")}
                >
                  <UserPlus className="w-3.5 h-3.5" /> 회원가입
                </button>
              </div>

              {/* 폼 영역 */}
              <div className="p-3 space-y-2">
                {authTab === "login" ? (
                  <>
                    <div className="relative">
                      <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <input type="text" placeholder="아이디" value={loginId} onChange={e => setLoginId(e.target.value)}
                        className="w-full h-9 pl-8 pr-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <input type={showLoginPw ? "text" : "password"} placeholder="비밀번호" value={loginPw}
                        onChange={e => setLoginPw(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()}
                        className="w-full h-9 pl-8 pr-9 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
                      <button type="button" onClick={() => setShowLoginPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showLoginPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    {loginMsg && <p className={cn("text-xs", loginMsg.ok ? "text-primary" : "text-destructive")}>{loginMsg.text}</p>}
                    <Button className="w-full h-9 text-sm" onClick={handleLogin} disabled={loginLoading}>
                      {loginLoading ? "로그인 중..." : "로그인"}
                    </Button>
                  </>
                ) : (
                  <>
                    <div className="relative">
                      <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <input type="text" placeholder="아이디" value={regId} onChange={e => setRegId(e.target.value)}
                        className="w-full h-9 pl-8 pr-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <input type={showRegPw ? "text" : "password"} placeholder="비밀번호" value={regPw} onChange={e => setRegPw(e.target.value)}
                        className="w-full h-9 pl-8 pr-9 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
                      <button type="button" onClick={() => setShowRegPw(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showRegPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                      <input type={showRegConfirm ? "text" : "password"} placeholder="비밀번호 확인" value={regConfirm}
                        onChange={e => setRegConfirm(e.target.value)} onKeyDown={e => e.key === "Enter" && handleRegister()}
                        className="w-full h-9 pl-8 pr-9 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary" />
                      <button type="button" onClick={() => setShowRegConfirm(v => !v)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showRegConfirm ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    {regMsg && <p className={cn("text-xs", regMsg.ok ? "text-primary" : "text-destructive")}>{regMsg.text}</p>}
                    <Button className="w-full h-9 text-sm" onClick={handleRegister} disabled={regLoading}>
                      {regLoading ? "가입 중..." : "회원가입"}
                    </Button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ② 게임 카드 */}
          <div className="space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">게임</p>
            <Link href="/baka" onClick={() => setMobileOpen(false)}>
              <div className={cn(
                "rounded-xl border border-border p-3.5 flex items-center justify-between cursor-pointer transition-all duration-200 hover:bg-secondary/60",
                pathname === "/baka" && "border-primary/50 bg-secondary/40"
              )}>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-semibold text-foreground">바카라</p>
                  <p className="text-[11px] text-muted-foreground">비트코인 30초 바카라</p>
                  <p className="text-[10px] text-muted-foreground/60 tabular-nums mt-0.5">#{Math.floor(Date.now() / 1000 / 30).toLocaleString()} 라운드</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
            <Link href="/race" onClick={() => setMobileOpen(false)}>
              <div className={cn(
                "rounded-xl border border-border p-3.5 flex items-center justify-between cursor-pointer transition-all duration-200 hover:bg-secondary/60",
                pathname === "/race" && "border-primary/50 bg-secondary/40"
              )}>
                <div className="flex flex-col gap-0.5">
                  <p className="text-sm font-semibold text-foreground">차트차트</p>
                  <p className="text-[11px] text-muted-foreground">비트코인 5분 레이스</p>
                  <p className="text-[10px] text-muted-foreground/60 tabular-nums mt-0.5">#{Math.floor(Date.now() / 1000 / 300).toLocaleString()} 라운드</p>
                </div>
                <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
          </div>

          {/* ③ 왜 우리를 선택할까요 */}
          <div className="space-y-2">
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">서비스 특징</p>
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

          {/* ④ 외부 링크 (가장 아래) */}
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
