"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowUpRight, RefreshCw } from "lucide-react"
import IndicatorFeed from "@/components/market/indicator-feed"

interface Category { id: string; name: string }
interface BoardItem {
  id: string
  title: string
  description: string
  image_url: string | null
  price_krw: number
  created_at: string
  category_id: string | null
  profiles: { username: string; role: string } | null
}

function getToken() {
  try { return localStorage.getItem("app_token") } catch { return null }
}

export default function TradingBoardColumn() {
  const [categories, setCategories] = useState<Category[]>([])
  const [items, setItems] = useState<BoardItem[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<"newest" | "popular">("newest")
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const boardIds = useMemo(() => new Set(categories.filter((category) => {
    const name = category.name.toLowerCase()
    return name.includes("지표") || name.includes("indicator") || name.includes("게시판") || name.includes("board") || name.includes("채널") || name.includes("channel")
  }).map((category) => category.id)), [categories])

  const load = async (nextSort = sort, nextPage = page) => {
    setLoading(true)
    try {
      const [categoryResponse, itemResponse] = await Promise.all([
        fetch("/api/market/categories"),
        fetch(`/api/market/items?sort=${nextSort}&limit=10&offset=${(nextPage - 1) * 10}`),
      ])
      const categoryData = categoryResponse.ok ? await categoryResponse.json() : { categories: [] }
      const itemData = itemResponse.ok ? await itemResponse.json() : { items: [] }
      const nextCategories: Category[] = categoryData.categories ?? []
      const nextIds = new Set(nextCategories.filter((category) => {
        const name = category.name.toLowerCase()
        return name.includes("지표") || name.includes("indicator") || name.includes("게시판") || name.includes("board") || name.includes("채널") || name.includes("channel")
      }).map((category) => category.id))
      setCategories(nextCategories)
      setHasMore(Boolean(itemData.hasMore))
      setItems((itemData.items ?? []).filter((item: BoardItem) => item.category_id && nextIds.has(item.category_id)))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  return (
    <aside className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div>
          <p className="text-sm font-bold text-foreground">트레이딩 피드</p>
          <p className="text-xs text-muted-foreground">시장 지표와 게시판을 한눈에</p>
        </div>
        <div className="flex items-center gap-1">
          <div className="mr-1 flex rounded-lg border border-border p-0.5" role="group" aria-label="피드 정렬"><button type="button" onClick={() => { setSort("newest"); setPage(1); void load("newest", 1) }} className={`rounded-md px-2 py-1 text-[10px] font-semibold ${sort === "newest" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>최신순</button><button type="button" onClick={() => { setSort("popular"); setPage(1); void load("popular", 1) }} className={`rounded-md px-2 py-1 text-[10px] font-semibold ${sort === "popular" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>인기순</button></div>
          <button type="button" onClick={() => void load()} className="rounded-lg p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground" aria-label="피드 새로고침">
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <Link href="/market?category=indicator" className="rounded-lg p-2 text-muted-foreground transition hover:bg-accent hover:text-foreground" aria-label="게시판 전체 보기">
            <ArrowUpRight className="size-4" />
          </Link>
        </div>
      </header>
      <div className="max-h-[calc(100vh-10rem)] overflow-y-auto px-4 pt-4">
        {loading ? <div className="py-20 text-center text-sm text-muted-foreground">피드를 불러오는 중...</div> : <IndicatorFeed items={items} token={getToken()} hasMore={hasMore} page={page} onPageChange={(nextPage) => { setPage(nextPage); void load(sort, nextPage) }} />}
      </div>
    </aside>
  )
}
