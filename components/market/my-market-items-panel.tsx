"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  RefreshCw, Plus, Pencil, Trash2, X, Upload,
  ImageIcon, Loader2, CheckCircle, AlertCircle,
  ChevronDown, Eye, EyeOff, Package,
} from "lucide-react"
import { blobImageUrl } from "@/lib/blob-image"

interface Category { id: string; name: string; icon: string }
interface MarketItem {
  id: string
  title: string
  description: string
  image_url: string | null
  price_krw: number
  order_count: number
  view_count: number
  is_active: boolean
  category_id: string | null
  market_categories: { name: string; icon: string } | null
  created_at: string
}

function getToken() {
  try { return localStorage.getItem("app_token") } catch { return null }
}

// ── 인라인 수정 폼 ────────────────────────────────────────────────
function EditItemForm({
  item,
  categories,
  onSave,
  onCancel,
}: {
  item: MarketItem
  categories: Category[]
  onSave: (updated: MarketItem) => void
  onCancel: () => void
}) {
  const [title, setTitle]           = useState(item.title)
  const [description, setDesc]      = useState(item.description ?? "")
  const [price, setPrice]           = useState(item.price_krw.toLocaleString("ko-KR"))
  const [categoryId, setCategoryId] = useState(item.category_id ?? "")
  const [imageUrl, setImageUrl]     = useState<string | null>(item.image_url)
  const [imagePreview, setPreview]  = useState<string | null>(blobImageUrl(item.image_url))
  const [uploading, setUploading]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState("")
  const [catOpen, setCatOpen]       = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) { setError("이미지 파일만 가능합니다."); return }
    setError("")
    setPreview(URL.createObjectURL(file))
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res  = await fetch("/api/market/upload", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "업로드 실패")
      setImageUrl(data.url)
    } catch (e: any) {
      setError(e.message)
      setPreview(blobImageUrl(item.image_url))
      setImageUrl(item.image_url)
    } finally {
      setUploading(false)
    }
  }, [item.image_url])

  const handleSave = async () => {
    setError("")
    const priceNum = Number(price.replace(/,/g, ""))
    if (!title.trim())            { setError("제목을 입력해주세요."); return }
    if (!priceNum || priceNum < 100) { setError("가격을 100원 이상 입력해주세요."); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/market/items/${item.id}`, {
        method:  "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          title:       title.trim(),
          description: description.trim(),
          price_krw:   priceNum,
          category_id: categoryId || null,
          image_url:   imageUrl,
          is_active:   item.is_active,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "저장 실패")
      onSave(data.item)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  const selectedCat = categories.find(c => c.id === categoryId)

  return (
    <div className="border-t border-border bg-secondary/10 px-4 py-4 space-y-3">
      {/* 이미지 */}
      <div className="flex gap-3 items-start">
        <div
          className="w-20 h-20 rounded-lg border-2 border-dashed border-border relative overflow-hidden shrink-0 cursor-pointer hover:border-primary/50 transition-colors bg-secondary/30"
          onClick={() => fileRef.current?.click()}
        >
          {imagePreview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imagePreview} alt="preview" className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="flex items-center justify-center h-full">
              <ImageIcon className="w-5 h-5 text-muted-foreground" />
            </div>
          )}
          {uploading && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-white animate-spin" />
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
        <div className="flex-1 space-y-2">
          {/* 제목 */}
          <input
            type="text" value={title} onChange={e => setTitle(e.target.value)}
            placeholder="제목" maxLength={80}
            className="w-full h-9 px-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/50"
          />
          {/* 카테고리 + 가격 */}
          <div className="flex gap-2">
            <div className="relative flex-1">
              <button
                type="button"
                onClick={() => setCatOpen(v => !v)}
                className="w-full h-9 px-3 flex items-center justify-between text-xs bg-background border border-border rounded-lg hover:border-primary/40 text-foreground"
              >
                <span className={selectedCat ? "text-foreground" : "text-muted-foreground/50"}>
                  {selectedCat ? `${selectedCat.icon} ${selectedCat.name}` : "카테고리"}
                </span>
                <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
              </button>
              {catOpen && (
                <div className="absolute z-30 top-full mt-1 left-0 right-0 rounded-xl border border-border bg-background shadow-xl overflow-hidden">
                  <button type="button" onClick={() => { setCategoryId(""); setCatOpen(false) }}
                    className="w-full text-left px-3 py-2 text-xs text-muted-foreground hover:bg-secondary">선택 안함</button>
                  {categories.map(cat => (
                    <button key={cat.id} type="button"
                      onClick={() => { setCategoryId(cat.id); setCatOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 ${cat.id === categoryId ? "bg-primary/10 text-primary" : "hover:bg-secondary text-foreground"}`}>
                      <span>{cat.icon}</span>{cat.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative w-28">
              <input
                type="text" inputMode="numeric" value={price}
                onChange={e => {
                  const v = e.target.value.replace(/[^0-9]/g, "")
                  setPrice(v ? Number(v).toLocaleString("ko-KR") : "")
                }}
                placeholder="가격"
                className="w-full h-9 pl-3 pr-6 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/50"
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">원</span>
            </div>
          </div>
        </div>
      </div>
      {/* 설명 */}
      <textarea
        value={description} onChange={e => setDesc(e.target.value)}
        placeholder="상품 설명 (선택)" rows={3} maxLength={1000}
        className="w-full px-3 py-2 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/50 resize-none"
      />
      {/* 에러 */}
      {error && (
        <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}
      {/* 버튼 */}
      <div className="flex gap-2">
        <button onClick={onCancel}
          className="flex-1 h-8 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
          취소
        </button>
        <button onClick={handleSave} disabled={saving || uploading}
          className="flex-1 h-8 rounded-lg bg-primary text-black text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-primary/90 disabled:opacity-60 transition-colors">
          {saving ? <><Loader2 className="w-3 h-3 animate-spin" />저장 중</> : <><CheckCircle className="w-3 h-3" />저장</>}
        </button>
      </div>
    </div>
  )
}

// ── 메인 패널 ────────────────────────────────────────────────────
export default function MyMarketItemsPanel({ onUploadNew }: { onUploadNew: () => void }) {
  const [items, setItems]           = useState<MarketItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading]       = useState(false)
  const [editingId, setEditingId]   = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmId, setConfirmId]   = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/market/items?mine=true", {
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      const data = await res.json()
      setItems(data.items ?? [])
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => {
    load()
    fetch("/api/market/categories")
      .then(r => r.json())
      .then(d => setCategories((d.categories ?? []).filter((c: Category) => c.name !== "전체")))
      .catch(() => {})
    // 새 상품 등록 후 목록 자동 갱신
    window.addEventListener("market:item:created", load)
    return () => window.removeEventListener("market:item:created", load)
  }, [load])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await fetch(`/api/market/items/${id}`, {
        method:  "DELETE",
        headers: { Authorization: `Bearer ${getToken()}` },
      })
      setItems(prev => prev.filter(i => i.id !== id))
    } catch {}
    setDeletingId(null)
    setConfirmId(null)
  }

  const handleToggleActive = async (item: MarketItem) => {
    const res = await fetch(`/api/market/items/${item.id}`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
      body: JSON.stringify({ ...item, is_active: !item.is_active, category_id: item.category_id }),
    })
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, is_active: !i.is_active } : i))
    }
  }

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Package className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-bold text-foreground">내 상품 목록</h3>
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-secondary text-muted-foreground font-medium">
            {items.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button onClick={onUploadNew}
            className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-primary text-black text-xs font-bold hover:bg-primary/90 transition-colors">
            <Plus className="w-3.5 h-3.5" />
            새 상품
          </button>
        </div>
      </div>

      {/* 목록 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Package className="w-8 h-8 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">등록한 상품이 없습니다.</p>
          <button onClick={onUploadNew}
            className="mt-1 text-xs text-primary hover:underline">
            첫 상품 등록하기
          </button>
        </div>
      ) : (
        <div className="divide-y divide-border">
          {items.map(item => (
            <div key={item.id}>
              {/* 상품 행 */}
              <div className="flex items-center gap-3 px-4 py-3">
                {/* 썸네일 */}
                <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-secondary">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={blobImageUrl(item.image_url)!} alt={item.title} loading="lazy" decoding="async" className="object-cover w-full h-full" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                    </div>
                  )}
                </div>
                {/* 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground truncate">{item.title}</p>
                    {!item.is_active && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/10 text-destructive font-medium shrink-0">
                        비활성
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="text-xs font-bold text-primary">
                      ₩{item.price_krw.toLocaleString()}
                    </span>
                    {item.market_categories && (
                      <span className="text-[10px] text-muted-foreground">
                        {item.market_categories.icon} {item.market_categories.name}
                      </span>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      구매 {item.order_count} · 조회 {item.view_count}
                    </span>
                  </div>
                </div>
                {/* 액션 버튼 */}
                <div className="flex items-center gap-1 shrink-0">
                  {/* 활성/비활성 토글 */}
                  <button
                    onClick={() => handleToggleActive(item)}
                    title={item.is_active ? "비활성화" : "활성화"}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    {item.is_active
                      ? <Eye className="w-3.5 h-3.5" />
                      : <EyeOff className="w-3.5 h-3.5" />}
                  </button>
                  {/* 수정 */}
                  <button
                    onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                    title="수정"
                    className={`p-1.5 rounded-lg transition-colors ${editingId === item.id ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground hover:bg-secondary"}`}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {/* 삭제 */}
                  {confirmId === item.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleDelete(item.id)} disabled={deletingId === item.id}
                        className="h-6 px-2 rounded-md bg-destructive text-white text-[10px] font-bold hover:bg-destructive/90 disabled:opacity-60 transition-colors">
                        {deletingId === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "삭제"}
                      </button>
                      <button onClick={() => setConfirmId(null)}
                        className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmId(item.id)} title="삭제"
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {/* 수정 폼 (인라인 펼침) */}
              {editingId === item.id && (
                <EditItemForm
                  item={item}
                  categories={categories}
                  onSave={updated => {
                    setItems(prev => prev.map(i => i.id === updated.id ? { ...i, ...updated } : i))
                    setEditingId(null)
                  }}
                  onCancel={() => setEditingId(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
