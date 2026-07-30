"use client"

import { useState } from "react"
import { Eye, EyeOff } from "lucide-react"

const MASTER_PW = process.env.NEXT_PUBLIC_PAY_MASTER_PASSWORD ?? "master1234"

export function MasterGate({ children }: { children: React.ReactNode }) {
  const [pw,      setPw]      = useState("")
  const [showPw,  setShowPw]  = useState(false)
  const [authed,  setAuthed]  = useState(false)
  const [error,   setError]   = useState("")

  if (authed) return <>{children}</>

  const check = () => {
    if (pw === MASTER_PW) { setAuthed(true) }
    else { setError("비밀번호가 올바르지 않습니다."); setPw("") }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">마스터 패널</h1>
          <p className="text-sm text-muted-foreground mt-1">비밀번호를 입력하세요</p>
        </div>
        <div className="flex flex-col gap-4">
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={pw}
              onChange={e => setPw(e.target.value)}
              placeholder="비밀번호"
              onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) check() }}
              className="w-full h-12 px-4 pr-12 rounded-xl border border-border bg-secondary/30 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              type="button"
              onClick={() => setShowPw(v => !v)}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {error && (
            <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}
          <button
            onClick={check}
            className="h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm"
          >
            입장
          </button>
        </div>
      </div>
    </div>
  )
}
