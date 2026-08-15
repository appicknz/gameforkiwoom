"use client"

import { useEffect, useId, useRef, useState } from "react"

interface TelegramWidgetUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

// coinrace 텔레그램 봇(t.me/bitbaka_bot)의 사용자명입니다.
// 봇 사용자명은 비공개 정보가 아니라 클라이언트에 노출해도 안전합니다.
const BOT_USERNAME = "bitbaka_bot"

interface TelegramLoginWidgetProps {
  onSuccess: (token: string, username: string, role: string) => void
  onError: (message: string) => void
}

/**
 * 텔레그램 공식 Login Widget.
 * PC/일반 브라우저에서 클릭하면 사용자의 실제 텔레그램 앱(데스크톱/모바일)에
 * 로그인 승인 알림이 전송되고, 승인 시 서명된 사용자 정보가 돌아옵니다.
 * (PC에 설치된 텔레그램 앱을 웹사이트가 직접 감지·실행할 방법은 브라우저 보안 정책상 없으며,
 * 이 위젯이 실제 텔레그램 계정과 연동하는 공식적인 방법입니다.)
 */
export function TelegramLoginWidget({ onSuccess, onError }: TelegramLoginWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const callbackIdRef = useRef(useId().replace(/[^a-zA-Z0-9]/g, "_"))
  const [loading, setLoading] = useState(false)

  const onSuccessRef = useRef(onSuccess)
  const onErrorRef = useRef(onError)
  onSuccessRef.current = onSuccess
  onErrorRef.current = onError

  useEffect(() => {
    const fnName = `__telegramAuth_${callbackIdRef.current}`

    ;(window as any)[fnName] = async (user: TelegramWidgetUser) => {
      setLoading(true)
      try {
        const res = await fetch("/api/auth/telegram-widget-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(user),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok || !data) {
          onErrorRef.current(data?.error ?? "로그인에 실패했습니다.")
          setLoading(false)
          return
        }
        onSuccessRef.current(data.token, data.username, data.role)
      } catch {
        onErrorRef.current("네트워크 오류가 발생했습니다.")
        setLoading(false)
      }
    }

    const container = containerRef.current
    if (container) {
      container.innerHTML = ""
      const script = document.createElement("script")
      script.src = "https://telegram.org/js/telegram-widget.js?22"
      script.async = true
      script.setAttribute("data-telegram-login", BOT_USERNAME)
      script.setAttribute("data-size", "large")
      script.setAttribute("data-radius", "8")
      script.setAttribute("data-request-access", "write")
      script.setAttribute("data-onauth", `${fnName}(user)`)
      container.appendChild(script)
    }

    return () => {
      delete (window as any)[fnName]
    }
    // 마운트 시 1회만 위젯 스크립트를 삽입합니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div ref={containerRef} className="flex justify-center" />
      {loading && (
        <p className="text-xs text-muted-foreground">텔레그램 앱에서 로그인을 승인해주세요...</p>
      )}
    </div>
  )
}
