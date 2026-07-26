"use client"

import { useEffect, useState } from "react"
import { MiniAppHome } from "@/components/miniapp/miniapp-home"

// Telegram WebApp SDK 타입
declare global {
  interface Window {
    Telegram?: {
      WebApp?: {
        initData: string
        initDataUnsafe: {
          user?: {
            id: number
            first_name: string
            last_name?: string
            username?: string
            photo_url?: string
          }
        }
        ready: () => void
        expand: () => void
        close: () => void
        BackButton: { show: () => void; hide: () => void; onClick: (fn: () => void) => void }
        MainButton: { text: string; show: () => void; hide: () => void; onClick: (fn: () => void) => void; setParams: (p: object) => void }
        colorScheme: "light" | "dark"
        themeParams: Record<string, string>
        version: string
        platform: string
      }
    }
  }
}

type AuthState = "loading" | "authed" | "error"

interface UserInfo {
  token: string
  username: string
  role: string
  telegramUser: {
    id: number
    first_name: string
    username?: string
    photo_url?: string
  }
}

export default function MiniAppPage() {
  const [authState, setAuthState] = useState<AuthState>("loading")
  const [userInfo,   setUserInfo]  = useState<UserInfo | null>(null)
  const [errMsg,     setErrMsg]    = useState("")

  useEffect(() => {
    const script = document.createElement("script")
    script.src = "https://telegram.org/js/telegram-web-app.js"
    script.onload = () => initTelegramAuth()
    document.head.appendChild(script)
    return () => { document.head.removeChild(script) }
  }, [])

  async function initTelegramAuth() {
    const twa = window.Telegram?.WebApp
    if (!twa) {
      setErrMsg("텔레그램 앱에서만 실행 가능합니다.")
      setAuthState("error")
      return
    }

    twa.ready()
    twa.expand()

    const initData = twa.initData
    const tgUser   = twa.initDataUnsafe?.user

    if (!initData && process.env.NODE_ENV !== "development") {
      setErrMsg("initData가 없습니다. 텔레그램에서 실행해주세요.")
      setAuthState("error")
      return
    }

    try {
      const res = await fetch("/api/auth/telegram-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ initData: initData || "dev_mode" }),
      })
      const data = await res.json()

      if (!res.ok || !data.token) {
        setErrMsg(data.error ?? "인증 실패")
        setAuthState("error")
        return
      }

      // token localStorage 저장 (다른 API 호출에 재사용)
      localStorage.setItem("app_token", data.token)

      setUserInfo({
        token:       data.token,
        username:    data.username,
        role:        data.role,
        telegramUser: tgUser ?? { id: 0, first_name: data.username },
      })
      setAuthState("authed")
    } catch (e) {
      setErrMsg("서버 오류: " + String(e))
      setAuthState("error")
    }
  }

  if (authState === "loading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-[#d4af37] border-t-transparent animate-spin" />
        <p className="text-sm text-white/50">로그인 중...</p>
      </div>
    )
  }

  if (authState === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4 px-6">
        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="text-sm text-white/70 text-center">{errMsg}</p>
        <button
          onClick={() => { setAuthState("loading"); setErrMsg(""); initTelegramAuth() }}
          className="px-5 py-2 rounded-xl bg-[#d4af37] text-black text-sm font-semibold"
        >
          다시 시도
        </button>
      </div>
    )
  }

  return <MiniAppHome userInfo={userInfo!} />
}
