"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { payAuthClient } from "@/lib/pay/auth-client"
import { Eye, EyeOff } from "lucide-react"

type Mode = "sign-in" | "sign-up"

export function PanelAuthForm({ mode }: { mode: Mode }) {
  const router = useRouter()
  const [name,      setName]      = useState("")
  const [email,     setEmail]     = useState("")
  const [password,  setPassword]  = useState("")
  const [showPw,    setShowPw]    = useState(false)
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState("")

  const submit = async () => {
    if (!email || !password) { setError("이메일과 비밀번호를 입력해주세요."); return }
    setLoading(true); setError("")
    try {
      if (mode === "sign-up") {
        if (!name) { setError("이름을 입력해주세요."); setLoading(false); return }
        const res = await payAuthClient.signUp.email({ email, password, name })
        if (res.error) { setError(res.error.message ?? "회원가입 실패"); return }
      } else {
        const res = await payAuthClient.signIn.email({ email, password })
        if (res.error) { setError("이메일 또는 비밀번호가 올바르지 않습니다."); return }
      }
      router.push("/payments/panel"); router.refresh()
    } catch {
      setError("오류가 발생했습니다. 다시 시도해주세요.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-5">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">
            {mode === "sign-in" ? "관리자 로그인" : "관리자 가입"}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">결제 관리 패널</p>
        </div>

        <div className="flex flex-col gap-4">
          {mode === "sign-up" && (
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="이름"
              className="h-12 px-4 rounded-xl border border-border bg-secondary/30 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          )}
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="이메일"
            className="h-12 px-4 rounded-xl border border-border bg-secondary/30 text-foreground placeholder:text-muted-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
          <div className="relative">
            <input
              type={showPw ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="비밀번호"
              onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent.isComposing) submit() }}
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
            onClick={submit}
            disabled={loading}
            className="h-12 rounded-xl bg-primary text-primary-foreground font-semibold text-sm disabled:opacity-50"
          >
            {loading ? "처리 중..." : mode === "sign-in" ? "로그인" : "가입하기"}
          </button>

          <p className="text-center text-sm text-muted-foreground">
            {mode === "sign-in" ? (
              <>계정이 없으신가요?{" "}
                <a href="/payments/panel/sign-up" className="text-primary underline underline-offset-2">가입하기</a>
              </>
            ) : (
              <>이미 계정이 있으신가요?{" "}
                <a href="/payments/panel/sign-in" className="text-primary underline underline-offset-2">로그인</a>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}
