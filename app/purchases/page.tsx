"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  ShoppingBag, TrendingDown, Gift, RefreshCw,
  AlertCircle, ExternalLink, MessageSquare, ChevronDown, ChevronUp,
} from "lucide-react"
import { useTranslation } from "@/lib/i18n"

function getToken() { try { return localStorage.getItem("app_token") } catch { return null } }

// ─── StatCard ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon }: {
  label: string; value: string; sub?: string; icon: React.ReactNode
}) {
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

// ─── OrderRow ─────────────────────────────────────────────────────────────────
function OrderRow({ order }: { order: any }) {
  const [expanded, setExpanded] = useState(false)
  const { t } = useTranslation()
  const item      = order.market_items
  const date      = order.paid_at ?? order.created_at
  const isPoint   = !!(item?.market_categories?.balance_only)

  const STATUS_MAP: Record<string, { label: string; className: string }> = {
    pending:  { label: t("purchases.statusPending") as string, className: "bg-yellow-500/15 text-yellow-500" },
    approved: { label: t("purchases.statusDone") as string,    className: "bg-primary/15 text-primary" },
    paid:     { label: t("purchases.statusDone") as string,    className: "bg-primary/15 text-primary" },
    rejected: { label: t("purchases.statusRejected") as string, className: "bg-destructive/15 text-destructive" },
  }
  const status = STATUS_MAP[order.status] ?? { label: order.status, className: "bg-secondary text-muted-foreground" }

  return (
    <div className="border-b border-border last:border-0">
      {/* 메인 행 */}
      <div className="px-4 py-3.5 flex items-center gap-3">
        {/* 썸네일 */}
        {item?.image_url ? (
          <img
            src={item.image_url}
            alt={item.title}
            className="w-10 h-10 rounded-lg object-cover shrink-0 border border-border"
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-secondary shrink-0 flex items-center justify-center">
            <ShoppingBag className="w-4 h-4 text-muted-foreground/50" />
          </div>
        )}

        {/* 상품명 + 날짜 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-medium text-foreground truncate">{item?.title ?? "—"}</p>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${status.className}`}>
              {status.label}
            </span>
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
              isPoint
                ? "bg-blue-500/15 text-blue-400"
                : "bg-secondary text-muted-foreground"
            }`}>
              {isPoint ? "포인트" : "일반결제"}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
            {new Date(date).toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" })}
            {" "}
            {new Date(date).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>

        {/* 금액 + 액션 */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="text-right">
            <p className="text-sm font-bold text-foreground tabular-nums">
              ₩{(order.price_krw ?? 0).toLocaleString()}
            </p>
            {(order.bonus_amount ?? 0) > 0 && (
              <p className="text-[10px] text-primary font-medium tabular-nums">
                +₩{order.bonus_amount.toLocaleString()} 적립
              </p>
            )}
          </div>
          {/* 외부 링크 */}
          {item?.link_url && (order.status === "approved" || order.status === "paid") && (
            <a
              href={item.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-7 h-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          {/* 상세 토글 */}
          {(order.memo || order.reject_reason) && (
            <button
              onClick={() => setExpanded(v => !v)}
              className="w-7 h-7 flex items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
            >
              {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>
      </div>

      {/* 펼침 영역 — 메모 / 거절 사유 */}
      {expanded && (
        <div className="px-4 pb-3.5 space-y-2">
          {order.memo && (
            <div className="flex items-start gap-2 rounded-lg bg-secondary/40 border border-border px-3 py-2.5">
              <MessageSquare className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] text-muted-foreground font-medium mb-0.5">{t("purchases.memo")}</p>
                <p className="text-xs text-foreground">{order.memo}</p>
              </div>
            </div>
          )}
          {order.reject_reason && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/5 border border-destructive/20 px-3 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] text-destructive font-medium mb-0.5">{t("purchases.rejectReason")}</p>
                <p className="text-xs text-foreground">{order.reject_reason}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 메인 페이지 ──────────────────────────────────────────────────────────────
export default function PurchasesPage() {
  const router = useRouter()
  const { t } = useTranslation()
  const [loading, setLoading] = useState(true)
  const [orders,  setOrders]  = useState<any[]>([])
  const [tab,     setTab]     = useState<"all" | "approved" | "pending" | "rejected">("all")

  const load = useCallback(async () => {
    const token = getToken()
    if (!token) { router.push("/"); return }
    setLoading(true)
    try {
      const res = await fetch("/api/market/orders?mode=buyer", {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) { router.push("/"); return }
      const data = await res.json()
      setOrders(data.orders ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── 집계 ──────────────────────────────────────────────────────────
  const doneOrders    = orders.filter(o => o.status === "approved" || o.status === "paid")
  const pendingOrders = orders.filter(o => o.status === "pending")
  const totalSpent    = doneOrders.reduce((s, o) => s + (o.price_krw ?? 0), 0)
  const totalBonus    = doneOrders.reduce((s, o) => s + (o.bonus_amount ?? 0), 0)

  const filtered = tab === "all"      ? orders
                 : tab === "approved" ? orders.filter(o => o.status === "approved" || o.status === "paid")
                 : tab === "pending"  ? orders.filter(o => o.status === "pending")
                 : orders.filter(o => o.status === "rejected")

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="text-foreground">
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-primary" />
              {t("purchases.title")}
            </h1>
            <p className="text-xs text-muted-foreground mt-1">{t("purchases.desc")}</p>
          </div>
          <button
            onClick={load}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard
            label={t("purchases.totalSpent") as string}
            value={`₩${totalSpent.toLocaleString()}`}
            sub={`${doneOrders.length}${t("purchases.doneSub")}`}
            icon={<TrendingDown className="w-4 h-4" />}
          />
          <StatCard
            label={t("purchases.pending") as string}
            value={`${pendingOrders.length}건`}
            sub={t("purchases.pendingSub") as string}
            icon={<ShoppingBag className="w-4 h-4" />}
          />
          <StatCard
            label={t("purchases.bonus") as string}
            value={`₩${totalBonus.toLocaleString()}`}
            sub={t("purchases.bonusSub") as string}
            icon={<Gift className="w-4 h-4" />}
          />
        </div>

        {/* 탭 */}
        <div className="flex border-b border-border gap-1">
          {([
            { key: "all",      label: `${t("purchases.tabAll")} (${orders.length})` },
            { key: "approved", label: `${t("purchases.tabDone")} (${doneOrders.length})` },
            { key: "pending",  label: `${t("purchases.tabPending")} (${pendingOrders.length})` },
            { key: "rejected", label: `${t("purchases.tabRejected")} (${orders.filter(o => o.status === "rejected").length})` },
          ] as const).map(tabItem => (
            <button
              key={tabItem.key}
              onClick={() => setTab(tabItem.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === tabItem.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tabItem.label}
            </button>
          ))}
        </div>

        {/* 주문 목록 */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {filtered.length === 0 ? (
            <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
              <ShoppingBag className="w-8 h-8 opacity-30" />
              <p className="text-sm">{t("purchases.empty")}</p>
            </div>
          ) : (
            <div>
              {filtered.map(order => (
                <OrderRow key={order.id} order={order} />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
