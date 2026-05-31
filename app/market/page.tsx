"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Search, TrendingUp, ArrowUpDown, Clock, Flame, Plus, X, Edit2, ShoppingCart, Loader2, Download, PenLine, AlertCircle, ExternalLink, Lock, CheckCircle2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { blobImageUrl } from "@/lib/blob-image"
import MarketAdminPanel, { type EditItem } from "@/components/market/market-admin-panel"
import DepositDialog from "@/components/deposit-dialog"
import { useTranslation } from "@/lib/i18n"

interface Category { id: string; name: string; icon: string; balance_only?: boolean }
interface Item {
  id: string; title: string; description: string
  image_url: string | null; link_url: string | null; price_krw: number
  view_count: number; order_count: number; game_bonus_rate: number; created_at: string
  category_id: string | null
  content_type: string
  data_source_type: string | null
  market_categories: { name: string; icon: string; balance_only: boolean } | null
  profiles: { username: string; role: string } | null
}

const SORT_CYCLE = [
  { key: "popular",    tKey: "market.sortPopular",   icon: Flame },
  { key: "newest",     tKey: "market.sortNewest",    icon: Clock },
  { key: "price_asc",  tKey: "market.sortPriceLow",  icon: ArrowUpDown },
  { key: "price_desc", tKey: "market.sortPriceHigh", icon: TrendingUp },
] as const

// 글쓰기(상품 등록) 권한 역할
const WRITE_ROLES = ["master", "super_admin", "branch_admin", "admin", "seller"]

function getToken() {
  try { return localStorage.getItem("app_token") } catch { return null }
}
function parseJwt() {
  try {
    const t = localStorage.getItem("app_token")
    if (!t) return null
    return JSON.parse(atob(t.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")))
  } catch { return null }
}

export default function MarketPage() {
  const { t } = useTranslation()
  const [categories, setCategories]   = useState<Category[]>([])
  const [items, setItems]             = useState<Item[]>([])
  const [activeCat, setActiveCat]     = useState<string>("all")
  const [sortIdx, setSortIdx]         = useState<number>(0)
  const sort = SORT_CYCLE[sortIdx].key
  const [q, setQ]                     = useState("")
  const [loading, setLoading]         = useState(true)
  const [showAdmin, setShowAdmin]     = useState(false)
  const [editItem, setEditItem]       = useState<EditItem | null>(null)
  const [role, setRole]               = useState<string | null>(null)
  const [userId, setUserId]           = useState<string | null>(null)
  const [selectedItem, setSelectedItem] = useState<Item | null>(null)
  const [buying, setBuying]           = useState(false)
  const [buyErr, setBuyErr]           = useState("")
  const [tvId, setTvId]               = useState("")
  const [userBalance, setUserBalance] = useState<number | null>(null)
  const [balanceMemo, setBalanceMemo] = useState("")
  // 글쓰기 권한 신청 상태: null=미조회, 'none'=신청없음, 'pending'=대기중, 'approved'=승인됨, 'rejected'=거절됨
  const [writePermStatus, setWritePermStatus]         = useState<string | null>(null)
  const [allowPointCategory, setAllowPointCategory]   = useState(false)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [showDeposit, setShowDeposit]         = useState(false)
  const [allowTokenDeposit, setAllowTokenDeposit] = useState(false)
  const [hasPurchased, setHasPurchased]       = useState(false)
  const [purchasedIds, setPurchasedIds]       = useState<Set<string>>(new Set())
  const [showPurchasedOnly, setShowPurchasedOnly] = useState(false)
  const [usePoint, setUsePoint]               = useState(false)
  const debounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fetchItemsRef                 = useRef<(() => void) | null>(null)

  useEffect(() => {
    const jwt = parseJwt()
    setRole(jwt?.role ?? null)
    setUserId(jwt?.sub ?? jwt?.userId ?? null)
  }, [])

  // 글쓰기 권한 + 프로필(토큰입금 허용 여부) 로드
  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetch("/api/market/write-permission", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        setWritePermStatus(d?.request?.status ?? "none")
        setAllowPointCategory(d?.request?.allow_point_category ?? false)
      })
      .catch(() => setWritePermStatus("none"))
    fetch("/api/user/profile", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setAllowTokenDeposit(!!d?.profile?.allow_token_deposit))
      .catch(() => {})
    // 구매한 아이템 ID 목록 로드
    fetch("/api/market/orders?status=paid", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const ids = new Set<string>((d?.orders ?? []).map((o: any) => o.item_id as string))
        setPurchasedIds(ids)
      })
      .catch(() => {})
  }, [])

  const handleFreePurchase = useCallback(async () => {
    if (!selectedItem) return
    const token = getToken()
    if (!token) { setBuyErr(t("auth.loginRequired")); return }
    setBuying(true); setBuyErr("")
    try {
      const res  = await fetch("/api/market/free-purchase", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ itemId: selectedItem.id }),
      })
      const data = await res.json()
      if (!res.ok) { setBuyErr(data.error ?? t("common.error")); return }
      // 즉시 링크 활성화
      setHasPurchased(true)
      setPurchasedIds(prev => new Set([...prev, selectedItem.id]))
      fetchItemsRef.current?.()
    } catch {
      setBuyErr(t("common.error"))
    } finally {
      setBuying(false)
    }
  }, [selectedItem])

  const handleBuy = useCallback(async () => {
    if (!selectedItem) return
    const token = getToken()
    if (!token) { setBuyErr(t("auth.loginRequired")); return }
    // 포인트 사용 시 차감 후 잔액 계산
    const pointAmt  = usePoint ? Math.min(userBalance ?? 0, selectedItem.price_krw) : 0
    const remaining = selectedItem.price_krw - pointAmt
    // 0원이면 즉시 처리 (0원 상품 or 포인트로 전액 커버)
    if (remaining === 0) { await handleFreePurchase(); return }
    setBuying(true); setBuyErr("")
    try {
      const res  = await fetch("/api/market/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ itemId: selectedItem.id, tvId: tvId.trim(), pointAmount: pointAmt }),
      })
      const data = await res.json()
      if (!res.ok) { setBuyErr(data.error ?? t("common.error")); return }
      window.location.href = data.url
    } catch {
      setBuyErr(t("common.error"))
    } finally {
      setBuying(false)
    }
  }, [selectedItem, handleFreePurchase, usePoint, userBalance])

  const handleBalanceBuy = useCallback(async () => {
    if (!selectedItem) return
    const token = getToken()
    if (!token) { setBuyErr(t("auth.loginRequired")); return }
    // 0원 상품 or 포인트로 전액 커버되면 즉시 처리
    const pointAmt  = usePoint ? Math.min(userBalance ?? 0, selectedItem.price_krw) : 0
    const remaining = selectedItem.price_krw - pointAmt
    if (remaining === 0) { await handleFreePurchase(); return }
    setBuying(true); setBuyErr("")
    try {
      const res  = await fetch("/api/market/balance-purchase", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ itemId: selectedItem.id, memo: balanceMemo, pointAmount: pointAmt }),
      })
      const data = await res.json()
      if (!res.ok) { setBuyErr(data.error ?? t("common.error")); return }
      setUserBalance(data.newBalance)
      setBalanceMemo("")
      setPurchasedIds(prev => new Set([...prev, selectedItem.id]))
      setSelectedItem(null)
      fetchItemsRef.current?.()
    } catch {
      setBuyErr(t("common.error"))
    } finally {
      setBuying(false)
    }
  }, [selectedItem, handleFreePurchase, usePoint, userBalance])

  // 다이얼로그 열릴 때 구매 여부 반영
  useEffect(() => {
    if (!selectedItem) return
    setHasPurchased(purchasedIds.has(selectedItem.id))
    // 최신 구매 여부 서버에서 재확인
    const token = getToken()
    if (!token) return
    fetch(`/api/market/items/${selectedItem.id}/purchased`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.purchased) {
          setHasPurchased(true)
          setPurchasedIds(prev => new Set([...prev, selectedItem.id]))
        }
      })
      .catch(() => {})
  }, [selectedItem?.id])

  // 모달이 열릴 때 잔고 로드 (로그인 유저 전체)
  useEffect(() => {
    if (!selectedItem) return
    setUsePoint(false)
    const token = getToken()
    if (!token) return
    fetch("/api/user/balance", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setUserBalance(d.balance ?? 0))
      .catch(() => {})
  }, [selectedItem?.id])

  // 카테고리 로드
  useEffect(() => {
    fetch("/api/market/categories")
      .then(r => r.json())
      .then(d => setCategories(d.categories ?? []))
      .catch(() => {})
  }, [])

  const fetchItems = useCallback(async (catId: string, s: string, query: string) => {
    setLoading(true)
    const params = new URLSearchParams({ sort: s })
    if (catId !== "all") params.set("category", catId)
    if (query)           params.set("q", query)
    const res  = await fetch(`/api/market/items?${params}`).catch(() => null)
    const data = res ? await res.json() : {}
    setItems(data.items ?? [])
    setLoading(false)
  }, [])

  // ref를 항상 최신 fetchItems로 유지 (handleBalanceBuy에서 TDZ 없이 참조)
  useEffect(() => {
    fetchItemsRef.current = () => fetchItems(activeCat, sort, q)
  }, [fetchItems, activeCat, sort, q])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => fetchItems(activeCat, sort, q), 300)
  }, [activeCat, sort, q, fetchItems])

  return (
    <div className="min-h-screen bg-background text-foreground">

      <DepositDialog open={showDeposit} onClose={() => setShowDeposit(false)} />

      {/* 글쓰기 권한 신청 모달 */}
      {showRequestModal && (
        <WritePermissionModal
          currentStatus={writePermStatus}
          onClose={() => setShowRequestModal(false)}
          onSubmitted={() => { setWritePermStatus("pending"); setShowRequestModal(false) }}
        />
      )}

      {/* 상품 상세 다이얼로그 */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.75)" }}
          onClick={() => { setSelectedItem(null); setBuyErr(""); setTvId("") }}
        >
          <div
            className="relative w-full max-w-lg rounded-2xl border border-border bg-background overflow-hidden shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button
          onClick={() => { setSelectedItem(null); setBuyErr(""); setTvId(""); setBalanceMemo("") }}

              className="absolute top-3 right-3 z-10 p-1.5 rounded-lg bg-secondary/80 hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="relative aspect-video w-full bg-secondary">
              {selectedItem.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={blobImageUrl(selectedItem.image_url)!}
                  alt={selectedItem.title}
                  loading="eager"
                  decoding="async"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-6xl">
                  {selectedItem.market_categories?.icon ?? "📦"}
                </div>
              )}
              {selectedItem.market_categories && (
                <span className="absolute top-3 left-3 px-2 py-1 rounded-lg bg-black/60 backdrop-blur text-xs text-white font-medium">
                  {selectedItem.market_categories.icon} {selectedItem.market_categories.name}
                </span>
              )}
            </div>

            <div className="p-5 space-y-3">
              <div>
                <h2 className="text-base font-bold text-foreground">{selectedItem.title}</h2>
                {selectedItem.profiles && (
                  <p className="text-xs text-muted-foreground mt-0.5">by {selectedItem.profiles.username}</p>
                )}
              </div>
              {selectedItem.description && (
                <p className="text-sm text-muted-foreground leading-relaxed">{selectedItem.description}</p>
              )}
              <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-lg font-extrabold ${usePoint && userBalance !== null && userBalance > 0 ? "line-through text-muted-foreground text-sm" : "text-primary"}`}>
                    {selectedItem.price_krw.toLocaleString("ko-KR")}원
                  </span>
                  {usePoint && userBalance !== null && userBalance > 0 && selectedItem.price_krw > 0 && (
                    <span className="text-lg font-extrabold text-primary">
                      {Math.max(0, selectedItem.price_krw - Math.min(userBalance, selectedItem.price_krw)).toLocaleString("ko-KR")}원
                    </span>
                  )}
                  {/* 포인트 사용 버튼 — 로그인 유저 + 잔고 있을 때만 */}
                  {userBalance !== null && userBalance > 0 && selectedItem.price_krw > 0 && (
                    <button
                      type="button"
                      onClick={() => setUsePoint(v => !v)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                        usePoint
                          ? "bg-primary text-black border-primary"
                          : "bg-transparent text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      포인트 사용
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{(selectedItem.view_count ?? 0).toLocaleString()}명 조회</span>
                  {(selectedItem.game_bonus_rate ?? 0) > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-primary/15 text-primary font-semibold text-xs">
                      보너스 게임 +{selectedItem.game_bonus_rate}%
                    </span>
                  )}
                </div>
              </div>
              {/* 포인트 잔고 + 차감 안내 */}
              {userBalance !== null && userBalance > 0 && selectedItem.price_krw > 0 && (
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary/40 border border-border">
                  <span className="text-xs text-muted-foreground">보유 포인트</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">{userBalance.toLocaleString("ko-KR")}원</span>
                    {usePoint && (
                      <span className="text-xs text-primary font-semibold">
                        -{Math.min(userBalance, selectedItem.price_krw).toLocaleString("ko-KR")}원 차감
                      </span>
                    )}
                  </div>
                </div>
              )}
              {(selectedItem.game_bonus_rate ?? 0) > 0 && (
                <p className="text-xs text-muted-foreground bg-primary/5 border border-primary/20 rounded-lg px-3 py-2">
                  이 컨텐츠 구매 시 결제 금액의 <span className="text-primary font-semibold">{selectedItem.game_bonus_rate}%</span>인{" "}
                  <span className="text-primary font-semibold">
                    {Math.floor(selectedItem.price_krw * selectedItem.game_bonus_rate / 100).toLocaleString("ko-KR")}원
                  </span>
                  이 보너스 게임 잔고로 자동 적립됩니다.
                </p>
              )}

              {/* 포인트 전용 카테고리가 아닐 때만 트레이딩뷰 ID 입력 */}
              {!selectedItem.market_categories?.balance_only && (
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">
                    계정 정보 입력 <span className="text-muted-foreground/50">(선택)</span>
                  </label>
                  <input
                    type="text"
                    value={tvId}
                    onChange={e => setTvId(e.target.value)}
                    placeholder="트레이딩뷰, 텔레그램 등 구독할 계정을 입력해주세요."
                    className="w-full h-9 px-3 text-sm bg-secondary/40 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/50"
                  />
                </div>
              )}

              {/* 포인트 전용: 메모 입력 */}
              {selectedItem.market_categories?.balance_only && (
                <>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">
                      메모 <span className="text-muted-foreground/50">(선택, 최대 500자)</span>
                    </label>
                    <textarea
                      value={balanceMemo}
                      onChange={e => setBalanceMemo(e.target.value)}
                      maxLength={500}
                      rows={3}
                      placeholder="판매자에게 전달할 내용을 입력하세요"
                      className="w-full px-3 py-2 text-sm bg-secondary/40 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/50 resize-none"
                    />
                    <p className="text-[10px] text-muted-foreground/60 text-right">{balanceMemo.length} / 500</p>
                  </div>
                </>
              )}

              {buyErr && <p className="text-xs text-destructive">{buyErr}</p>}

              <div className="flex gap-2">
                {selectedItem.market_categories?.balance_only ? (
                  <button
                    onClick={handleBalanceBuy}
                    disabled={buying || (userBalance !== null && userBalance < (selectedItem.price_krw - (usePoint ? Math.min(userBalance ?? 0, selectedItem.price_krw) : 0)))}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-black text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-60"
                  >
                    {buying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
                    {buying ? "처리 중..." : "잔고로 구매"}
                  </button>
                ) : (
                  <button
                    onClick={handleBuy}
                    disabled={buying}
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-black text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-60"
                  >
                    {buying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
                    {buying ? t("market.buyingButton") : selectedItem?.price_krw === 0 ? "무료 받기" : t("market.buyButton")}
                  </button>
                )}

                {/* 링크 바로가기 — link_url이 있을 때만 표시, 구매 전 비활성 */}
                {selectedItem.link_url && (
                  hasPurchased ? (
                    <a
                      href={selectedItem.link_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-primary/50 bg-primary/10 text-primary text-sm font-bold hover:bg-primary/20 transition-colors shrink-0"
                      title="링크 바로가기"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span className="hidden sm:inline">링크</span>
                    </a>
                  ) : (
                    <button
                      disabled
                      title="구매 후 이용 가능합니다"
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-border bg-secondary/40 text-muted-foreground text-sm font-bold cursor-not-allowed shrink-0"
                    >
                      <Lock className="w-4 h-4" />
                      <span className="hidden sm:inline">링크</span>
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 상단 검색 + 필터 바 */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3 space-y-3">
          {/* 검색 + 액션 버튼 */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder={t("market.searchPlaceholder")}
                value={q}
                onChange={e => setQ(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {q && (
                <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                  <X className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* 정렬 사이클 버튼 — 누를 때마다 순환 */}
            {(() => {
              const cur = SORT_CYCLE[sortIdx]
              const Icon = cur.icon
              return (
                <button
                  onClick={() => setSortIdx(i => (i + 1) % SORT_CYCLE.length)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary border border-border text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors shrink-0"
                  title={t("market.sortPopular")}
                >
                  <Icon className="w-3.5 h-3.5 text-primary" />
                  <span className="hidden sm:inline">{t(cur.tKey)}</span>
                </button>
              )
            })()}

            {/* 토큰 입금 버튼 — 마스터가 허용한 회원만 표시 */}
            {allowTokenDeposit && (
              <button
                onClick={() => setShowDeposit(true)}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors shrink-0"
                title={t("nav.deposit")}
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t("market.depositButton")}</span>
              </button>
            )}

            {/* + 글쓰기 버튼 — 모두에게 표시, 권한 없으면 신청 모달 */}
            {/* canWrite: role이 WRITE_ROLES에 있거나, 승인된 write-permission이 있는 경우 */}
            {(() => {
              const canWrite = (role && WRITE_ROLES.includes(role)) || writePermStatus === "approved"
              return (
            <button
              onClick={() => {
                if (!getToken()) { setShowRequestModal(true); return }
                // 권한 없음: 신청 모달 바로 오픈 (폼 절대 표시 안 함)
                if (!canWrite) { setShowRequestModal(true); return }
                setEditItem(null); setShowAdmin(v => !v)
              }}
              className={cn(
                "flex items-center justify-center w-9 h-9 rounded-lg border transition-colors shrink-0",
                showAdmin && canWrite
                  ? "bg-primary/15 border-primary/40 text-primary"
                  : writePermStatus === "pending"
                  ? "bg-amber-500/10 border-amber-500/40 text-amber-500"
                  : "bg-secondary border-border text-foreground hover:border-primary/40 hover:text-primary"
              )}
              title={
                canWrite ? t("market.registerProduct") :
                writePermStatus === "pending" ? t("market.pendingReview") :
                t("market.requestWrite")
              }
            >
              <PenLine className="w-4 h-4" />
            </button>
              )
            })()}
          </div>

          {/* 카테고리 탭 */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
            <button
              onClick={() => { setActiveCat("all"); setShowPurchasedOnly(false) }}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                activeCat === "all" && !showPurchasedOnly
                  ? "bg-primary text-black"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              <span>🏪</span> {t("market.all")}
            </button>
            {categories.filter(c => c.name !== "전체").map(cat => (
              <button
                key={cat.id}
                onClick={() => setActiveCat(cat.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                  activeCat === cat.id
                    ? "bg-primary text-black"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                )}
              >
                <span>{cat.icon}</span> {((): string => {
                  if (cat.balance_only) return t("categories.pointsOnly") as string
                  const lower = cat.name.toLowerCase()
                  if (lower.includes("채널") || lower.includes("channel")) return t("categories.channel") as string
                  if (lower.includes("지표") || lower.includes("indicator")) return t("categories.indicator") as string
                  return cat.name
                })()}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* 글쓰기 패널 — 권한 게이트 */}
        {showAdmin && (() => {
          const canWrite = (role && WRITE_ROLES.includes(role)) || writePermStatus === "approved"

          // 권한 없음 → 양식 대신 신청 안내 표시
          if (!canWrite) {
            return (
              <div className="rounded-xl border border-border bg-secondary/30 p-6 flex flex-col items-center gap-4 text-center">
                <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center border border-border">
                  <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75A4.5 4.5 0 0 0 7.5 6.75v3.75m-.75 0h10.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5v-6a1.5 1.5 0 0 1 1.5-1.5Z" />
                  </svg>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-foreground">상품 등록 권한이 필요합니다</p>
                  {writePermStatus === "pending" ? (
                    <p className="text-xs text-amber-500">권한 신청이 검토 중입니다. 승인 후 등록이 가능합니다.</p>
                  ) : writePermStatus === "rejected" ? (
                    <p className="text-xs text-destructive">권한 신청이 거절되었습니다. 다시 신청하거나 관리자에게 문의하세요.</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">글쓰기 권한을 신청하면 관리자 승인 후 상품을 등록할 수 있습니다.</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {writePermStatus !== "pending" && (
                    <button
                      onClick={() => { setShowAdmin(false); setShowRequestModal(true) }}
                      className="h-8 px-4 rounded-lg bg-primary text-black text-xs font-semibold hover:bg-primary/90 transition-colors"
                    >
                      권한 신청하기
                    </button>
                  )}
                  <button
                    onClick={() => setShowAdmin(false)}
                    className="h-8 px-4 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                  >
                    닫���
                  </button>
                </div>
              </div>
            )
          }

          // 권한 있음 → 등록 폼
          return (
            <MarketAdminPanel
              categories={categories.filter(c =>
                c.name !== "전체" &&
                // 포인트 전용 카테고리는 role 권한자 또는 allow_point_category 승인자만 표시
                (!c.balance_only || role === "master" || (WRITE_ROLES.includes(role ?? "") && role !== "seller") || allowPointCategory)
              )}
              editItem={editItem}
              isMaster={role === "master"}
              selfPublisherId={userId}
              onClose={() => { setShowAdmin(false); setEditItem(null) }}
              onSuccess={() => { setShowAdmin(false); setEditItem(null); fetchItems(activeCat, sort, q) }}
            />
          )
        })()}

        {/* 상품 그리드 */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-secondary/40 animate-pulse aspect-[3/4]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {(showPurchasedOnly ? items.filter(i => purchasedIds.has(i.id)) : items).length === 0 ? (
              <div className="col-span-full flex flex-col items-center justify-center py-24 text-muted-foreground">
                <CheckCircle2 className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">{showPurchasedOnly ? "구매한 상품이 없습니다." : "상품이 없습니다."}</p>
              </div>
            ) : null}
            {(showPurchasedOnly ? items.filter(i => purchasedIds.has(i.id)) : items).map((item, idx) => (
              <MarketItemCard
                key={item.id}
                item={item}
                index={idx}
                isAdmin={role === "master"}
                onSelect={() => {
                  setSelectedItem(item); setBuyErr("")
                  // 조회수 서버 증가 (fire-and-forget)
                  fetch(`/api/market/items/${item.id}/view`, { method: "POST" }).catch(() => {})
                }}
                onEdit={() => {
                  setEditItem({
                    id:           item.id,
                    title:        item.title,
                    description:  item.description,
                    link_url:     null,
                    price_krw:    item.price_krw,
                    category_id:  item.category_id,
                    publisher_id: "", // ���널 내에서 publishers 로드 후 표시
                    image_url:    item.image_url,
                    is_active:    true,
                  })
                  setShowAdmin(true)
                  window.scrollTo({ top: 0, behavior: "smooth" })
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// 글쓰기 권한 신청 모달
function WritePermissionModal({
  currentStatus,
  onClose,
  onSubmitted,
}: {
  currentStatus: string | null
  onClose: () => void
  onSubmitted: () => void
}) {
  const { t } = useTranslation()
  const [reason, setReason]     = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setSubmitting(true)
    try {
      const token = getToken()
      const res = await fetch("/api/market/write-permission", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ reason: reason.trim() || null }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? t("market.errorRequestFailed")); return }
      onSubmitted()
    } catch {
      setError(t("common.error"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-border bg-background shadow-2xl p-6 space-y-4"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <PenLine className="w-5 h-5 text-primary shrink-0" />
            <h3 className="text-sm font-bold text-foreground">{t("market.writePermTitle")}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {currentStatus === "pending" ? (
          <div className="flex items-start gap-3 rounded-xl bg-amber-500/10 border border-amber-500/20 p-4">
            <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-amber-500">{t("market.writePermPendingTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("market.writePermPendingDesc")}</p>
            </div>
          </div>
        ) : currentStatus === "rejected" ? (
          <div className="flex items-start gap-3 rounded-xl bg-destructive/10 border border-destructive/20 p-4">
            <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-destructive">{t("market.writePermRejectedTitle")}</p>
              <p className="text-xs text-muted-foreground">{t("market.writePermRejectedDesc")}</p>
            </div>
          </div>
        ) : null}

        {currentStatus !== "pending" && (
          <form onSubmit={handleSubmit} className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {t("market.writePermDesc")}
            </p>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t("market.writePermReasonLabel")} <span className="opacity-50">{t("market.writePermReasonOptional")}</span></label>
              <textarea
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder={t("market.writePermReasonPlaceholder")}
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 rounded-lg bg-primary text-black text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              {submitting ? t("market.writePermSubmitting") : t("market.writePermSubmit")}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function MarketItemCard({
  item, index, isAdmin, onSelect, onEdit,
}: {
  item: Item
  index: number
  isAdmin: boolean
  onSelect: () => void
  onEdit: () => void
}) {
  return (
    <div className="group relative rounded-xl border border-border bg-secondary/20 overflow-hidden hover:border-primary/40 transition-all duration-200 hover:-translate-y-0.5">
      {/* 관리자 수정 버튼 */}
      {isAdmin && (
        <button
          onClick={e => { e.stopPropagation(); onEdit() }}
          className="absolute top-2 right-2 z-10 p-1.5 rounded-lg bg-black/70 backdrop-blur-sm text-white hover:bg-primary hover:text-black transition-colors opacity-0 group-hover:opacity-100"
          title="수정"
        >
          <Edit2 className="w-3 h-3" />
        </button>
      )}

      <button onClick={onSelect} className="block w-full text-left cursor-pointer">
        {/* 이미지 영역 */}
        <div className="relative aspect-square bg-secondary overflow-hidden">
          {item.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={blobImageUrl(item.image_url)!}
              alt={item.title}
              loading={index < 6 ? "eager" : "lazy"}
              decoding="async"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-4xl">
              {item.market_categories?.icon ?? "📦"}
            </div>
          )}
          {item.market_categories && (
            <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-[10px] text-white font-medium">
              {item.market_categories.icon} {item.market_categories.name}
            </span>
          )}
          {/* 콘텐츠 타입 + 데이터 소스 배지 */}
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-1">
            {item.content_type && (
              <span className="px-1.5 py-0.5 rounded-md bg-primary/80 text-black text-[9px] font-semibold">
                {item.content_type === "ebook" && "전자책"}
                {item.content_type === "line" && "라인"}
                {item.content_type === "youtube" && "유튜브"}
                {item.content_type === "telegram" && "텔레그램"}
                {item.content_type === "discord" && "디스코드"}
              </span>
            )}
            {item.data_source_type && (
              <span className="px-1.5 py-0.5 rounded-md bg-secondary/80 text-foreground text-[9px] font-semibold">
                {item.data_source_type === "individual" && "개별연결"}
                {item.data_source_type === "text" && "텍스트"}
                {item.data_source_type === "tradingview" && "트뷰"}
              </span>
            )}
          </div>
        </div>

        {/* 정보 영역 */}
        <div className="p-2.5 space-y-1">
          <p className="text-xs font-semibold text-foreground line-clamp-2 leading-snug">{item.title}</p>
          {item.profiles && (
            <p className="text-[10px] text-muted-foreground">by {item.profiles.username}</p>
          )}
          <p className="text-xs font-bold text-primary">
            {item.price_krw.toLocaleString("ko-KR")}원
          </p>
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
            <span>{(item.view_count ?? 0).toLocaleString()}명 조회</span>
            {item.market_categories?.balance_only && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 font-semibold text-[9px]">
                잔고 전용
              </span>
            )}
            {(item.game_bonus_rate ?? 0) > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-primary/15 text-primary font-semibold text-[9px]">
                보너스 게임 +{item.game_bonus_rate}%
              </span>
            )}
          </div>
        </div>
        </button>
    </div>
  )
}
