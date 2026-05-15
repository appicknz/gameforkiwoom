"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Search, TrendingUp, ArrowUpDown, Clock, Flame, Plus, X, Edit2, ShoppingCart, Loader2, Download, PenLine, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { blobImageUrl } from "@/lib/blob-image"
import MarketAdminPanel, { type EditItem } from "@/components/market/market-admin-panel"
import DepositDialog from "@/components/deposit-dialog"
import { useTranslation } from "@/lib/i18n"

interface Category { id: string; name: string; icon: string }
interface Item {
  id: string; title: string; description: string
  image_url: string | null; price_krw: number
  view_count: number; order_count: number; created_at: string
  category_id: string | null
  market_categories: { name: string; icon: string } | null
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
  // 글쓰기 권한 신청 상태: null=미조회, 'none'=신청없음, 'pending'=대기중, 'approved'=승인됨, 'rejected'=거절됨
  const [writePermStatus, setWritePermStatus] = useState<string | null>(null)
  const [showRequestModal, setShowRequestModal] = useState(false)
  const [showDeposit, setShowDeposit]         = useState(false)
  const debounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const jwt = parseJwt()
    setRole(jwt?.role ?? null)
    setUserId(jwt?.sub ?? jwt?.userId ?? null)
  }, [])

  // 글쓰기 권한 신청 상태 로드
  useEffect(() => {
    const token = getToken()
    if (!token) return
    fetch("/api/market/write-permission", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setWritePermStatus(d?.request?.status ?? "none"))
      .catch(() => setWritePermStatus("none"))
  }, [])

  const handleBuy = useCallback(async () => {
    if (!selectedItem) return
    if (!getToken()) { setBuyErr(t("auth.loginRequired")); return }
    setBuying(true); setBuyErr("")
    try {
      const res  = await fetch("/api/market/checkout", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body:    JSON.stringify({ itemId: selectedItem.id, tvId: tvId.trim() }),
      })
      const data = await res.json()
      if (!res.ok) { setBuyErr(data.error ?? t("common.error")); return }
      window.location.href = data.url
    } catch {
      setBuyErr(t("common.error"))
    } finally {
      setBuying(false)
    }
  }, [selectedItem])

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
              onClick={() => { setSelectedItem(null); setBuyErr(""); setTvId("") }}
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
              <div className="flex items-center justify-between pt-1">
                <span className="text-lg font-extrabold text-primary">
                  {selectedItem.price_krw.toLocaleString("ko-KR")}원
                </span>
                <span className="text-xs text-muted-foreground">{selectedItem.order_count.toLocaleString()}명 구매</span>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">
                  트레이딩뷰 아이디 <span className="text-muted-foreground/50">(선택)</span>
                </label>
                <input
                  type="text"
                  value={tvId}
                  onChange={e => setTvId(e.target.value)}
                  placeholder="TradingView 아이디를 입력하세요"
                  className="w-full h-9 px-3 text-sm bg-secondary/40 border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/50"
                />
              </div>

              {buyErr && <p className="text-xs text-destructive">{buyErr}</p>}

              <button
                onClick={handleBuy}
                disabled={buying}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-black text-sm font-bold hover:bg-primary/90 transition-colors disabled:opacity-60"
              >
                {buying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShoppingCart className="w-4 h-4" />}
                {buying ? t("market.buyingButton") : t("market.buyButton")}
              </button>
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

            {/* 토큰 입금 버튼 — 다이얼로그로 열기 */}
            <button
              onClick={() => setShowDeposit(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary border border-border text-xs font-medium text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors shrink-0"
              title={t("nav.deposit")}
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{t("market.depositButton")}</span>
            </button>

            {/* + 글쓰기 버튼 — 모두에게 표시, 권한 없으면 신청 모달 */}
            {/* canWrite: role이 WRITE_ROLES에 있거나, 승인된 write-permission이 있는 경우 */}
            {(() => {
              const canWrite = (role && WRITE_ROLES.includes(role)) || writePermStatus === "approved"
              return (
            <button
              onClick={() => {
                if (canWrite) {
                  setEditItem(null); setShowAdmin(v => !v)
                } else {
                  setShowRequestModal(true)
                }
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
              onClick={() => setActiveCat("all")}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                activeCat === "all"
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
                <span>{cat.icon}</span> {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* 글쓰기 권한 상품 등록 패널 */}
        {showAdmin && ((role && WRITE_ROLES.includes(role)) || writePermStatus === "approved") && (
          <MarketAdminPanel
            categories={categories.filter(c => c.name !== "전체")}
            editItem={editItem}
            isMaster={role === "master"}
            selfPublisherId={userId}
            onClose={() => { setShowAdmin(false); setEditItem(null) }}
            onSuccess={() => { setShowAdmin(false); setEditItem(null); fetchItems(activeCat, sort, q) }}
          />
        )}

        {/* 상품 그리드 */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="rounded-xl bg-secondary/40 animate-pulse aspect-[3/4]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
            <Search className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">상품이 없습니다.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {items.map((item, idx) => (
              <MarketItemCard
                key={item.id}
                item={item}
                index={idx}
                isAdmin={role === "master"}
                onSelect={() => { setSelectedItem(item); setBuyErr("") }}
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
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>{item.order_count.toLocaleString()}명 구매</span>
          </div>
        </div>
        </button>
    </div>
  )
}
