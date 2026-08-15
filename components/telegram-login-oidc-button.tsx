"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Send } from "lucide-react"

const OIDC_ORIGIN = "https://oauth.telegram.org"
const OIDC_URL = `${OIDC_ORIGIN}/auth`

interface TelegramLoginOidcButtonProps {
  clientId: number
  onIdToken: (idToken: string) => void
  onError?: (message: string) => void
  disabled?: boolean
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".")
    if (parts.length !== 3) return null
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const pad = payload.length % 4
    const padded = pad ? payload + "=".repeat(4 - pad) : payload
    return JSON.parse(atob(padded))
  } catch {
    return null
  }
}

/**
 * 신규 텔레그램 OIDC 로그인 (core.telegram.org/bots/telegram-login)
 * id_token은 서버(/api/auth/telegram-oidc-login)에서 JWKS로 서명을 검증한 뒤에만 사용된다.
 *
 * 주의: 텔레그램 공식 telegram-login.js의 Telegram.Login.auth() 팝업 경로는
 * 현재 oauth.telegram.org/auth 요청에 origin 쿼리 파라미터를 빠뜨리는 버그가 있어
 * 서버가 "origin required"를 반환한다 (curl로 직접 확인). 따라서 라이브러리를 로드하지 않고
 * 팝업 URL과 postMessage 처리를 직접 구현해 origin 파라미터를 명시적으로 포함시킨다.
 *
 * 주의: BotFather의 "Login Widget" 메뉴에서 이 사이트의 Allowed URL을 등록해야 하며,
 * 팝업 통신이 막히지 않도록 Cross-Origin-Opener-Policy 헤더에
 * same-origin 대신 same-origin-allow-popups(또는 미설정)를 사용해야 한다.
 */
export function TelegramLoginOidcButton({ clientId, onIdToken, onError, disabled }: TelegramLoginOidcButtonProps) {
  const [loading, setLoading] = useState(false)
  const popupRef = useRef<Window | null>(null)
  const messageHandlerRef = useRef<((event: MessageEvent) => void) | null>(null)

  useEffect(() => {
    return () => {
      if (messageHandlerRef.current) {
        window.removeEventListener("message", messageHandlerRef.current)
      }
    }
  }, [])

  const handleClick = () => {
    const redirectUri = `${window.location.origin}${window.location.pathname}`
    const scope = ["openid", "profile", "telegram:bot_access"]

    const authUrl =
      `${OIDC_URL}?response_type=post_message` +
      `&client_id=${encodeURIComponent(String(clientId))}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scope.join(" "))}` +
      `&origin=${encodeURIComponent(window.location.origin)}`

    const width = 550
    const height = 650
    const left = Math.max(0, (window.screen.width - width) / 2)
    const top = Math.max(0, (window.screen.height - height) / 2)
    const features = `width=${width},height=${height},left=${left},top=${top},status=0,location=0,menubar=0,toolbar=0`

    if (messageHandlerRef.current) {
      window.removeEventListener("message", messageHandlerRef.current)
      messageHandlerRef.current = null
    }

    setLoading(true)
    const popup = window.open(authUrl, "telegram_oauth", features)
    popupRef.current = popup

    if (!popup) {
      setLoading(false)
      onError?.("팝업이 차단되었습니다. 브라우저의 팝업 차단을 해제해주세요.")
      return
    }

    let finished = false
    const finish = (idToken?: string, errorMsg?: string) => {
      if (finished) return
      finished = true
      setLoading(false)
      if (messageHandlerRef.current) {
        window.removeEventListener("message", messageHandlerRef.current)
        messageHandlerRef.current = null
      }
      if (idToken) {
        onIdToken(idToken)
      } else if (errorMsg) {
        onError?.(errorMsg)
      }
    }

    const handler = (event: MessageEvent) => {
      if (event.origin !== OIDC_ORIGIN) return
      if (popupRef.current && event.source !== popupRef.current) return

      let data: { event?: string; result?: string; error?: string } | null = null
      try {
        data = typeof event.data === "string" ? JSON.parse(event.data) : event.data
      } catch {
        return
      }
      if (!data || data.event !== "auth_result") return

      if (data.error) {
        finish(undefined, `텔레그램 로그인 실패: ${data.error}`)
        return
      }
      const idToken = data.result
      if (!idToken || typeof idToken !== "string") {
        finish(undefined, "텔레그램 응답에 id_token이 없습니다.")
        return
      }
      const user = decodeJwtPayload(idToken)
      if (!user) {
        finish(undefined, "텔레그램 응답을 해석하지 못했습니다.")
        return
      }
      finish(idToken)
    }
    messageHandlerRef.current = handler
    window.addEventListener("message", handler)

    const closeCheck = setInterval(() => {
      if (popup.closed) {
        clearInterval(closeCheck)
        finish(undefined, undefined)
      }
    }, 500)
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className="w-full gap-2 bg-[#26A5E4] text-white hover:bg-[#229ED9]"
    >
      <Send className="size-4" />
      {loading ? "확인 중..." : "텔레그램으로 로그인"}
    </Button>
  )
}
