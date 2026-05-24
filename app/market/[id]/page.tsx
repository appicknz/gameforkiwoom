"use client"

import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import Link from "next/link"
import { blobImageUrl } from "@/lib/blob-image"
import {
  ArrowLeft, ExternalLink, ShoppingCart, Eye, Users,
  Loader2, XCircle, Clock, LogIn, UserPlus, ChevronRight,
} from "lucide-react"

interface Item {
  id: string; title: string; description: string
  image_url: string | null; link_url: string | null
  price_krw: number; stripe_price_id: string | null
  view_count: number; order_count: number; created_at: string
  market_categories: { name: string; icon: string } | null
  profiles: { id: string; username: string; role: string } | null
}

type AuthMode = "idle" | "login" | "register"

function getToken() {
  try { return localStorage.getItem("app_token") } catch { return null }
}
function setToken(t: string) {
  try { localStorage.setItem("app_token", t) } catch {}
}

export default function MarketItemPage() {
  const { id } = useParams<{ id: string }>()

  const [item, setItem]         = useState<Item | null>(null)
  const [loading, setLoading]   = useState(true)
  const [buying, setBuying]     = useState(false)
  const [buyErr, setBuyErr]     = useState("")
  const [isLoggedIn, setLoggedIn] = useState(false)

  // 인증 폼 상태
  const [authMode, setAuthMode]   = useState<AuthMode>("idle")
  const [username, setUsername]   = useState("")
  const [password, setPassword]   = useState("")
  const [authLoading, setAuthLoading] = useState(false)
  const [authErr, setAuthErr]     = useState("")

  useEffect(() => {
    const loggedIn = !!getToken()
    setLoggedIn(loggedIn)
    fetch(`/api/market/items/${id}`)
      .then(r => r.json())
      .then(d => setItem(d.item ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  // 로그인
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true); setAuthErr("")
    try {
      const res  = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) { setAuthErr(data.error ?? "로그인 실패"); return }
      setToken(data.token)
      setLoggedIn(true)
      setAuthMode("idle")
    } catch { setAuthErr("네트워크 오류") }
    finally { setAuthLoading(false) }
  }

  // 회원가입
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthLoading(true); setAuthErr("")
    try {
      const res  = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (!res.ok) { setAuthErr(data.error ?? "회원가입 실패"); return }
      if (data.token) {
        setToken(data.token)
        setLoggedIn(true)
        setAuthMode("idle")
      } else {
        // needsLogin: true 케이스 → 자동으로 로그인 시도
        setAuthMode("login")
        setAuthErr("가입 완료! 로그인해주세요.")
      }
    } catch { setAuthErr("네트워크 오류") }
    finally { setAuthLoading(false) }
  }

  // 결제
  const handleBuy = async () => {
    if (!isLoggedIn) { setAuthMode("login"); return }
    setBuying(true); setBuyErr("")
    try {
      const res  = await fetch("/api/market/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ itemId: id }),
      })
      const data = await res.json()
      if (!res.ok) { setBuyErr(data.error ?? "오류가 발생했습니다."); return }
      window.location.href = data.url
    } catch { setBuyErr("결제 오류가 발생했습니다.") }
    finally { setBuying(false) }
  }

  /* ── 로딩 ── */
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }

  /* ── 상품 없음 ── */
  if (!item) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">상품을 찾을 수 없습니다.</p>
        <Link href="/market" className="text-primary text-sm hover:underline">마켓으로 돌아가기</Link>
      </div>
    )
  }

  /* ── 인증 폼 렌더 ── */
  const isRegister = authMode === "register"
  const showAuth   = authMode !== "idle"

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* 뒤로가기 */}
        <Link
          href="/market"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> 마켓으로
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* 이미지 */}
          <div className="rounded-2xl overflow-hidden border border-border bg-secondary/20 aspect-square">
            {item.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={blobImageUrl(item.image_url)!}
                alt={item.title}
                loading="eager"
                decoding="async"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-6xl">
                {item.market_categories?.icon ?? "📦"}
              </div>
            )}
          </div>

          {/* 정보 */}
          <div className="space-y-5">
            {/* 카테고리 + 발행자 */}
            <div className="flex items-center gap-2 flex-wrap">
              {item.market_categories && (
                <span className="px-2 py-1 rounded-md bg-secondary text-xs text-muted-foreground">
                  {item.market_categories.icon} {item.market_categories.name}
                </span>
              )}
              {item.profiles && (
                <span className="text-xs text-muted-foreground">
                  by <span className="text-foreground font-medium">{item.profiles.username}</span>
                </span>
              )}
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground leading-snug">{item.title}</h1>
              <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-wrap">{item.description}</p>
            </div>

            {/* 통계 */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" />{item.view_count.toLocaleString()} 조회</span>
              <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{item.order_count.toLocaleString()} 구매</span>
            </div>

            {/* 외부 링크 */}
            {item.link_url && (
              <a
                href={item.link_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" /> 관련 링크
              </a>
            )}

            {/* 가격 + 구매 영역 */}
            <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-primary">
                  {item.price_krw.toLocaleString("ko-KR")}
                </span>
                <span className="text-lg text-primary">원</span>
              </div>

              {/* ── 비로그인: 인증 폼 ── */}
              {!isLoggedIn && (
                <div className="space-y-3">
                  {!showAuth ? (
                    /* 로그인 / 회원가입 선택 버튼 */
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setAuthMode("login"); setAuthErr("") }}
                        className="flex-1 py-2.5 rounded-xl border border-border bg-secondary/60 text-sm font-medium text-foreground hover:border-primary/40 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <LogIn className="w-4 h-4" /> 로그인 후 구매
                      </button>
                      <button
                        onClick={() => { setAuthMode("register"); setAuthErr("") }}
                        className="flex-1 py-2.5 rounded-xl border border-border bg-secondary/60 text-sm font-medium text-foreground hover:border-primary/40 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <UserPlus className="w-4 h-4" /> 회원가입
                      </button>
                    </div>
                  ) : (
                    /* 인증 폼 */
                    <form onSubmit={isRegister ? handleRegister : handleLogin} className="space-y-2">
                      {/* 탭 전환 */}
                      <div className="flex rounded-lg overflow-hidden border border-border text-xs font-medium mb-3">
                        <button
                          type="button"
                          onClick={() => { setAuthMode("login"); setAuthErr("") }}
                          className={`flex-1 py-2 transition-colors ${!isRegister ? "bg-primary text-black" : "bg-secondary/60 text-muted-foreground hover:text-foreground"}`}
                        >
                          로그인
                        </button>
                        <button
                          type="button"
                          onClick={() => { setAuthMode("register"); setAuthErr("") }}
                          className={`flex-1 py-2 transition-colors ${isRegister ? "bg-primary text-black" : "bg-secondary/60 text-muted-foreground hover:text-foreground"}`}
                        >
                          회원가입
                        </button>
                      </div>

                      <input
                        type="text"
                        placeholder="아이디"
                        value={username}
                        onChange={e => setUsername(e.target.value)}
                        required
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                      />
                      <input
                        type="password"
                        placeholder={isRegister ? "비밀번호 (4자 이상)" : "비밀번호"}
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        required
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/60 transition-colors"
                      />

                      {authErr && (
                        <p className="text-xs text-red-400 flex items-center gap-1">
                          <XCircle className="w-3.5 h-3.5 shrink-0" />{authErr}
                        </p>
                      )}

                      <button
                        type="submit"
                        disabled={authLoading}
                        className="w-full py-2.5 rounded-xl bg-primary text-black font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                      >
                        {authLoading
                          ? <Loader2 className="w-4 h-4 animate-spin" />
                          : <><ChevronRight className="w-4 h-4" />{isRegister ? "가입 후 구매" : "로그인 후 구매"}</>
                        }
                      </button>

                      <button
                        type="button"
                        onClick={() => { setAuthMode("idle"); setAuthErr("") }}
                        className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                      >
                        취소
                      </button>
                    </form>
                  )}
                </div>
              )}

              {/* ── 로그인: 구매 버튼 ── */}
              {isLoggedIn && (
                <>
                  {buyErr && (
                    <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
                      <XCircle className="w-3.5 h-3.5 shrink-0" />{buyErr}
                    </div>
                  )}
                  <button
                    onClick={handleBuy}
                    disabled={buying || !item.stripe_price_id}
                    className="w-full py-3 rounded-xl bg-primary text-black font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {buying
                      ? <><Loader2 className="w-4 h-4 animate-spin" /> 결제 준비 중...</>
                      : <><ShoppingCart className="w-4 h-4" /> 구매하기</>
                    }
                  </button>
                </>
              )}

              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <Clock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>결제 후 발행자 승인이 완료되면 구매가 확정됩니다.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
