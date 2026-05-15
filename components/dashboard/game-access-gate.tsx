"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Lock, ShoppingBag } from "lucide-react"

function getToken() {
  try { return localStorage.getItem("app_token") } catch { return null }
}

export function GameAccessGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<"loading" | "allowed" | "denied" | "guest">("loading")
  const router = useRouter()

  useEffect(() => {
    const token = getToken()
    if (!token) { setStatus("guest"); return }

    fetch("/api/user/game-access", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => setStatus(d.allowed ? "allowed" : "denied"))
      .catch(() => setStatus("denied"))
  }, [])

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (status === "guest") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 px-6 text-center">
        <div className="w-14 h-14 rounded-full border border-border bg-secondary flex items-center justify-center">
          <Lock className="w-6 h-6 text-muted-foreground" />
        </div>
        <div className="space-y-1">
          <p className="text-base font-semibold text-foreground">로그인이 필요합니다</p>
          <p className="text-sm text-muted-foreground">게임에 접근하려면 먼저 로그인하세요.</p>
        </div>
        <button
          onClick={() => router.push("/")}
          className="h-9 px-5 rounded-xl bg-primary text-black text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          로그인하러 가기
        </button>
      </div>
    )
  }

  if (status === "denied") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 px-6 text-center">
        <div className="w-14 h-14 rounded-full border border-border bg-secondary flex items-center justify-center">
          <Lock className="w-6 h-6 text-muted-foreground" />
        </div>
        <div className="space-y-2 max-w-xs">
          <p className="text-base font-semibold text-foreground">보너스 게임 잠금</p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            마켓에서 컨텐츠를 구매하거나, 관리자에게 게임 카테고리 활성화를 요청하면 이용할 수 있습니다.
          </p>
        </div>
        <button
          onClick={() => router.push("/market")}
          className="h-9 px-5 rounded-xl bg-primary text-black text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <ShoppingBag className="w-4 h-4" />
          마켓 바로가기
        </button>
      </div>
    )
  }

  return <>{children}</>
}
