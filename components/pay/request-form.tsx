"use client"

import { useState, useEffect } from "react"
import { submitPayRequest, getManagerByCode } from "@/lib/pay/actions"

const AMOUNTS = [10000, 30000, 50000, 100000, 300000, 500000]

interface TgUser {
  id: number
  first_name: string
  username?: string
}

interface Props {
  managerCode: string
}

export function PayRequestForm({ managerCode }: Props) {
  const [siteId,       setSiteId]      = useState("")
  const [referral,     setReferral]    = useState("")
  const [amount,       setAmount]      = useState<number>(0)
  const [customAmount, setCustomAmount] = useState("")
  const [tgUser,       setTgUser]      = useState<TgUser | null>(null)
  const [managerId,    setManagerId]   = useState<string | null>(null)
  const [loading,      setLoading]     = useState(false)
  const [done,         setDone]        = useState(false)
  const [error,        setError]       = useState("")

  useEffect(() => {
    // Telegram WebApp 초기화
    if (typeof window !== "undefined" && (window as unknown as { Telegram?: { WebApp?: { initDataUnsafe?: { user?: TgUser }; ready?: () => void } } }).Telegram?.WebApp) {
      const twa = (window as unknown as { Telegram: { WebApp: { initDataUnsafe?: { user?: TgUser }; ready?: () => void } } }).Telegram.WebApp
      twa.ready?.()
      const user = twa.initDataUnsafe?.user
      if (user) setTgUser(user)
    }
    // 관리자 코드로 managerId 조회
    getManagerByCode(managerCode).then(mgr => {
      if (mgr) setManagerId(mgr.id)
      else setError("유효하지 않은 코드입니다.")
    })
  }, [managerCode])

  const finalAmount = customAmount ? parseInt(customAmount.replace(/[^0-9]/g, "")) : amount

  const handleSubmit = async () => {
    if (!siteId.trim())   { setError("사이트 ID를 입력해주세요."); return }
    if (!referral.trim()) { setError("추천코드를 입력해주세요."); return }
    if (!finalAmount || finalAmount < 10000) { setError("금액을 선택하거나 입력해주세요. (최소 10,000원)"); return }
    if (!managerId)       { setError("관리자 코드가 유효하지 않습니다."); return }

    setLoading(true); setError("")
    try {
      await submitPayRequest({
        siteId:           siteId.trim(),
        referralCode:     referral.trim(),
        amount:           finalAmount,
        managerId,
        telegramId:       tgUser ? String(tgUser.id) : undefined,
        telegramUsername: tgUser?.username,
      })
      setDone(true)
    } catch {
      setError("신청 중 오류가 발생했습니다. 다시 시도해주세요.")
    } finally {
      setLoading(false)
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background px-6 text-center">
        <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-6">
          <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-bold text-foreground mb-2">신청이 완료되었습니다</h2>
        <p className="text-muted-foreground text-sm">관리자가 확인 후 처리해드립니다.</p>
        <p className="text-muted-foreground text-sm mt-1">
          신청 금액: <span className="text-foreground font-semibold">{finalAmount.toLocaleString("ko-KR")}원</span>
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* 헤더 */}
      <div className="px-5 pt-8 pb-6 border-b border-border">
        <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">충전 신청</p>
        <h1 className="text-2xl font-bold text-foreground">충전 신청</h1>
        {tgUser && (
          <p className="text-sm text-muted-foreground mt-1">
            {tgUser.first_name}{tgUser.username ? ` (@${tgUser.username})` : ""}
          </p>
        )}
      </div>

      <div className="flex-1 px-5 py-6 flex flex-col gap-5">
        {/* 사이트 ID */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">사이트 ID</label>
          <input
            type="text"
            value={siteId}
            onChange={e => setSiteId(e.target.value)}
            placeholder="사이트에서 사용하는 아이디"
            className="w-full h-12 px-4 rounded-xl border border-border bg-secondary/30 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* 추천코드 */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">추천코드</label>
          <input
            type="text"
            value={referral}
            onChange={e => setReferral(e.target.value)}
            placeholder="추천코드 입력"
            className="w-full h-12 px-4 rounded-xl border border-border bg-secondary/30 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* 금액 선택 */}
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">충전 금액</label>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {AMOUNTS.map(a => (
              <button
                key={a}
                onClick={() => { setAmount(a); setCustomAmount("") }}
                className={`h-11 rounded-xl text-sm font-medium border transition-all ${
                  amount === a && !customAmount
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-secondary/30 text-muted-foreground hover:text-foreground hover:border-border/80"
                }`}
              >
                {(a / 10000).toLocaleString()}만원
              </button>
            ))}
          </div>
          <div className="relative">
            <input
              type="number"
              value={customAmount}
              onChange={e => { setCustomAmount(e.target.value); setAmount(0) }}
              placeholder="직접 입력 (원)"
              className="w-full h-12 px-4 rounded-xl border border-border bg-secondary/30 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          {finalAmount > 0 && (
            <p className="mt-2 text-sm text-primary font-medium">
              선택된 금액: {finalAmount.toLocaleString("ko-KR")}원
            </p>
          )}
        </div>

        {error && (
          <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* 신청 버튼 */}
      <div className="px-5 pb-8 pt-2">
        <button
          onClick={handleSubmit}
          disabled={loading || !managerId}
          className="w-full h-14 rounded-2xl bg-primary text-primary-foreground font-bold text-base disabled:opacity-50 transition-opacity active:scale-[0.98]"
        >
          {loading ? "신청 중..." : "충전 신청하기"}
        </button>
      </div>
    </div>
  )
}
