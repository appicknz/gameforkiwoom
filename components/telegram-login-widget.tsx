"use client"

import { useEffect, useId, useRef } from "react"

export interface TelegramWidgetAuthUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

interface TelegramLoginWidgetProps {
  botUsername: string
  onAuth: (user: TelegramWidgetAuthUser) => void
  size?: "large" | "medium" | "small"
  cornerRadius?: number
  requestAccess?: boolean
}

/**
 * 공식 텔레그램 로그인 위젯 (core.telegram.org/widgets/login)
 *
 * 중요: 이 위젯은 BotFather에서 /setdomain으로 등록한 실제 배포 도메인에서만
 * 렌더링됩니다. v0 미리보기(iframe) 등 등록되지 않은 도메인에서는
 * "Bot domain invalid" 오류만 표시됩니다.
 */
export function TelegramLoginWidget({
  botUsername,
  onAuth,
  size = "large",
  cornerRadius = 8,
  requestAccess = true,
}: TelegramLoginWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const callbackName = `onTelegramAuth_${useId().replace(/[^a-zA-Z0-9]/g, "")}`

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // 전역 콜백 등록 (위젯 스크립트는 window.<callbackName>(user)를 호출)
    ;(window as any)[callbackName] = (user: TelegramWidgetAuthUser) => {
      onAuth(user)
    }

    const script = document.createElement("script")
    script.src = "https://telegram.org/js/telegram-widget.js?22"
    script.async = true
    script.setAttribute("data-telegram-login", botUsername)
    script.setAttribute("data-size", size)
    script.setAttribute("data-radius", String(cornerRadius))
    script.setAttribute("data-onauth", `${callbackName}(user)`)
    if (requestAccess) script.setAttribute("data-request-access", "write")

    container.innerHTML = ""
    container.appendChild(script)

    return () => {
      delete (window as any)[callbackName]
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botUsername, size, cornerRadius, requestAccess])

  return <div ref={containerRef} className="flex justify-center" />
}
