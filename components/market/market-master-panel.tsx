"use client"

import { useState, useEffect, useCallback } from "react"
import {
  RefreshCw, Plus, Pencil, Trash2, X, Check, Link2,
  ChevronDown, ChevronUp, Loader2, Package,
  Tag, Eye, EyeOff, Search, ShoppingBag,
} from "lucide-react"
import { blobImageUrl } from "@/lib/blob-image"
import MarketAdminPanel, { type EditItem } from "@/components/market/market-admin-panel"

function getToken() {
  try { return localStorage.getItem("app_token") } catch { return null }
}

interface Category {
  id: string
  name: string
  icon: string
  sort_order: number
}

interface MarketItem {
  id: string
  title: string
  description: string
  image_url: string | null
  price_krw: number
  is_active: boolean
  view_count: number
  order_count: number
  created_at: string
  category_id: string | null
  publisher_id: string
  link_url?: string | null
  market_categories: { name: string; icon: string } | null
  profiles?: { username: string; role: string } | null
}

// ── 카테고리 관리 섹션 ───────────────────────────────────────────
function CategoryManager({ categories, onRefresh }: { categories: Category[]; onRefresh: () => void }) {
  const [adding, setAdding]         = useState(false)
  const [newName, setNewName]       = useState("")
  const [newIcon, setNewIcon]       = useState("📦")
  const [editId, setEditId]         = useState<string | null>(null)
  const [editName, setEditName]     = useState("")
  const [editIcon, setEditIcon]     = useState("")
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState("")

  const authHeader = () => ({ "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` })

  const handleAdd = async () => {
    if (!newName.trim()) { setError("이름을 입력하세요."); return }
    setLoading(true); setError("")
    const res = await fetch("/api/market/categories", {
      method: "POST",
      headers: authHeader(),
      body: JSON.stringify({ name: newName.trim(), icon: newIcon }),
    })
    setLoading(false)
    if (!res.ok) { const d = await res.json(); setError(d.error ?? "추가 실패"); return }
    setNewName(""); setNewIcon("📦"); setAdding(false)
    onRefresh()
  }

  const handleEdit = async (id: string) => {
    if (!editName.trim()) { setError("이름을 입력하세요."); return }
    setLoading(true); setError("")
    const res = await fetch("/api/market/categories", {
      method: "PATCH",
      headers: authHeader(),
      body: JSON.stringify({ id, name: editName.trim(), icon: editIcon }),
    })
    setLoading(false)
    if (!res.ok) { const d = await res.json(); setError(d.error ?? "수정 실패"); return }
    setEditId(null)
    onRefresh()
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`"${name}" 카테고리를 삭제하시겠습니까?\n해당 카테고리 상품은 미분류로 변경됩니다.`)) return
    setLoading(true); setError("")
    const res = await fetch("/api/market/categories", {
      method: "DELETE",
      headers: authHeader(),
      body: JSON.stringify({ id }),
    })
    setLoading(false)
    if (!res.ok) { const d = await res.json(); setError(d.error ?? "삭제 실패"); return }
    onRefresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Tag className="w-3.5 h-3.5" /> 카테고리 관리
        </h4>
        <button
          onClick={() => { setAdding(v => !v); setError("") }}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> 추가
        </button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* 카테고리 추가 폼 */}
      {adding && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/30 border border-border">
          <input
            value={newIcon}
            onChange={e => setNewIcon(e.target.value)}
            placeholder="아이콘"
            className="w-12 px-2 py-1.5 rounded bg-background border border-border text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="카테고리 이름"
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            className="flex-1 px-2 py-1.5 rounded bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            onClick={handleAdd} disabled={loading}
            className="px-3 py-1.5 rounded bg-primary text-black text-xs font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          </button>
          <button onClick={() => setAdding(false)} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 카테고리 목록 */}
      <div className="space-y-1.5">
        {categories.filter(c => c.name !== "전체").map(cat => (
          <div key={cat.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/20 border border-border/50 group">
            {editId === cat.id ? (
              <>
                <input
                  value={editIcon}
                  onChange={e => setEditIcon(e.target.value)}
                  className="w-10 px-1 py-1 rounded bg-background border border-border text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleEdit(cat.id)}
                  className="flex-1 px-2 py-1 rounded bg-background border border-border text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <button onClick={() => handleEdit(cat.id)} disabled={loading} className="text-primary hover:text-primary/80 transition-colors">
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setEditId(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <>
                <span className="text-base">{cat.icon}</span>
                <span className="flex-1 text-sm text-foreground">{cat.name}</span>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => { setEditId(cat.id); setEditName(cat.name); setEditIcon(cat.icon); setError("") }}
                    className="p-1 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleDelete(cat.id, cat.name)}
                    className="p-1 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {categories.filter(c => c.name !== "전체").length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-3">카테고리가 없습니다.</p>
        )}
      </div>
    </div>
  )
}

// ── 메인 패널 ────────────────────────────────────────────────────
export default function MarketMasterPanel() {
  const [items, setItems]               = useState<MarketItem[]>([])
  const [categories, setCategories]     = useState<Category[]>([])
  const [loading, setLoading]           = useState(false)
  const [search, setSearch]             = useState("")
  const [filterCat, setFilterCat]       = useState("")
  const [filterActive, setFilterActive] = useState<"all" | "active" | "inactive">("all")
  const [editItem, setEditItem]         = useState<EditItem | null>(null)
  const [showCatManager, setShowCatManager] = useState(false)
  const [sortField, setSortField]       = useState<"created_at" | "price_krw" | "view_count" | "order_count">("created_at")
  const [sortDir, setSortDir]           = useState<"desc" | "asc">("desc")
  const [copiedId,  setCopiedId]        = useState<string | null>(null)

  const loadCategories = useCallback(async () => {
    const res = await fetch("/api/market/categories")
    const d   = await res.json()
    setCategories(d.categories ?? [])
  }, [])

  const loadItems = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ mine: "false", limit: "200" })
    // master는 mine=false + is_active 필터 없음 → 전체 가져오기
    const res = await fetch(`/api/market/items?${params}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    const d = await res.json()
    // 비활성 포함 전체 필요: 직접 mine 아닌 전체 쿼리 사용
    setItems(d.items ?? [])
    setLoading(false)
  }, [])

  // 마스터용 전체 상품 (비활성 포함) 로드
  const loadAllItems = useCallback(async () => {
    setLoading(true)
    const res = await fetch("/api/market/items?mine=false&all=true", {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    const d = await res.json()
    setItems(d.items ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    loadAllItems()
    loadCategories()
  }, [loadAllItems, loadCategories])

  const toggleActive = async (item: MarketItem) => {
    await fetch(`/api/market/items/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ is_active: !item.is_active }),
    })
    loadAllItems()
  }

  const handleDelete = async (item: MarketItem) => {
    if (!confirm(`"${item.title}" 상품을 삭제(비활성화)하시겠습니까?`)) return
    await fetch(`/api/market/items/${item.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    })
    loadAllItems()
  }

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDir(d => d === "desc" ? "asc" : "desc")
    else { setSortField(field); setSortDir("desc") }
  }

  // 필터 + 정렬
  const filtered = items
    .filter(it => {
      if (search && !it.title.toLowerCase().includes(search.toLowerCase())) return false
      if (filterCat && it.category_id !== filterCat) return false
      if (filterActive === "active"   && !it.is_active) return false
      if (filterActive === "inactive" &&  it.is_active) return false
      return true
    })
    .sort((a, b) => {
      const av = a[sortField] as number | string
      const bv = b[sortField] as number | string
      return sortDir === "desc" ? (av < bv ? 1 : -1) : (av > bv ? 1 : -1)
    })

  const SortBtn = ({ field, label }: { field: typeof sortField; label: string }) => (
    <button
      onClick={() => handleSort(field)}
      className={`flex items-center gap-0.5 text-xs transition-colors ${sortField === field ? "text-primary font-semibold" : "text-muted-foreground hover:text-foreground"}`}
    >
      {label}
      {sortField === field
        ? (sortDir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)
        : <ChevronDown className="w-3 h-3 opacity-30" />}
    </button>
  )

  return (
    <div className="space-y-4">
      {/* 편집 패널 */}
      {editItem && (
        <MarketAdminPanel
          categories={categories}
          editItem={editItem}
          isMaster
          onClose={() => setEditItem(null)}
          onSuccess={() => { setEditItem(null); loadAllItems() }}
        />
      )}

      {/* 카테고리 관리 토글 */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <button
          onClick={() => setShowCatManager(v => !v)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold text-foreground hover:bg-secondary/30 transition-colors"
        >
          <span className="flex items-center gap-2"><Tag className="w-4 h-4 text-primary" /> 카테고리 관리</span>
          {showCatManager ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {showCatManager && (
          <div className="px-4 pb-4 border-t border-border/50">
            <div className="pt-4">
              <CategoryManager categories={categories} onRefresh={loadCategories} />
            </div>
          </div>
        )}
      </div>

      {/* 상품 전체 목록 */}
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <ShoppingBag className="w-4 h-4 text-primary" />
            전체 상품 관리
            <span className="text-xs text-muted-foreground font-normal">({filtered.length}개)</span>
          </span>
          <button onClick={loadAllItems} disabled={loading} className="text-muted-foreground hover:text-foreground transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>

        {/* 필터 바 */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border/50 bg-secondary/10">
          {/* 검색 */}
          <div className="relative flex-1 min-w-[140px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="상품명 검색"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          {/* 카테고리 필터 */}
          <select
            value={filterCat}
            onChange={e => setFilterCat(e.target.value)}
            className="px-2 py-1.5 rounded-lg bg-background border border-border text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="">전체 카테고리</option>
            {categories.filter(c => c.name !== "전체").map(c => (
              <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
            ))}
          </select>
          {/* 활성 필터 */}
          <div className="flex rounded-lg overflow-hidden border border-border text-xs">
            {(["all", "active", "inactive"] as const).map(v => (
              <button
                key={v}
                onClick={() => setFilterActive(v)}
                className={`px-3 py-1.5 transition-colors ${filterActive === v ? "bg-primary text-black font-semibold" : "bg-background text-muted-foreground hover:text-foreground"}`}
              >
                {v === "all" ? "전체" : v === "active" ? "판매중" : "비활성"}
              </button>
            ))}
          </div>
          {/* 정렬 */}
          <div className="flex items-center gap-2 ml-auto">
            <SortBtn field="created_at"  label="최신" />
            <SortBtn field="price_krw"   label="가격" />
            <SortBtn field="view_count"  label="조회" />
            <SortBtn field="order_count" label="구매" />
          </div>
        </div>

        {/* 목록 */}
        <div className="divide-y divide-border/40">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-muted-foreground">
              <Package className="w-8 h-8 opacity-30" />
              <p className="text-sm">상품이 없습니다.</p>
            </div>
          ) : (
            filtered.map(item => {
              const cat = categories.find(c => c.id === item.category_id)
              return (
                <div key={item.id} className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-secondary/10 ${!item.is_active ? "opacity-50" : ""}`}>
                  {/* 썸네일 */}
                  <div className="w-12 h-12 rounded-lg bg-secondary overflow-hidden flex-shrink-0">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={blobImageUrl(item.image_url)!} alt={item.title} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <Package className="w-5 h-5" />
                      </div>
                    )}
                  </div>

                  {/* 정보 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">{item.title}</p>
                      {!item.is_active && (
                        <span className="flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground border border-border">비활성</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      {cat && <span className="text-[11px] text-muted-foreground">{cat.icon} {cat.name}</span>}
                      <span className="text-[11px] font-semibold text-primary">₩{item.price_krw.toLocaleString()}</span>
                      <span className="text-[11px] text-muted-foreground">조회 {item.view_count}</span>
                      <span className="text-[11px] text-muted-foreground">구매 {item.order_count}</span>
                    </div>
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleActive(item)}
                      title={item.is_active ? "비활성화" : "활성화"}
                      className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {item.is_active ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>
                    {/* 링크 복사 */}
                    <button
                      onClick={async () => {
                        const url = `${window.location.origin}/market/${item.id}`
                        try {
                          await navigator.clipboard.writeText(url)
                        } catch {
                          const el = document.createElement("textarea")
                          el.value = url
                          el.style.position = "fixed"
                          el.style.opacity = "0"
                          document.body.appendChild(el)
                          el.select()
                          document.execCommand("copy")
                          document.body.removeChild(el)
                        }
                        setCopiedId(item.id)
                        setTimeout(() => setCopiedId(null), 2000)
                      }}
                      title="상품 링크 복사"
                      className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-primary transition-colors"
                    >
                      {copiedId === item.id
                        ? <Check className="w-3.5 h-3.5 text-primary" />
                        : <Link2 className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => setEditItem({
                        id:           item.id,
                        title:        item.title,
                        description:  item.description,
                        link_url:     item.link_url ?? null,
                        price_krw:    item.price_krw,
                        category_id:  item.category_id,
                        publisher_id: item.publisher_id,
                        image_url:    item.image_url,
                        is_active:    item.is_active,
                      } as any)}
                      className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(item)}
                      className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
