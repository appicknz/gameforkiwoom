"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Send } from "lucide-react"

interface TelegramOidcResult {
  id_token?: string
  user?: Record<string, unknown>
  error?: string
}

interface TelegramLoginGlobal {
  auth: (
    options: { client_id: number; request_access?: string; lang?: string },
    callback: (result: TelegramOidcResult) => void,
  ) => void
}

// window.Telegram은 app/miniapp/page.tsx에서 WebApp 전용 타입으로 이미 전역 선언되어 있어
// 여기서는 별도로 declare global하지 않고 필요한 부분만 안전하게 캐스팅해서 접근한다.
function getTelegramLogin(): TelegramLoginGlobal | undefined {
  return (window as unknown as { Telegram?: { Login?: TelegramLoginGlobal } }).Telegram?.Login
}

interface TelegramLoginOidcButtonProps {
  clientId: number
  onIdToken: (idToken: string) => void
  onError?: (message: string) => void
  disabled?: boolean
}

/**
 * 신규 텔레그램 OIDC 로그인 (core.telegram.org/bots/telegram-login)
 * telegram-login.js는 팝업 창을 열어 인증을 진행하고, id_token을 콜백으로 돌려준다.
 * id_token은 서버(/api/auth/telegram-oidc-login)에서 JWKS로 서명을 검증한 뒤에만 사용된다.
 *
 * 주의: BotFather의 "Login Widget" 메뉴에서 이 사이트의 Allowed URL을 등록해야 하며,
 * 팝업 통신이 막히지 않도록 Cross-Origin-Opener-Policy 헤더에
 * same-origin 대신 same-origin-allow-popups(또는 미설정)를 사용해야 한다.
 */
export function TelegramLoginOidcButton({ clientId, onIdToken, onError, disabled }: TelegramLoginOidcButtonProps) {
  const [scriptReady, setScriptReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const loadedRef = useRef(false)

  useEffect(() => {
    if (getTelegramLogin()) {
      setScriptReady(true)
      return
    }
    if (loadedRef.current) return
    loadedRef.current = true

    const script = document.createElement("script")
    script.src = "https://telegram.org/js/telegram-login.js"
    script.async = true
    script.onload = () => setScriptReady(true)
    script.onerror = () => onError?.("텔레그램 로그인 스크립트를 불러오지 못했습니다.")
    document.body.appendChild(script)
  }, [onError])

  const handleClick = () => {
    const login = getTelegramLogin()
    if (!login) {
      onError?.("텔레그램 로그인 준비 중입니다. 잠시 후 다시 시도해주세요.")
      return
    }
    setLoading(true)
    login.auth({ client_id: clientId, request_access: "write" }, (result) => {
      setLoading(false)
      if (result.error) {
        if (result.error !== "popup_closed") onError?.(`텔레그램 로그인 실패: ${result.error}`)
        return
      }
      if (!result.id_token) {
        onError?.("텔레그램 응답에 id_token이 없습니다.")
        return
      }
      onIdToken(result.id_token)
    })
  }

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={disabled || !scriptReady || loading}
      className="w-full gap-2 bg-[#26A5E4] text-white hover:bg-[#229ED9]"
    >
      <Send className="size-4" />
      {loading ? "확인 중..." : "텔레그램으로 로그인"}
    </Button>
  )
}
