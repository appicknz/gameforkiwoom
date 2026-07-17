"use client"

import { useEffect } from "react"
import { useTelegram } from "@/hooks/use-telegram"

function getToken(): string | null {
  try { return localStorage.getItem("app_token") } catch { return null }
}

/**
 * 텔레그램 미니앱에서 열렸을 때 유저 정보를 자동 수집하고 서버에 저장합니다.
 * layout.tsx에 포함시켜 전체 앱에서 동작합니다.
 * 로그인 상태가 아니면 저장 시도하지 않습니다.
 */
export function TelegramCollector() {
  const { tgUser } = useTelegram()

  useEffect(() => {
    if (!tgUser) return
    const token = getToken()
    if (!token) return

    fetch("/api/user/telegram", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        telegram_id:         tgUser.id,
        telegram_username:   tgUser.username,
        telegram_first_name: tgUser.first_name,
        telegram_last_name:  tgUser.last_name,
        telegram_photo_url:  tgUser.photo_url,
      }),
    }).catch(() => {})
  }, [tgUser])

  return null
}
