"use client"

import { useState, useEffect, useCallback } from "react"
import { ShoppingBag, ChevronRight, CheckCircle, XCircle, Clock, RefreshCw } from "lucide-react"
import { cn } from "@/lib/utils"
import Link from "next/link"

interface Order {
  id: string
  status: "pending" | "approved" | "rejected" | "cancelled"
  price_krw: number
  paid_at: string | null
  approved_at: string | null
  rejected_at: string | null
  reject_reason: string | null
  created_at: string
  market_items: { id: string; title: string; image_url: string | null } | null
  publisher: { username: string } | null
}

const STATUS_CONFIG = {
  pending:   { label: "승인 대기", icon: Clock,       color: "text-amber-400",   bg: "bg-amber-400/10"  },
  approved:  { label: "승인 완료", icon: CheckCircle, color: "text-green-400",   bg: "bg-green-400/10"  },
  rejected:  { label: "거절됨",   icon: XCircle,     color: "text-red-400",     bg: "bg-red-400/10"    },
  cancelled: { label: "취소됨",   icon: XCircle,     color: "text-gray-400",    bg: "bg-gray-400/10"   },
}

function getToken() {
  try { return localStorage.getItem("app_token") } catch { return null }
}

export default function SidebarOrders() {
  const [orders, setOrders]   = useState<Order[]>([])
  const [open, setOpen]       = useState(true)
  const [loading, setLoading] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)

  const fetchOrders = useCallback(async () => {
    const token = getToken()
    if (!token) return
    setLoading(true)
    try {
      const res  = await fetch("/api/market/orders?mode=buyer", {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setOrders(data.orders ?? [])
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    const token = getToken()
    setLoggedIn(!!token)
    if (token) fetchOrders()

    const onLogin = () => { setLoggedIn(true); fetchOrders() }
    window.addEventListener("auth:login", onLogin)
    // 30초마다 폴링 (실시간 상태 반영)
    const interval = setInterval(() => { if (getToken()) fetchOrders() }, 30_000)
    return () => {
      window.removeEventListener("auth:login", onLogin)
      clearInterval(interval)
    }
  }, [fetchOrders])

  if (!loggedIn) return null

  // 최근 5개만 표시
  const recent = orders.slice(0, 5)
  const pendingCount = orders.filter(o => o.status === "pending").length

  return (
    <div className="space-y-2 px-1">
      {/* 헤더 */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-1.5">
          <ShoppingBag className="w-3 h-3 text-primary shrink-0" />
          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            내 구매현황
          </span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-amber-400/20 text-amber-400 text-[9px] font-bold">
              {pendingCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span
            role="button"
            tabIndex={0}
            onClick={e => { e.stopPropagation(); fetchOrders() }}
            onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); fetchOrders() } }}
            className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <RefreshCw className={cn("w-2.5 h-2.5", loading && "animate-spin")} />
          </span>
          <ChevronRight className={cn("w-3 h-3 text-muted-foreground transition-transform", open && "rotate-90")} />
        </div>
      </button>

      {open && (
        <div className="space-y-1.5">
          {recent.length === 0 ? (
            <p className="text-[10px] text-muted-foreground text-center py-2">구매 내역이 없습니다.</p>
          ) : (
            recent.map(order => {
              const cfg  = STATUS_CONFIG[order.status] ?? STATUS_CONFIG.pending
              const Icon = cfg.icon
              return (
                <div
                  key={order.id}
                  className="rounded-lg border border-border bg-background/40 p-2 space-y-1"
                >
                  <p className="text-[10px] font-medium text-foreground line-clamp-1">
                    {order.market_items?.title ?? "상품"}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className={cn("flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-medium", cfg.bg, cfg.color)}>
                      <Icon className="w-2.5 h-2.5" />
                      {cfg.label}
                    </div>
                    <span className="text-[10px] text-muted-foreground tabular-nums">
                      {order.price_krw.toLocaleString("ko-KR")}원
                    </span>
                  </div>
                  {order.status === "rejected" && order.reject_reason && (
                    <p className="text-[9px] text-red-400 line-clamp-1">{order.reject_reason}</p>
                  )}
                </div>
              )
            })
          )}

          {orders.length > 5 && (
            <Link
              href="/market/my-orders"
              className="block text-center text-[10px] text-primary hover:underline py-1"
            >
              전체 보기 ({orders.length}개)
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
