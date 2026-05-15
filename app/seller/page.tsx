"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { ShoppingBag, TrendingUp, Eye, Package, Plus, BarChart2, RefreshCw, ToggleLeft, ToggleRight, Pencil, Trash2, AlertTriangle } from "lucide-react"
import { blobImageUrl } from "@/lib/blob-image"
import MarketAdminPanel from "@/components/market/market-admin-panel"

function getToken() { try { return localStorage.getItem("app_token") } catch { return null } }

function parseJwt(token: string) {
  try { return JSON.parse(atob(token.split(".")[1])) } catch { return null }
}

const SELLER_ROLES = ["master", "super_admin", "branch_admin", "admin", "seller"]

// ─── 통계 카드 ──────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon }: { label: string; value: string; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-start gap-3">
      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-foreground tabular-nums">{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ─── 간단 바 차트 ───────────────────────────────────────────────────
function MiniBarChart({ data }: { data: { date: string; revenue: number }[] }) {
  const max = Math.max(...data.map(d => d.revenue), 1)
  const last7 = data.slice(-14)
  return (
    <div className="flex items-end gap-0.5 h-16">
      {last7.map(d => (
        <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5 group relative">
          <div
            className="w-full rounded-sm bg-primary/60 hover:bg-primary transition-colors cursor-default"
            style={{ height: `${Math.max(2, (d.revenue / max) * 56)}px` }}
          />
          <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
            <div className="bg-foreground text-background text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap">
              {d.date.slice(5)} · ₩{d.revenue.toLocaleString()}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function SellerPage() {
  const router = useRouter()
  const [role,        setRole]        = useState<string | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [stats,       setStats]       = useState<any>(null)
  const [items,       setItems]       = useState<any[]>([])
  const [orders,      setOrders]      = useState<any[]>([])
  const [dailySales,  setDailySales]  = useState<any[]>([])
  const [showPanel,   setShowPanel]   = useState(false)
  const [editItem,    setEditItem]    = useState<any | null>(null)
  const [categories,  setCategories]  = useState<any[]>([])
  const [userId,      setUserId]      = useState<string | null>(null)
  const [tab,         setTab]         = useState<"items" | "orders">("items")
  const [deleteId,    setDeleteId]    = useState<string | null>(null)
  const [toggling,    setToggling]    = useState<string | null>(null)
  const [actionMsg,   setActionMsg]   = useState<string | null>(null)

  const load = useCallback(async () => {
    const token = getToken()
    if (!token) { router.push("/"); return }
    const jwt = parseJwt(token)
    const r = jwt?.role ?? null
    setRole(r)
    setUserId(jwt?.sub ?? jwt?.userId ?? null)

    // role이 SELLER_ROLES에 없으면 write_permission_requests approved 여부 추가 확인
    if (!r || !SELLER_ROLES.includes(r)) {
      try {
        const permRes = await fetch("/api/market/write-permission", {
          headers: { Authorization: `Bearer ${token}` },
        })
        const permData = await permRes.json()
        if (permData?.request?.status !== "approved") { router.push("/"); return }
        // approved면 seller로 간주하고 진행
        setRole("seller")
      } catch {
        router.push("/"); return
      }
    }

    // 카테고리 로드
    fetch("/api/market/categories")
      .then(res => res.json())
      .then(d => setCategories(d.categories ?? []))
      .catch(() => {})

    setLoading(true)
    try {
      const res = await fetch("/api/seller/stats", { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { router.push("/"); return }
      const data = await res.json()
      setStats(data.stats)
      setItems(data.items ?? [])
      setOrders(data.orders ?? [])
      setDailySales(data.dailySales ?? [])
    } finally {
      setLoading(false)
    }
  }, [router])

  useEffect(() => { load() }, [load])

  const handleToggle = async (item: any) => {
    const token = getToken()
    if (!token) return
    setToggling(item.id)
    try {
      const res = await fetch(`/api/market/items/${item.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ is_active: !item.is_active }),
      })
      if (res.ok) setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !i.is_active } : i))
    } finally {
      setToggling(null)
    }
  }

  const handleDelete = async (id: string) => {
    const token = getToken()
    if (!token) return
    const res = await fetch(`/api/market/items/${id}`, {
      method:  "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      setItems(prev => prev.filter(i => i.id !== id))
      setActionMsg("상품이 삭제됐습니다.")
      setTimeout(() => setActionMsg(null), 3000)
    }
    setDeleteId(null)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="text-foreground">
      {/* 상품 등록/수정 패널 */}
      {(showPanel || editItem) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="w-full max-w-lg">
            <MarketAdminPanel
              categories={categories.filter(c => c.name !== "전체")}
              editItem={editItem}
              isMaster={role === "master"}
              selfPublisherId={userId}
              onClose={() => { setShowPanel(false); setEditItem(null) }}
              onSuccess={() => { setShowPanel(false); setEditItem(null); load() }}
            />
          </div>
        </div>
      )}

      {/* 삭제 확인 모달 */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }}>
          <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">상품 삭제</p>
                <p className="text-xs text-muted-foreground">이 상품을 비활성화합니다. 되돌릴 수 없습니다.</p>
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setDeleteId(null)} className="px-4 py-2 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors">취소</button>
              <button onClick={() => handleDelete(deleteId)} className="px-4 py-2 text-xs rounded-lg bg-destructive text-white font-medium hover:bg-destructive/90 transition-colors">삭제</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-primary" />
              판매 관리
            </h1>
            <p className="text-xs text-muted-foreground mt-1">내 컨텐츠 현황과 상품을 관리합니다.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => load()} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setShowPanel(true)}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-black text-xs font-semibold hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> 상품 등록
            </button>
          </div>
        </div>

        {actionMsg && (
          <div className="bg-primary/10 border border-primary/30 rounded-xl px-4 py-2.5 text-sm text-primary">{actionMsg}</div>
        )}

        {/* 통계 카드 */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="총 매출"     value={`₩${stats.totalRevenue.toLocaleString()}`}  icon={<TrendingUp className="w-4 h-4" />} />
            <StatCard label="총 판매"     value={`${stats.totalOrders}건`}                    icon={<ShoppingBag className="w-4 h-4" />} />
            <StatCard label="총 조회수"   value={stats.totalViews.toLocaleString()}           icon={<Eye className="w-4 h-4" />} />
            <StatCard label="등록 상품"   value={`${stats.activeItems} / ${stats.totalItems}`} sub="활성 / 전체" icon={<Package className="w-4 h-4" />} />
          </div>
        )}

        {/* 일별 매출 차트 */}
        {dailySales.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <BarChart2 className="w-4 h-4 text-primary" />
              <p className="text-sm font-semibold text-foreground">최근 14일 매출</p>
            </div>
            <MiniBarChart data={dailySales} />
          </div>
        )}

        {/* 탭 */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setTab("items")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === "items" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            내 상품 ({items.length})
          </button>
          <button
            onClick={() => setTab("orders")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === "orders" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            판매 내역 ({orders.filter(o => o.status === "paid").length})
          </button>
        </div>

        {/* 내 상품 탭 */}
        {tab === "items" && (
          <div className="space-y-2">
            {items.length === 0 ? (
              <div className="bg-card border border-dashed border-border rounded-xl py-16 flex flex-col items-center gap-3 text-muted-foreground">
                <Package className="w-8 h-8 opacity-30" />
                <p className="text-sm">등록된 상품이 없습니다.</p>
                <button onClick={() => setShowPanel(true)} className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-black text-xs font-semibold hover:bg-primary/90 transition-colors">
                  <Plus className="w-3.5 h-3.5" /> 첫 상품 등록하기
                </button>
              </div>
            ) : items.map(item => (
              <div key={item.id} className="bg-card border border-border rounded-xl p-4 flex items-center gap-3">
                {/* 썸네일 */}
                <div className="w-14 h-14 rounded-lg bg-secondary overflow-hidden shrink-0">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={blobImageUrl(item.image_url)!} alt={item.title} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground"><Package className="w-5 h-5 opacity-30" /></div>
                  )}
                </div>

                {/* 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${item.is_active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {item.is_active ? "판매중" : "비활성"}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">₩{(item.price_krw ?? 0).toLocaleString()} · 조회 {item.view_count ?? 0} · 판매 {item.order_count ?? 0}</p>
                  {item.market_categories && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{item.market_categories.icon} {item.market_categories.name}</p>
                  )}
                </div>

                {/* 액션 */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => handleToggle(item)}
                    disabled={toggling === item.id}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors disabled:opacity-40"
                    title={item.is_active ? "비활성화" : "활성화"}
                  >
                    {item.is_active ? <ToggleRight className="w-4 h-4 text-primary" /> : <ToggleLeft className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => setEditItem(item)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
                    title="수정"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteId(item.id)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40 transition-colors"
                    title="삭제"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 판매 내역 탭 */}
        {tab === "orders" && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {orders.filter(o => o.status === "paid").length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
                <ShoppingBag className="w-8 h-8 opacity-30" />
                <p className="text-sm">판매 내역이 없습니다.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {orders.filter(o => o.status === "paid").map(order => {
                  const item = items.find(i => i.id === order.item_id)
                  return (
                    <div key={order.id} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-foreground">{item?.title ?? "상품"}</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(order.created_at).toLocaleString("ko-KR")}</p>
                      </div>
                      <p className="text-sm font-semibold text-primary">+₩{(order.amount_krw ?? 0).toLocaleString()}</p>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
