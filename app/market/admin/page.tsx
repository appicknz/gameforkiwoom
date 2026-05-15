"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  LayoutGrid, Tag, ShoppingBag, RefreshCw, Plus, Pencil,
  Trash2, Loader2, X, Check, Eye, EyeOff, ArrowLeft,
  AlertTriangle, GripVertical, Search,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { blobImageUrl } from "@/lib/blob-image"
import MarketAdminPanel, { type EditItem } from "@/components/market/market-admin-panel"

// ─── 타입 ───────────────────────────────────────────────────────────────────
interface Category { id: string; name: string; icon: string; sort_order: number }
interface Item {
  id: string; title: string; description: string
  image_url: string | null; link_url: string | null
  price_krw: number; view_count: number; order_count: number
  is_active: boolean; created_at: string
  category_id: string | null; publisher_id: string
  market_categories: { name: string; icon: string } | null
}
interface WriteRequest {
  id: string; user_id: string; reason: string | null
  status: "pending" | "approved" | "rejected"
  created_at: string
  profiles: { username: string; role: string } | null
}

type Tab = "items" | "categories" | "permissions"

function getToken() { try { return localStorage.getItem("app_token") } catch { return null } }

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────
export default function MarketAdminPage() {
  const router   = useRouter()
  const [tab, setTab]         = useState<Tab>("items")
  const [role, setRole]       = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  // 권한 확인
  useEffect(() => {
    const token = getToken()
    if (!token) { router.push("/market"); return }
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        const r = d.profile?.role
        if (!["master", "super_admin"].includes(r)) { router.push("/market"); return }
        setRole(r)
        setLoading(false)
      })
      .catch(() => router.push("/market"))
  }, [router])

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 className="w-6 h-6 animate-spin text-primary" />
    </div>
  )

  const TABS: { key: Tab; label: string; icon: typeof LayoutGrid }[] = [
    { key: "items",       label: "상품 관리",     icon: ShoppingBag },
    { key: "categories",  label: "카테고리 관리", icon: Tag },
    { key: "permissions", label: "글쓰기 승인",   icon: Check },
  ]

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* 헤더 */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/market")}
            className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">마켓 관리</h1>
            <p className="text-xs text-muted-foreground mt-0.5">상품, 카테고리, 글쓰기 권한을 관리합니다.</p>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex items-center gap-1 bg-secondary/40 rounded-xl p-1">
          {TABS.map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium transition-colors",
                  tab === t.key
                    ? "bg-primary text-black shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4" />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* 탭 콘텐츠 */}
        {tab === "items"       && <ItemsTab />}
        {tab === "categories"  && <CategoriesTab />}
        {tab === "permissions" && <PermissionsTab />}
      </div>
    </div>
  )
}

// ─── 상품 관리 탭 ──────────────────────────────────────────────────────────
function ItemsTab() {
  const [items, setItems]         = useState<Item[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading]     = useState(true)
  const [editItem, setEditItem]   = useState<EditItem | null>(null)
  const [showNew, setShowNew]     = useState(false)
  const [delConfirm, setDelConfirm] = useState<string | null>(null)
  const [actioning, setActioning] = useState<string | null>(null)
  const [q, setQ]                 = useState("")
  const [filterCat, setFilterCat] = useState("all")
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all")

  const load = useCallback(async () => {
    setLoading(true)
    const token = getToken()
    const [itemRes, catRes] = await Promise.all([
      fetch("/api/market/items?all=true&sort=newest", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/market/categories"),
    ])
    const [itemData, catData] = await Promise.all([itemRes.json(), catRes.json()])
    setItems(itemData.items ?? [])
    setCategories(catData.categories ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const toggleActive = async (item: Item) => {
    setActioning(item.id)
    const token = getToken()
    await fetch(`/api/market/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ is_active: !item.is_active }),
    })
    await load()
    setActioning(null)
  }

  const deleteItem = async (id: string, hard = false) => {
    setActioning(id)
    const token = getToken()
    await fetch(`/api/market/items/${id}${hard ? "?hard=true" : ""}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    })
    setDelConfirm(null)
    await load()
    setActioning(null)
  }

  const filtered = items.filter(item => {
    if (q && !item.title.toLowerCase().includes(q.toLowerCase())) return false
    if (filterCat !== "all" && item.category_id !== filterCat) return false
    if (filterActive === "active"   && !item.is_active)  return false
    if (filterActive === "inactive" &&  item.is_active)  return false
    return true
  })

  return (
    <div className="space-y-4">
      {/* 새 상품 등록 폼 */}
      {showNew && (
        <MarketAdminPanel
          categories={categories}
          onClose={() => setShowNew(false)}
          onSuccess={() => { setShowNew(false); load() }}
          isMaster
        />
      )}
      {editItem && (
        <MarketAdminPanel
          categories={categories}
          onClose={() => setEditItem(null)}
          onSuccess={() => { setEditItem(null); load() }}
          editItem={editItem}
          isMaster
        />
      )}

      {/* 툴바 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            value={q} onChange={e => setQ(e.target.value)}
            placeholder="상품명 검색..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-secondary/40 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <select
          value={filterCat} onChange={e => setFilterCat(e.target.value)}
          className="px-3 py-2 rounded-lg bg-secondary/40 border border-border text-sm text-foreground focus:outline-none"
        >
          <option value="all">전체 카테고리</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
        </select>
        <select
          value={filterActive} onChange={e => setFilterActive(e.target.value as any)}
          className="px-3 py-2 rounded-lg bg-secondary/40 border border-border text-sm text-foreground focus:outline-none"
        >
          <option value="all">전체 상태</option>
          <option value="active">판매 중</option>
          <option value="inactive">판매 중단</option>
        </select>
        <button
          onClick={() => { setEditItem(null); setShowNew(v => !v) }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-black text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          상품 등록
        </button>
        <button onClick={load} className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      {/* 집계 */}
      <p className="text-xs text-muted-foreground">
        전체 <span className="text-foreground font-semibold">{items.length}</span>개 중{" "}
        <span className="text-foreground font-semibold">{filtered.length}</span>개 표시
        {" · "}활성 <span className="text-green-400 font-semibold">{items.filter(i => i.is_active).length}</span>개
        {" · "}비활성 <span className="text-muted-foreground font-semibold">{items.filter(i => !i.is_active).length}</span>개
      </p>

      {/* 목록 */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">상품이 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(item => (
            <div
              key={item.id}
              className={cn(
                "flex items-center gap-3 rounded-xl border bg-secondary/20 p-3 transition-colors",
                item.is_active ? "border-border" : "border-border/40 opacity-60"
              )}
            >
              {/* 썸네일 */}
              <div className="w-12 h-12 rounded-lg overflow-hidden bg-secondary shrink-0">
                {item.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={blobImageUrl(item.image_url)!} alt={item.title} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <ShoppingBag className="w-5 h-5" />
                  </div>
                )}
              </div>

              {/* 정보 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
                  {!item.is_active && (
                    <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground">비활성</span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-primary font-semibold tabular-nums">
                    {item.price_krw.toLocaleString("ko-KR")}원
                  </span>
                  {item.market_categories && (
                    <span className="text-xs text-muted-foreground">
                      {item.market_categories.icon} {item.market_categories.name}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">조회 {item.view_count}</span>
                  <span className="text-xs text-muted-foreground">구매 {item.order_count}</span>
                </div>
              </div>

              {/* 액션 버튼들 */}
              <div className="flex items-center gap-1 shrink-0">
                {/* 활성/비활성 토글 */}
                <button
                  onClick={() => toggleActive(item)}
                  disabled={actioning === item.id}
                  title={item.is_active ? "판매 중단" : "판매 재개"}
                  className={cn(
                    "p-1.5 rounded-lg transition-colors",
                    item.is_active
                      ? "text-green-400 hover:bg-green-400/10"
                      : "text-muted-foreground hover:bg-secondary"
                  )}
                >
                  {actioning === item.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : item.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />
                  }
                </button>

                {/* 수정 */}
                <button
                  onClick={() => {
                    setShowNew(false)
                    setEditItem({
                      id:           item.id,
                      title:        item.title,
                      description:  item.description,
                      link_url:     item.link_url,
                      price_krw:    item.price_krw,
                      category_id:  item.category_id,
                      publisher_id: item.publisher_id,
                      image_url:    item.image_url,
                      is_active:    item.is_active,
                    })
                  }}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>

                {/* 삭제 */}
                {delConfirm === item.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => deleteItem(item.id, true)}
                      disabled={!!actioning}
                      className="px-2 py-1 rounded-lg bg-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/30 transition-colors"
                    >
                      완전 삭제
                    </button>
                    <button
                      onClick={() => deleteItem(item.id, false)}
                      disabled={!!actioning}
                      className="px-2 py-1 rounded-lg bg-amber-500/20 text-amber-400 text-xs font-semibold hover:bg-amber-500/30 transition-colors"
                    >
                      비활성화
                    </button>
                    <button
                      onClick={() => setDelConfirm(null)}
                      className="p-1 rounded-lg text-muted-foreground hover:text-foreground"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDelConfirm(item.id)}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 카테고리 관리 탭 ──────────────────────────────────────────────────────
function CategoriesTab() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading]       = useState(true)
  const [editId, setEditId]         = useState<string | null>(null)
  const [editForm, setEditForm]     = useState({ name: "", icon: "", sort_order: 0 })
  const [newForm, setNewForm]       = useState({ name: "", icon: "", sort_order: 99 })
  const [showNew, setShowNew]       = useState(false)
  const [saving, setSaving]         = useState(false)
  const [delConfirm, setDelConfirm] = useState<string | null>(null)
  const [error, setError]           = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch("/api/market/categories")
    const data = await res.json()
    setCategories(data.categories ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const saveEdit = async () => {
    if (!editId || !editForm.name.trim()) { setError("이름은 필수입니다."); return }
    setSaving(true); setError("")
    const token = getToken()
    const res = await fetch("/api/market/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id: editId, ...editForm }),
    })
    if (!res.ok) { setError("저장 실패"); setSaving(false); return }
    setEditId(null)
    await load()
    setSaving(false)
  }

  const createCategory = async () => {
    if (!newForm.name.trim()) { setError("이름은 필수입니다."); return }
    setSaving(true); setError("")
    const token = getToken()
    const res = await fetch("/api/market/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(newForm),
    })
    if (!res.ok) { setError("추가 실패"); setSaving(false); return }
    setShowNew(false)
    setNewForm({ name: "", icon: "", sort_order: 99 })
    await load()
    setSaving(false)
  }

  const deleteCategory = async (id: string) => {
    setSaving(true)
    const token = getToken()
    await fetch(`/api/market/categories?id=${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    })
    setDelConfirm(null)
    await load()
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      {/* 새 카테고리 추가 폼 */}
      {showNew && (
        <div className="rounded-xl border border-primary/30 bg-secondary/30 p-4 space-y-3">
          <p className="text-sm font-semibold text-foreground">새 카테고리 추가</p>
          <div className="grid grid-cols-3 gap-2">
            <input
              placeholder="아이콘 (예: 🎓)"
              value={newForm.icon}
              onChange={e => setNewForm(f => ({ ...f, icon: e.target.value }))}
              className="px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              placeholder="카테고리 이름 *"
              value={newForm.name}
              onChange={e => setNewForm(f => ({ ...f, name: e.target.value }))}
              className="px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <input
              type="number" placeholder="정렬 순서"
              value={newForm.sort_order}
              onChange={e => setNewForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 99 }))}
              className="px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={createCategory} disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-black text-sm font-semibold hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              추가
            </button>
            <button
              onClick={() => { setShowNew(false); setError("") }}
              className="px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              취소
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">총 {categories.length}개</p>
        <button
          onClick={() => { setShowNew(v => !v); setError("") }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-primary text-black text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          카테고리 추가
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : (
        <div className="space-y-2">
          {categories.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 rounded-xl border border-border bg-secondary/20 p-3">
              <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0" />

              {editId === cat.id ? (
                /* 수정 중 */
                <div className="flex-1 grid grid-cols-3 gap-2">
                  <input
                    value={editForm.icon}
                    onChange={e => setEditForm(f => ({ ...f, icon: e.target.value }))}
                    placeholder="아이콘"
                    className="px-2 py-1.5 rounded-lg bg-background border border-primary/50 text-sm text-foreground focus:outline-none"
                  />
                  <input
                    value={editForm.name}
                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="이름 *"
                    className="px-2 py-1.5 rounded-lg bg-background border border-primary/50 text-sm text-foreground focus:outline-none"
                  />
                  <input
                    type="number"
                    value={editForm.sort_order}
                    onChange={e => setEditForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                    placeholder="순서"
                    className="px-2 py-1.5 rounded-lg bg-background border border-primary/50 text-sm text-foreground focus:outline-none"
                  />
                </div>
              ) : (
                /* 읽기 모드 */
                <div className="flex-1 flex items-center gap-3">
                  <span className="text-xl">{cat.icon}</span>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{cat.name}</p>
                    <p className="text-xs text-muted-foreground">정렬: {cat.sort_order}</p>
                  </div>
                </div>
              )}

              {/* 액션 */}
              <div className="flex items-center gap-1 shrink-0">
                {editId === cat.id ? (
                  <>
                    <button
                      onClick={saveEdit} disabled={saving}
                      className="p-1.5 rounded-lg text-green-400 hover:bg-green-400/10 transition-colors"
                    >
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => { setEditId(null); setError("") }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        setEditId(cat.id)
                        setEditForm({ name: cat.name, icon: cat.icon, sort_order: cat.sort_order })
                      }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>

                    {delConfirm === cat.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => deleteCategory(cat.id)}
                          className="px-2 py-1 rounded-lg bg-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/30"
                        >
                          삭제
                        </button>
                        <button onClick={() => setDelConfirm(null)} className="p-1 rounded-lg text-muted-foreground">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDelConfirm(cat.id)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── 글쓰기 권한 승인 탭 ───────────────────────────────────────────────────
function PermissionsTab() {
  const [requests, setRequests]   = useState<WriteRequest[]>([])
  const [loading, setLoading]     = useState(true)
  const [actioning, setActioning] = useState<string | null>(null)
  const [filter, setFilter]       = useState<"pending" | "all">("pending")

  const load = useCallback(async () => {
    setLoading(true)
    const token = getToken()
    const res  = await fetch("/api/market/write-permission/review?status=all", {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await res.json()
    setRequests(data.requests ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleAction = async (id: string, action: "approve" | "reject") => {
    setActioning(id)
    const token = getToken()
    await fetch("/api/market/write-permission/review", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ requestId: id, action }),
    })
    await load()
    setActioning(null)
  }

  const ROLE_LABEL: Record<string, string> = {
    user: "일반", member: "회원", admin: "지점", branch_admin: "총판",
    super_admin: "대총판", master: "마스터", seller: "판매자",
  }

  const displayed = filter === "pending"
    ? requests.filter(r => r.status === "pending")
    : requests

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {(["pending", "all"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                filter === f
                  ? "bg-primary/15 text-primary border border-primary/30"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}
            >
              {f === "pending" ? `대기 (${requests.filter(r => r.status === "pending").length})` : `전체 (${requests.length})`}
            </button>
          ))}
        </div>
        <button onClick={load} className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground">
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : displayed.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground text-sm">
          {filter === "pending" ? "대기 중인 신청이 없습니다." : "신청 내역이 없습니다."}
        </div>
      ) : (
        <div className="space-y-2">
          {displayed.map(req => (
            <div key={req.id} className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">
                      {req.profiles?.username ?? "알 수 없음"}
                    </p>
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-secondary border border-border text-muted-foreground">
                      {ROLE_LABEL[req.profiles?.role ?? ""] ?? req.profiles?.role}
                    </span>
                  </div>
                  {req.reason && (
                    <p className="text-xs text-muted-foreground">사유: {req.reason}</p>
                  )}
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {new Date(req.created_at).toLocaleString("ko-KR")}
                  </p>
                </div>
                <span className={cn(
                  "shrink-0 text-xs px-2 py-1 rounded-full border font-medium",
                  req.status === "pending"  && "bg-amber-500/10 text-amber-400 border-amber-500/30",
                  req.status === "approved" && "bg-green-500/10 text-green-400 border-green-500/30",
                  req.status === "rejected" && "bg-red-500/10 text-red-400 border-red-500/30",
                )}>
                  {req.status === "pending" ? "대기" : req.status === "approved" ? "승인" : "거절"}
                </span>
              </div>

              {req.status === "pending" && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAction(req.id, "approve")}
                    disabled={actioning === req.id}
                    className="flex-1 py-2 rounded-lg bg-green-500/20 text-green-400 border border-green-500/30 text-xs font-semibold hover:bg-green-500/30 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                  >
                    {actioning === req.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    승인
                  </button>
                  <button
                    onClick={() => handleAction(req.id, "reject")}
                    disabled={actioning === req.id}
                    className="flex-1 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold hover:bg-red-500/30 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <X className="w-3.5 h-3.5" />
                    거절
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
