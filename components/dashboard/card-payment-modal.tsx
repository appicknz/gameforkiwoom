"use client"

import { useState } from "react"
import { X, CreditCard } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const BOT_USERNAME = "paycoca_bot"

interface Props {
  open: boolean
  onClose: () => void
  /** 로그인된 유저의 username — 사이트 ID 자동 채움용 */
  prefillUsername?: string | null
}

export function CardPaymentModal({ open, onClose, prefillUsername }: Props) {
  const [siteId, setSiteId] = useState(prefillUsername ?? "")
  const [refCode, setRefCode] = useState("")
  const [amount, setAmount] = useState("")
  const [loading, setLoading] = useState(false)
  const [resultUrl, setResultUrl] = useState<string | null>(null)

  if (!open) return null

  /** 텔레그램 자동연결 — 봇 딥링크로 미니앱 오픈 */
  const handleTelegramConnect = () => {
    const url = `https://t.me/${BOT_USERNAME}?start=pay`
    // iframe(미니앱 내부) 환경이면 새 탭, 아니면 현재 탭
    if (window.self !== window.top) {
      window.open(url, "_blank")
    } else {
      window.location.href = url
    }
  }

  /** 결제 링크 생성 — 봇에게 딥링크로 파라미터 전달 */
  const handleGenerate = () => {
    if (!siteId.trim() || !refCode.trim() || !amount.trim()) return
    setLoading(true)
    const params = new URLSearchParams({
      action: "cardpay",
      site_id: siteId.trim(),
      ref: refCode.trim(),
      amount: amount.trim(),
    })
    const url = `https://t.me/${BOT_USERNAME}?start=${btoa(params.toString())}`
    setResultUrl(url)
    setLoading(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      <div
        className="relative z-10 w-full sm:max-w-md bg-[oklch(0.14_0.01_155)] rounded-t-3xl sm:rounded-2xl border border-border overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
            <CreditCard className="w-4 h-4 text-amber-400" />
          </div>
          <span className="text-sm font-bold text-foreground">결제 관리 시스템</span>
          <button
            onClick={onClose}
            className="ml-auto rounded-lg p-1.5 hover:bg-secondary/60 transition-colors text-muted-foreground"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-5">
          {/* 뱃지 */}
          <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span className="text-xs font-semibold text-amber-400">카드 결제 (할부 가능)</span>
          </div>

          {/* 설명 */}
          <p className="text-sm font-bold text-foreground leading-snug">
            이용하시는 사이트의 ID와 추천코드를 입력<br />
            하면 즉시 결제 가능한 링크가 생성됩니다.
          </p>

          {/* 텔레그램 자동연결 버튼 */}
          <button
            onClick={handleTelegramConnect}
            className="w-full flex items-center justify-center gap-3 h-13 rounded-2xl border-2 text-sm font-bold text-[#229ED9] transition-all hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, oklch(0.18 0.03 220), oklch(0.14 0.01 155))",
              borderColor: "#229ED9",
              boxShadow: "0 0 18px rgba(34,158,217,0.25)",
              height: "52px",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
            </svg>
            텔레그램 자동연결
          </button>
          <p className="text-[11px] text-muted-foreground text-center -mt-2">
            버튼을 누르면 텔레그램이 열리고 계정이 자동으로 연결됩니다
          </p>

          {/* 폼 */}
          <div className="bg-secondary/30 rounded-2xl border border-border p-4 space-y-4">
            {/* 사이트 ID */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                사이트 ID <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={siteId}
                onChange={e => setSiteId(e.target.value)}
                placeholder="이용중이신 사이트 ID"
                className="w-full h-11 px-4 rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
            {/* 추천코드 */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                추천코드 <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                value={refCode}
                onChange={e => setRefCode(e.target.value)}
                placeholder="이용중이신 사이트의 추천코드"
                className="w-full h-11 px-4 rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
            {/* 금액 */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                금액 <span className="text-destructive">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0"
                  className="w-full h-11 px-4 pr-10 rounded-xl bg-background border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 transition-colors"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">원</span>
              </div>
            </div>

            {/* 결제 링크 생성 버튼 */}
            <button
              onClick={handleGenerate}
              disabled={loading || !siteId.trim() || !refCode.trim() || !amount.trim()}
              className="w-full h-12 rounded-xl text-sm font-bold text-background disabled:opacity-40 transition-all"
              style={{ background: "linear-gradient(135deg, #b8973a, #d4af5a)" }}
            >
              {loading ? "생성 중..." : "결제 링크 생성하기"}
            </button>

            {/* 생성된 링크 */}
            {resultUrl && (
              <div className="space-y-2">
                <p className="text-[11px] text-muted-foreground">생성된 결제 링크:</p>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={resultUrl}
                    className="flex-1 h-9 px-3 rounded-lg bg-background border border-primary/30 text-xs text-foreground truncate"
                  />
                  <button
                    onClick={() => navigator.clipboard.writeText(resultUrl)}
                    className="shrink-0 h-9 px-3 rounded-lg bg-primary/10 border border-primary/30 text-xs font-medium text-primary hover:bg-primary/20 transition-colors"
                  >
                    복사
                  </button>
                </div>
                <button
                  onClick={() => window.open(resultUrl, "_blank")}
                  className="w-full h-9 rounded-lg text-xs font-bold text-white transition-opacity hover:opacity-90"
                  style={{ background: "#229ED9" }}
                >
                  텔레그램에서 열기
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
