"use client"

import { useState } from "react"
import { X, CreditCard, Wallet } from "lucide-react"
import { cn } from "@/lib/utils"

const PRESETS = [30, 60, 100, 250, 500]

interface TopupModalProps {
  open: boolean
  onClose: () => void
}

export function TopupModal({ open, onClose }: TopupModalProps) {
  const [selected, setSelected]   = useState<number | "custom">(100)
  const [customAmt, setCustomAmt] = useState("")
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState("")

  if (!open) return null

  const amountUsd =
    selected === "custom"
      ? parseFloat(customAmt) || 0
      : selected

  const handlePay = async () => {
    if (amountUsd < 1) { setError("최소 $1 이상 입력해주세요."); return }
    setError("")
    setLoading(true)
    // 호출 시점에 토큰 읽기 (컴포넌트 마운트 시점보다 확실히 로그인된 이후)
    const authToken = localStorage.getItem("app_token") ?? ""
    if (!authToken) { setError("로그인이 필요합니다."); setLoading(false); return }
    try {
      const res = await fetch("/api/payments/create-invoice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ amount_usd: amountUsd }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? "결제 오류가 발생했습니다."); return }
      // 결제 페이지 새 탭 오픈
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
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 모달 */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div
          className="pointer-events-auto w-full max-w-sm rounded-2xl border border-border bg-[oklch(0.14_0.01_155)] shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between px-5 pt-5 pb-1">
            <div className="flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">잔고 충전</span>
            </div>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-secondary transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* 금액 표시 */}
          <div className="px-5 py-4 text-center">
            <p className="text-4xl font-bold text-foreground tabular-nums">
              US${selected === "custom"
                ? (parseFloat(customAmt) || 0).toFixed(2)
                : selected.toFixed(2)}
            </p>
          </div>

          {/* 금액 선택 */}
          <div className="px-5 pb-4">
            <div className="grid grid-cols-3 gap-2">
              {PRESETS.map(amt => (
                <button
                  key={amt}
                  onClick={() => setSelected(amt)}
                  className={cn(
                    "py-2 rounded-xl text-sm font-medium border transition-all",
                    selected === amt
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
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
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                )}
              >
                직접 입력
              </button>
            </div>

            {/* 직접 입력 */}
            {selected === "custom" && (
              <div className="mt-3 relative">
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
          </div>

          {/* 안내 문구 */}
          <div className="mx-5 mb-4 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/20">
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              NOWPayments를 통해 카드 또는 암호화폐로 결제할 수 있습니다.
              결제 완료 후 잔고에 자동으로 반영됩니다.
            </p>
          </div>

          {/* 에러 */}
          {error && (
            <p className="mx-5 mb-3 text-xs text-red-400">{error}</p>
          )}

          {/* 버튼 */}
          <div className="flex gap-2 px-5 pb-5">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm text-muted-foreground hover:bg-secondary transition-colors"
            >
              취소
            </button>
            <button
              onClick={handlePay}
              disabled={loading || amountUsd < 1}
              className="flex-1 py-2.5 rounded-xl bg-primary text-black text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
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
        </div>
      </div>
    </>
  )
}
