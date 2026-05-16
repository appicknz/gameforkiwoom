"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { CheckCircle, XCircle, Clock, RefreshCw, ShoppingBag, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"

interface Order {
  id: string
  status: "pending" | "approved" | "rejected" | "cancelled"
  price_krw: number
  paid_at: string | null
  created_at: string
  reject_reason: string | null
  market_items: { id: string; title: string; image_url: string | null } | null
  buyer: { username: string } | null
}

const STATUS_CONFIG = {
  pending:   { label: "결제 대기", icon: Clock,       color: "text-amber-400"  },
  approved:  { label: "승인 완료", icon: CheckCircle, color: "text-green-400"  },
  rejected:  { label: "거절됨",   icon: XCircle,     color: "text-red-400"    },
  cancelled: { label: "취소됨",   icon: XCircle,     color: "text-gray-400"   },
}

function getToken() { try { return localStorage.getItem("app_token") } catch { return null } }

export default function ManageOrdersPage() {
  const router = useRouter()
  const [orders, setOrders]       = useState<Order[]>([])
  const [loading, setLoading]     = useState(true)
  const [actioning, setActioning] = useState<string | null>(null)
  const [rejectId, setRejectId]   = useState<string | null>(null)
  const [reason, setReason]       = useState("")
  const [filter, setFilter]       = useState<"all" | "pending" | "approved" | "rejected">("pending")

  const fetchOrders = useCallback(async () => {
    const token = getToken()
    if (!token) { router.push("/"); return }
    setLoading(true)
    try {
      const res  = await fetch("/api/market/orders?mode=publisher", {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (res.status === 401) { router.push("/"); return }
      setOrders(data.orders ?? [])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchOrders() }, [fetchOrders])

  const handleAction = async (orderId: string, action: "approved" | "rejected", rejectReason = "") => {
    setActioning(orderId)
    const token = getToken()
    try {
      await fetch(`/api/market/orders/${orderId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, reject_reason: rejectReason }),
      })
      setRejectId(null); setReason("")
      await fetchOrders()
    } finally { setActioning(null) }
  }

  const filtered = filter === "all" ? orders : orders.filter(o => o.status === filter)
  const counts   = {
    all:      orders.length,
    pending:  orders.filter(o => o.status === "pending" && o.paid_at).length,
    approved: orders.filter(o => o.status === "approved").length,
    rejected: orders.filter(o => o.status === "rejected").length,
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-primary" />
            <h1 className="text-xl font-bold text-foreground">주문 관리</h1>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/market" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
              마켓으로
            </Link>
            <button
              onClick={fetchOrders}
              className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* 필터 탭 */}
        <div className="flex items-center gap-1.5">
          {(["pending", "all", "approved", "rejected"] as const).map(f => (
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
              {f === "all" ? "전체" : f === "pending" ? "대기" : f === "approved" ? "승인" : "거절"}
              <span className="ml-1 opacity-70">({counts[f]})</span>
            </button>
          ))}
        </div>

        {/* 주문 목록 */}
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">주문이 없습니다.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map(order => {
              const cfg  = STATUS_CONFIG[order.status]
              const Icon = cfg.icon
              const isPendingPaid = order.status === "pending" && !!order.paid_at
              return (
                <div key={order.id} className="rounded-xl border border-border bg-secondary/20 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <p className="text-sm font-semibold text-foreground line-clamp-1">
                        {order.market_items?.title ?? "상품"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        구매자: <span className="text-foreground">{order.buyer?.username}</span>
                      </p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {new Date(order.created_at).toLocaleString("ko-KR")}
                      </p>
                    </div>
                    <div className="shrink-0 text-right space-y-1">
                      <p className="text-sm font-bold text-primary tabular-nums">
                        {order.price_krw.toLocaleString("ko-KR")}원
                      </p>
                      <div className={cn("flex items-center gap-1 text-xs font-medium", cfg.color)}>
                        <Icon className="w-3.5 h-3.5" />
                        {isPendingPaid ? "승인 대기" : cfg.label}
                      </div>
                    </div>
                  </div>

                  {order.reject_reason && (
                    <p className="text-xs text-red-400 bg-red-400/10 rounded-lg px-3 py-2">
                      거절 사유: {order.reject_reason}
                    </p>
                  )}

                  {/* 거절 사유 입력창 */}
                  {rejectId === order.id && (
                    <div className="space-y-2">
                      <input
                        type="text"
                        placeholder="거절 사유 입력..."
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-red-400"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAction(order.id, "rejected", reason)}
                          disabled={!reason.trim() || actioning === order.id}
                          className="flex-1 py-1.5 rounded-lg bg-red-500/80 text-white text-xs font-semibold hover:bg-red-500 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
                        >
                          {actioning === order.id && <Loader2 className="w-3 h-3 animate-spin" />}
                          거절 확정
                        </button>
                        <button
                          onClick={() => { setRejectId(null); setReason("") }}
                          className="px-3 py-1.5 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 승인/거절 버튼 (결제 완료 + pending만) */}
                  {isPendingPaid && rejectId !== order.id && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleAction(order.id, "approved")}
                        disabled={!!actioning}
                        className="flex-1 py-2 rounded-lg bg-green-500/20 text-green-400 border border-green-500/30 text-xs font-semibold hover:bg-green-500/30 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                      >
                        {actioning === order.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                        승인
                      </button>
                      <button
                        onClick={() => setRejectId(order.id)}
                        disabled={!!actioning}
                        className="flex-1 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold hover:bg-red-500/30 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        거절
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
