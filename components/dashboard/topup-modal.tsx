"use client"

import { useState, useEffect } from "react"
import { X, CreditCard, Wallet, Bitcoin } from "lucide-react"
import { cn } from "@/lib/utils"
import { PayRequestForm } from "@/components/pay/request-form"
import { getDefaultManager } from "@/lib/pay/actions"

const PRESETS = [30, 60, 100, 250, 500]

type Tab = "card" | "point"

interface TopupModalProps {
  open:       boolean
  onClose:    () => void
  username?:  string
  telegramId?: string
}

export function TopupModal({ open, onClose, username, telegramId }: TopupModalProps) {
  const [tab,          setTab]          = useState<Tab>("card")
  const [selected,     setSelected]     = useState<number | "custom">(100)
  const [customAmt,    setCustomAmt]    = useState("")
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState("")
  const [managerId,    setManagerId]    = useState<string | null>(null)
  const [cardDone,     setCardDone]     = useState(false)

  // 익명 계정 여부: username이 user_ 로 시작하면 익명
  const isAnonymous = !!username && /^user_[a-f0-9]{6}$/.test(username)

  useEffect(() => {
    if (open) {
      setCardDone(false)
      setError("")
      // 기본 관리자 미리 로드
      getDefaultManager().then(mgr => {
        if (mgr) setManagerId(mgr.id)
      })
    }
  }, [open])

  if (!open) return null

  const amountUsd =
    selected === "custom"
      ? parseFloat(customAmt) || 0
      : selected

  const handlePointPay = async () => {
    if (amountUsd < 1) { setError("최소 $1 이상 입력해주세요."); return }
    setError("")
    setLoading(true)
    try {
      const token = typeof window !== "undefined" ? (localStorage.getItem("app_token") ?? "") : ""
      const res   = await fetch("/api/payments/create-invoice", {
        method:  "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ amount_usd: amountUsd }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "결제 오류가 발생했습니다."); return }
      window.open(data.invoice_url, "_blank", "noopener,noreferrer")
      onClose()
    } catch {
      setError("네트워크 오류가 발생했습니다.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* 오버레이 */}
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm" onClick={onClose} />

      {/* 모달 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-sm rounded-2xl border border-border bg-[oklch(0.14_0.01_155)] shadow-2xl flex flex-col max-h-[90vh]"
          onClick={e => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">충전</span>
            </div>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-secondary transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* 탭 */}
          <div className="flex mx-5 mb-4 rounded-xl bg-secondary/40 p-1 gap-1 shrink-0">
            <button
              onClick={() => setTab("card")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-semibold transition-all",
                tab === "card"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Bitcoin className="w-3.5 h-3.5" />
              카드 결제
            </button>
            <button
              onClick={() => setTab("point")}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 h-8 rounded-lg text-xs font-semibold transition-all",
                tab === "point"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Wallet className="w-3.5 h-3.5" />
              포인트 충전
            </button>
          </div>

          {/* 탭 콘텐츠 */}
          <div className="overflow-y-auto flex-1 px-5 pb-5">
            {/* ── 카드 결제 탭: PayRequestForm 임베드 ── */}
            {tab === "card" && (
              <PayRequestForm
                resolvedManagerId={managerId ?? undefined}
                knownTgId={telegramId}
                isAnonymous={isAnonymous}
                onDone={() => setCardDone(true)}
              />
            )}

            {/* ── 포인트 충전 탭 ── */}
            {tab === "point" && (
              <>
                {/* 금액 표시 */}
                <div className="py-3 text-center">
                  <p className="text-4xl font-bold text-foreground tabular-nums">
                    US${(selected === "custom" ? parseFloat(customAmt) || 0 : selected).toFixed(2)}
                  </p>
                </div>

                {/* 금액 선택 */}
                <div className="grid grid-cols-3 gap-2 mb-3">
                  {PRESETS.map(amt => (
                    <button
                      key={amt}
                      onClick={() => setSelected(amt)}
                      className={cn(
                        "py-2 rounded-xl text-sm font-medium border transition-all",
                        selected === amt
                          ? "border-primary bg-primary text-black font-semibold"
                          : "border-border text-foreground hover:border-primary/50 hover:text-foreground",
                      )}
                    >
                      ${amt}
                    </button>
                  ))}
                  <button
                    onClick={() => setSelected("custom")}
                    className={cn(
                      "py-2 rounded-xl text-sm font-medium border transition-all",
                      selected === "custom"
                        ? "border-primary bg-primary text-black font-semibold"
                        : "border-border text-foreground hover:border-primary/50 hover:text-foreground",
                    )}
                  >
                    직접 입력
                  </button>
                </div>

                {selected === "custom" && (
                  <div className="mb-3 relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">$</span>
                    <input
                      type="number"
                      min="1"
                      placeholder="금액 입력"
                      value={customAmt}
                      onChange={e => setCustomAmt(e.target.value)}
                      className="w-full pl-7 pr-4 py-2.5 rounded-xl bg-secondary border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
                      autoFocus
                    />
                  </div>
                )}

                {/* 안내 */}
                <div className="mb-4 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/20">
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    포인트 전용 제품을 구매하기 위한 충전입니다. 결제완료 후 자동으로 반영됩니다.
                  </p>
                </div>

                {error && <p className="mb-3 text-xs text-red-400">{error}</p>}

                {/* 버튼 */}
                <div className="flex gap-2">
                  <button
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors"
                  >
                    취소
                  </button>
                  <button
                    onClick={handlePointPay}
                    disabled={loading || amountUsd < 1}
                    className="flex-1 py-2.5 rounded-xl bg-primary text-black text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    {loading ? (
                      <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    ) : (
                      <>
                        <Wallet className="w-3.5 h-3.5" />
                        결제하기
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
