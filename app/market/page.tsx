"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Search, TrendingUp, ArrowUpDown, Clock, Flame, Plus, X } from "lucide-react"
import Link from "next/link"
import Image from "next/image"
import { cn } from "@/lib/utils"
import MarketAdminPanel from "@/components/market/market-admin-panel"

interface Category { id: string; name: string; icon: string }
interface Item {
  id: string; title: string; description: string
  image_url: string | null; price_krw: number
  view_count: number; order_count: number; created_at: string
  category_id: string | null
  market_categories: { name: string; icon: string } | null
  profiles: { username: string; role: string } | null
}

const SORT_OPTIONS = [
  { key: "popular",    label: "인기순",   icon: Flame },
  { key: "newest",     label: "최신순",   icon: Clock },
  { key: "price_asc",  label: "낮은 가격", icon: ArrowUpDown },
  { key: "price_desc", label: "높은 가격", icon: TrendingUp },
] as const

function getToken() {
  try { return localStorage.getItem("app_token") } catch { return null }
}
function parseRole() {
  try {
    const t = localStorage.getItem("app_token")
    if (!t) return null
    const p = JSON.parse(atob(t.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")))
    return p.role ?? null
  } catch { return null }
}

export default function MarketPage() {
  const [categories, setCategories]   = useState<Category[]>([])
  const [items, setItems]             = useState<Item[]>([])
  const [activeCat, setActiveCat]     = useState<string>("all")
  const [sort, setSort]               = useState<string>("popular")
  const [q, setQ]                     = useState("")
  const [loading, setLoading]         = useState(true)
  const [showAdmin, setShowAdmin]     = useState(false)
  const [role, setRole]               = useState<string | null>(null)
  const debounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setRole(parseRole()) }, [])

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
    <div className="min-h-screen bg-background">
      {/* 상단 검색 + 필터 바 */}
      <div className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3 space-y-3">
          {/* 검색 + 관리자 버튼 */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="상품 검색..."
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

            {/* 정렬 버튼 */}
            <div className="flex items-center gap-1">
              {SORT_OPTIONS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setSort(key)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    sort === key
                      ? "bg-primary/15 text-primary border border-primary/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary border border-transparent"
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{label}</span>
                </button>
              ))}
            </div>

            {role === "master" && (
              <button
                onClick={() => setShowAdmin(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-black text-xs font-semibold hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                상품 등록
              </button>
            )}
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
              <span>🏪</span> 전체
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
        {/* 마스터 상품 등록 패널 */}
        {showAdmin && role === "master" && (
          <MarketAdminPanel
            categories={categories.filter(c => c.name !== "전체")}
            onClose={() => setShowAdmin(false)}
            onSuccess={() => { setShowAdmin(false); fetchItems(activeCat, sort, q) }}
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
            {items.map(item => (
              <MarketItemCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MarketItemCard({ item }: { item: Item }) {
  return (
    <Link
      href={`/market/${item.id}`}
      className="group rounded-xl border border-border bg-secondary/20 overflow-hidden hover:border-primary/40 transition-all duration-200 hover:-translate-y-0.5"
    >
      {/* 이미지 영역 */}
      <div className="relative aspect-square bg-secondary overflow-hidden">
        {item.image_url ? (
          <Image
            src={item.image_url}
            alt={item.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-4xl">
            {item.market_categories?.icon ?? "📦"}
          </div>
        )}
        {/* 카테고리 뱃지 */}
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
    </Link>
  )
}
