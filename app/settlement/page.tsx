"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import {
  Banknote, TrendingUp, ShoppingBag, Gift,
  Plus, RefreshCw, X, AlertCircle, CreditCard,
} from "lucide-react"

function getToken() { try { return localStorage.getItem("app_token") } catch { return null } }
function parseJwt(token: string) {
  try { return JSON.parse(atob(token.split(".")[1])) } catch { return null }
}
const SELLER_ROLES = ["master", "super_admin", "branch_admin", "admin", "seller"]

// ─── 통계 카드 (seller/page.tsx 와 동일 구조) ──────────────────────────
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

export default function SettlementPage() {
  const router = useRouter()

  const [loading,           setLoading]           = useState(true)
  const [orders,            setOrders]            = useState<any[]>([])
  const [items,             setItems]             = useState<any[]>([])
  const [settlementMethods, setSettlementMethods] = useState<any[]>([])
  const [tab,               setTab]               = useState<"history" | "methods">("history")

  // 정산수단 폼
  const [showMethodForm, setShowMethodForm] = useState(false)
  const [methodForm,     setMethodForm]     = useState({ item: "", info: "" })
  const [methodSaving,   setMethodSaving]   = useState(false)
  const [methodErr,      setMethodErr]      = useState<string | null>(null)

  const load = useCallback(async () => {
    const token = getToken()
    if (!token) { router.push("/"); return }
    const jwt = parseJwt(token)
    const r = jwt?.role ?? null

    if (!r || !SELLER_ROLES.includes(r)) {
      try {
        const permRes = await fetch("/api/market/write-permission", {
          headers: { Authorization: `Bearer ${token}` },
        })
        const permData = await permRes.json()
        if (permData?.request?.status !== "approved") { router.push("/"); return }
      } catch { router.push("/"); return }
    }

    setLoading(true)
    try {
      const res = await fetch("/api/seller/stats", { headers: { Authorization: `Bearer ${token}` } })
      if (!res.ok) { router.push("/"); return }
      const data = await res.json()
      setOrders(data.orders ?? [])
      setItems(data.items ?? [])
      setSettlementMethods(data.settlementMethods ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // ── 정산수단 저장 ──────────────────────────────────────────────────
  const handleSaveMethod = async () => {
    const token = getToken()
    if (!token) return
    setMethodSaving(true); setMethodErr(null)
    try {
      const res = await fetch("/api/seller/settlement-methods", {
        method:  "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body:    JSON.stringify(methodForm),
      })
      const data = await res.json()
      if (!res.ok) { setMethodErr(data.error ?? "오류가 발생했습니다."); return }
      setSettlementMethods(prev => [data.method, ...prev])
      setMethodForm({ item: "", info: "" })
      setShowMethodForm(false)
    } catch { setMethodErr("네트워크 오류") }
    finally  { setMethodSaving(false) }
  }

  const handleDeleteMethod = async (id: string) => {
    const token = getToken()
    if (!token) return
    await fetch("/api/seller/settlement-methods", {
      method:  "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body:    JSON.stringify({ id }),
    })
    setSettlementMethods(prev => prev.filter(m => m.id !== id))
  }

  // ── 집계 ──────────────────────────────────────────────────────────
  const paidOrders    = orders.filter(o => o.status === "paid" || o.status === "approved")
  const totalRevenue  = paidOrders.reduce((s, o) => s + (o.price_krw ?? o.amount_krw ?? 0), 0)
  const totalBonus    = paidOrders.reduce((s, o) => s + (o.bonus_amount ?? 0), 0)
  const totalOrders   = paidOrders.length

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
              <Banknote className="w-5 h-5 text-primary" />
              정산 관리
            </h1>
            <p className="text-xs text-muted-foreground mt-1">판매 수익 정산 내역과 정산수단을 관리합니다.</p>
          </div>
          <button
            onClick={() => load()}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <StatCard
            label="총 정산 금액"
            value={`₩${totalRevenue.toLocaleString()}`}
            icon={<TrendingUp className="w-4 h-4" />}
          />
          <StatCard
            label="총 판매 건수"
            value={`${totalOrders}건`}
            icon={<ShoppingBag className="w-4 h-4" />}
          />
          <StatCard
            label="총 보너스 지급액"
            value={`₩${totalBonus.toLocaleString()}`}
            sub="구매자 적립 합계"
            icon={<Gift className="w-4 h-4" />}
          />
        </div>

        {/* 탭 */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setTab("history")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "history"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            정산 내역 ({totalOrders})
          </button>
          <button
            onClick={() => setTab("methods")}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === "methods"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            정산수단 ({settlementMethods.length})
          </button>
        </div>

        {/* ── 정산 내역 탭 ── */}
        {tab === "history" && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {paidOrders.length === 0 ? (
              <div className="py-16 flex flex-col items-center gap-2 text-muted-foreground">
                <AlertCircle className="w-8 h-8 opacity-30" />
                <p className="text-sm">정산 내역이 없습니다.</p>
              </div>
            ) : (
              <>
                {/* 테이블 헤더 */}
                <div className="grid grid-cols-4 px-4 py-2.5 bg-secondary/40 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                  <span>일자</span>
                  <span className="text-right">판매 금액</span>
                  <span className="text-right">보너스 지급액</span>
                  <span className="text-right">상품명</span>
                </div>

                {/* 테이블 바디 */}
                <div className="divide-y divide-border">
                  {paidOrders.map(order => {
                    const item = items.find(i => i.id === order.item_id)
                    const date = order.paid_at ?? order.created_at
                    return (
                      <div key={order.id} className="grid grid-cols-4 px-4 py-3 items-center">
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {new Date(date).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" })}
                        </span>
                        <span className="text-right text-sm font-semibold text-foreground tabular-nums">
                          ₩{(order.price_krw ?? order.amount_krw ?? 0).toLocaleString()}
                        </span>
                        <span className="text-right tabular-nums text-sm">
                          {(order.bonus_amount ?? 0) > 0
                            ? <span className="text-primary font-medium">+₩{order.bonus_amount.toLocaleString()}</span>
                            : <span className="text-muted-foreground/40">—</span>
                          }
                        </span>
                        <span className="text-right text-xs text-muted-foreground truncate pl-2">
                          {item?.title ?? "—"}
                        </span>
                      </div>
                    )
                  })}
                </div>

                {/* 합계 행 */}
                <div className="grid grid-cols-4 px-4 py-3 border-t border-border bg-secondary/30">
                  <span className="text-xs font-bold text-muted-foreground uppercase tracking-wide">합계</span>
                  <span className="text-right text-sm font-bold text-foreground tabular-nums">
                    ₩{totalRevenue.toLocaleString()}
                  </span>
                  <span className="text-right text-sm font-bold text-primary tabular-nums">
                    +₩{totalBonus.toLocaleString()}
                  </span>
                  <span />
                </div>
              </>
            )}
          </div>
        )}

        {/* ── 정산수단 탭 ── */}
        {tab === "methods" && (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            {/* 헤더 */}
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-primary" />
                <p className="text-sm font-semibold text-foreground">정산수단 목록</p>
              </div>
              <button
                onClick={() => { setShowMethodForm(true); setMethodErr(null) }}
                className="flex items-center gap-1.5 h-7 px-3 rounded-lg bg-primary text-black text-xs font-semibold hover:bg-primary/90 transition-colors"
              >
                <Plus className="w-3 h-3" /> 정산수단 등록
              </button>
            </div>

            {/* 등록 폼 */}
            {showMethodForm && (
              <div className="px-4 py-4 border-b border-border bg-secondary/20 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-medium">항목</label>
                    <input
                      type="text"
                      placeholder="예: 카카오페이, 토스, 계좌이체"
                      value={methodForm.item}
                      onChange={e => setMethodForm(f => ({ ...f, item: e.target.value }))}
                      className="w-full h-9 px-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/50"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground font-medium">정보</label>
                    <input
                      type="text"
                      placeholder="예: 010-0000-0000, 계좌번호"
                      value={methodForm.info}
                      onChange={e => setMethodForm(f => ({ ...f, info: e.target.value }))}
                      className="w-full h-9 px-3 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary text-foreground placeholder:text-muted-foreground/50"
                    />
                  </div>
                </div>
                {methodErr && (
                  <p className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" />{methodErr}
                  </p>
                )}
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { setShowMethodForm(false); setMethodErr(null); setMethodForm({ item: "", info: "" }) }}
                    className="h-8 px-4 text-xs rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveMethod}
                    disabled={methodSaving || !methodForm.item.trim() || !methodForm.info.trim()}
                    className="h-8 px-4 text-xs rounded-lg bg-primary text-black font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {methodSaving ? "저장 중..." : "저장"}
                  </button>
                </div>
              </div>
            )}

            {/* 목록 */}
            {settlementMethods.length === 0 && !showMethodForm ? (
              <div className="py-14 flex flex-col items-center gap-2 text-muted-foreground">
                <CreditCard className="w-7 h-7 opacity-30" />
                <p className="text-sm">등록된 정산수단이 없습니다.</p>
                <button
                  onClick={() => setShowMethodForm(true)}
                  className="mt-2 flex items-center gap-1.5 h-7 px-3 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                >
                  <Plus className="w-3 h-3" /> 정산수단 등록하기
                </button>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {settlementMethods.map(m => (
                  <div key={m.id} className="px-4 py-3.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-xs font-semibold text-foreground shrink-0 bg-secondary border border-border px-2.5 py-1 rounded-md">
                        {m.item}
                      </span>
                      <span className="text-sm text-muted-foreground truncate">{m.info}</span>
                    </div>
                    <button
                      onClick={() => handleDeleteMethod(m.id)}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
