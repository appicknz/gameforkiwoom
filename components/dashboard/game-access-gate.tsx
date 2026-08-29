"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Lock, ShoppingBag } from "lucide-react"

type AccessStatus = "loading" | "allowed" | "denied" | "guest"
const accessCache = new Map<string, Exclude<AccessStatus, "loading">>()

function getToken() {
  try { return localStorage.getItem("app_token") } catch { return null }
}

export function GameAccessGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AccessStatus>("loading")
  const router = useRouter()

  const checkAccess = useCallback(async (signal?: AbortSignal, force = false) => {
    const token = getToken()
    if (!token) {
      setStatus("guest")
      return
    }

    const cached = accessCache.get(token)
    if (cached && !force) {
      setStatus(cached)
      return
    }

    setStatus("loading")
    try {
      const response = await fetch("/api/user/game-access", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal,
      })
      if (!response.ok) throw new Error("Failed to check game access")
      const data = await response.json()
      const nextStatus = data.allowed ? "allowed" : "denied"
      if (!signal?.aborted) {
        accessCache.set(token, nextStatus)
        setStatus(nextStatus)
      }
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setStatus("denied")
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void checkAccess(controller.signal)

    const refreshAccess = () => {
      accessCache.clear()
      void checkAccess(undefined, true)
    }
    const refreshFromStorage = (event: StorageEvent) => {
      if (event.key === "app_token") refreshAccess()
    }
    window.addEventListener("auth:login", refreshAccess)
    window.addEventListener("auth:logout", refreshAccess)
    window.addEventListener("storage", refreshFromStorage)

    return () => {
      controller.abort()
      window.removeEventListener("auth:login", refreshAccess)
      window.removeEventListener("auth:logout", refreshAccess)
      window.removeEventListener("storage", refreshFromStorage)
    }
  }, [checkAccess])

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
