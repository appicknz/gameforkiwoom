"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { blobImageUrl } from "@/lib/blob-image"
import {
  ArrowLeft, ExternalLink, ShoppingCart, Eye, Users,
  Loader2, CheckCircle, XCircle, Clock
} from "lucide-react"

interface Item {
  id: string; title: string; description: string
  image_url: string | null; link_url: string | null
  price_krw: number; stripe_price_id: string | null
  view_count: number; order_count: number; created_at: string
  market_categories: { name: string; icon: string } | null
  profiles: { id: string; username: string; role: string } | null
}

function getToken() {
  try { return localStorage.getItem("app_token") } catch { return null }
}

export default function MarketItemPage() {
  const { id }     = useParams<{ id: string }>()
  const router     = useRouter()
  const [item, setItem]           = useState<Item | null>(null)
  const [loading, setLoading]     = useState(true)
  const [buying, setBuying]       = useState(false)
  const [buyErr, setBuyErr]       = useState("")
  const [isLoggedIn, setLoggedIn] = useState(false)

  useEffect(() => {
    setLoggedIn(!!getToken())
    fetch(`/api/market/items/${id}`)
      .then(r => r.json())
      .then(d => setItem(d.item ?? null))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [id])

  const handleBuy = async () => {
    if (!isLoggedIn) { router.push("/"); return }
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
    } catch {
      setBuyErr("결제 오류가 발생했습니다.")
    } finally {
      setBuying(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    )
  }
  if (!item) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">상품을 찾을 수 없습니다.</p>
        <Link href="/market" className="text-primary text-sm hover:underline">마켓으로 돌아가기</Link>
      </div>
    )
  }

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

            {/* 링크 */}
            {item.link_url && (
              <a
                href={item.link_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
              >
                <ExternalLink className="w-3.5 h-3.5" /> 관련 링크
              </a>
            )}

            {/* 가격 + 구매 */}
            <div className="rounded-xl border border-border bg-secondary/30 p-4 space-y-4">
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-bold text-primary">
                  {item.price_krw.toLocaleString("ko-KR")}
                </span>
                <span className="text-lg text-primary">원</span>
              </div>

              {buyErr && (
                <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
                  <XCircle className="w-3.5 h-3.5 shrink-0" />
                  {buyErr}
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
