"use client"

import { useEffect, useRef, useState } from "react"

type Status = "idle" | "starting" | "waiting" | "join_required" | "error"

interface Props {
  onSuccess: (token: string, username: string, role: string) => void
}

const POLL_INTERVAL_MS = 2000
const MAX_POLL_MS = 5 * 60 * 1000 // 5분 (토큰 TTL과 동일)

/**
 * 일반 브라우저(PC/모바일 웹)용 텔레그램 딥링크 로그인.
 * 1) 임시 로그인 토큰 발급 → 2) 텔레그램 봇 채팅으로 이동(딥링크) → 3) 사용자가 /start 클릭
 * 4) 웹훅이 채널 가입을 확인하고 계정을 연동 → 5) 이 컴포넌트가 폴링으로 완료를 감지
 */
export function TelegramDeepLinkLogin({ onSuccess }: Props) {
  const [status, setStatus] = useState<Status>("idle")
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [joinChannelUrl, setJoinChannelUrl] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const tokenRef = useRef<string | null>(null)
  const startedAtRef = useRef<number>(0)

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  useEffect(() => stopPolling, [])

  const poll = async (token: string) => {
    try {
      const res = await fetch(`/api/auth/telegram-deeplink/status?token=${token}`)
      const data = await res.json()

      if (data.status === "done" && data.token) {
        stopPolling()
        onSuccess(data.token, data.username, data.role)
        return
      }
      if (data.status === "join_required") {
        setStatus("join_required")
        return
      }
      if (data.status === "expired") {
        stopPolling()
        setStatus("error")
        setErrorMsg("로그인 요청이 만료되었습니다. 다시 시도해주세요.")
        return
      }
      // pending — 계속 대기
      if (status !== "waiting") setStatus("waiting")

      if (Date.now() - startedAtRef.current > MAX_POLL_MS) {
        stopPolling()
        setStatus("error")
        setErrorMsg("시간이 초과되었습니다. 다시 시도해주세요.")
      }
    } catch {
      // 네트워크 일시 오류는 조용히 무시하고 다음 폴링에서 재시도
    }
  }

  const start = async () => {
    stopPolling()
    setErrorMsg(null)
    setStatus("starting")
    try {
      const res = await fetch("/api/auth/telegram-deeplink/start", { method: "POST" })
      const data = await res.json()
      if (!res.ok || !data.deepLink) {
        setStatus("error")
        setErrorMsg(data.error ?? "로그인을 시작할 수 없습니다.")
        return
      }

      tokenRef.current = data.token
      setJoinChannelUrl(data.joinChannelUrl ?? null)
      startedAtRef.current = Date.now()
      setStatus("waiting")

      window.open(data.deepLink, "_blank")

      pollRef.current = setInterval(() => {
        if (tokenRef.current) poll(tokenRef.current)
      }, POLL_INTERVAL_MS)
    } catch {
      setStatus("error")
      setErrorMsg("네트워크 오류가 발생했습니다.")
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={start}
        disabled={status === "starting" || status === "waiting"}
        className="w-full flex items-center justify-center gap-2 h-9 rounded-lg text-sm font-semibold text-white transition-opacity disabled:opacity-60"
        style={{ background: "#229ED9" }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.96 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
        </svg>
        {status === "starting" && "연결 중..."}
        {status === "waiting" && "텔레그램에서 확인 중..."}
        {status === "join_required" && "채널 가입 필요"}
        {(status === "idle" || status === "error") && "텔레그램으로 시작하기"}
      </button>

      {status === "waiting" && (
        <p className="text-xs text-muted-foreground text-center">
          열린 텔레그램 채팅에서 <span className="font-semibold">시작</span> 버튼을 눌러주세요.
        </p>
      )}

      {status === "join_required" && (
        <p className="text-xs text-amber-500 text-center">
          텔레그램 채팅에서 채널 가입 후 &quot;가입 확인&quot;을 눌러주세요.
          {joinChannelUrl && (
            <>
              {" "}
              <a href={joinChannelUrl} target="_blank" rel="noopener noreferrer" className="underline">
                채널 열기
              </a>
            </>
          )}
        </p>
      )}

      {errorMsg && <p className="text-xs text-destructive text-center">{errorMsg}</p>}
    </div>
  )
}
