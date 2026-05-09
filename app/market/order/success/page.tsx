"use client"

import { useEffect, useState } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { CheckCircle, ShoppingBag, Clock } from "lucide-react"
import Link from "next/link"

export default function OrderSuccessPage() {
  const params   = useSearchParams()
  const router   = useRouter()
  const sessionId = params.get("session_id")
  const [countdown, setCountdown] = useState(5)

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(t); router.push("/market"); return 0 }
        return c - 1
      })
    }, 1000)
    return () => clearInterval(t)
  }, [router])

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center mx-auto">
          <CheckCircle className="w-10 h-10 text-primary" />
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">결제 완료</h1>
          <p className="text-muted-foreground text-sm">
            결제가 정상적으로 처리되었습니다.
            <br />
            발행자의 승인 후 구매가 확정됩니다.
          </p>
        </div>

        <div className="rounded-xl border border-border bg-secondary/30 p-4 flex items-center gap-3 text-left">
          <Clock className="w-5 h-5 text-amber-400 shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">승인 대기 중</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              사이드바 &apos;내 구매현황&apos;에서 실시간으로 상태를 확인하세요.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Link
            href="/market"
            className="w-full py-2.5 rounded-lg bg-primary text-black text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            <ShoppingBag className="w-4 h-4" />
            마켓으로 돌아가기
          </Link>
          <p className="text-xs text-muted-foreground">
            {countdown}초 후 자동으로 이동합니다.
          </p>
        </div>
      </div>
    </div>
  )
}
