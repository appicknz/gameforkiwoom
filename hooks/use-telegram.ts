"use client"

import { useEffect, useRef, useState } from "react"

export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
}

export function useTelegram() {
  const [tgUser, setTgUser] = useState<TelegramUser | null>(null)
  const [initData, setInitData] = useState("")
  const initializedRef = useRef(false)

  useEffect(() => {
    function initTg() {
      if (initializedRef.current) return
      const tg = (window as any).Telegram?.WebApp
      if (!tg) return

      initializedRef.current = true

      try { tg.ready() } catch (_e) { /* 무시 */ }
      try { tg.expand() } catch (_e) { /* 무시 */ }

      const data: string = tg.initData ?? ""
      let user: TelegramUser | null = tg.initDataUnsafe?.user ?? null

      // PC 텔레그램 fallback: initData 직접 파싱
      if (!user && data) {
        try {
          const params = new URLSearchParams(data)
          const raw = params.get("user")
          if (raw) user = JSON.parse(decodeURIComponent(raw))
        } catch (_e) { /* 무시 */ }
      }

      if (user) setTgUser(user)
      setInitData(data)
    }

    // 1. 즉시 시도
    initTg()
    if (initializedRef.current) return

    // 2. SDK 동적 삽입 (아직 없는 경우)
    const SRC = "https://telegram.org/js/telegram-web-app.js"
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SRC}"]`)
    if (!existing) {
      const s = document.createElement("script")
      s.src = SRC
      s.onload = () => initTg()
      document.head.appendChild(s)
    } else {
      existing.addEventListener("load", initTg)
    }

    // 3. 폴링 fallback (최대 3초)
    let tries = 0
    const timer = setInterval(() => {
      tries++
      initTg()
      if (initializedRef.current || tries >= 30) clearInterval(timer)
    }, 100)

    return () => clearInterval(timer)
  }, [])

  return { tgUser, initData }
}
