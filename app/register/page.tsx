"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({
    username: "",
    password: "",
    passwordConfirm: "",
    branchCode: "",
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!form.username.trim()) {
      setError("아이디를 입력해주세요.")
      return
    }
    if (form.password !== form.passwordConfirm) {
      setError("비밀번호가 일치하지 않습니다.")
      return
    }
    if (form.password.length < 4) {
      setError("비밀번호는 4자 이상이어야 합니다.")
      return
    }
    if (!form.branchCode.trim()) {
      setError("지점 코드를 입력해주세요.")
      return
    }

    setLoading(true)

    // 아이디를 내부 이메일 형식으로 변환
    const email = `${form.username.trim().toLowerCase()}@game.local`
    const branchCode = form.branchCode.trim().toUpperCase()

    const supabase = createClient()

    // 지점 코드 유효성 확인 (API 통해서)
    const branchRes = await fetch(`/api/branch/check?code=${branchCode}`)
    const branchData = await branchRes.json()

    if (!branchData.valid) {
      setError(branchData.error ?? "유효하지 않은 지점 코드입니다.")
      setLoading(false)
      return
    }

    const { error: authError } = await supabase.auth.signUp({
      email,
      password: form.password,
      options: {
        data: {
          username: form.username.trim(),
          branch_code: branchCode,
        },
      },
    })

    if (authError) {
      if (authError.message.includes("already registered") || authError.message.includes("already been registered")) {
        setError("이미 사용 중인 아이디입니다.")
      } else {
        setError("회원가입 중 오류가 발생했습니다: " + authError.message)
      }
      setLoading(false)
      return
    }

    router.push("/register/success")
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-primary mb-4">
            <span className="text-primary-foreground font-bold text-xl">B</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground">회원가입</h1>
          <p className="text-muted-foreground text-sm mt-1">지점 코드로 가입하세요</p>
        </div>

        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
          <form onSubmit={handleRegister} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">지점 코드</label>
              <input
                type="text"
                name="branchCode"
                value={form.branchCode}
                onChange={handleChange}
                placeholder="지점에서 받은 코드 입력"
                required
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition uppercase"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">아이디</label>
              <input
                type="text"
                name="username"
                value={form.username}
                onChange={handleChange}
                placeholder="사용할 아이디"
                required
                autoComplete="username"
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">비밀번호</label>
              <input
                type="password"
                name="password"
                value={form.password}
                onChange={handleChange}
                placeholder="4자 이상"
                required
                autoComplete="new-password"
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-foreground">비밀번호 확인</label>
              <input
                type="password"
                name="passwordConfirm"
                value={form.passwordConfirm}
                onChange={handleChange}
                placeholder="비밀번호 재입력"
                required
                autoComplete="new-password"
                className="w-full px-3 py-2.5 rounded-xl border border-input bg-background text-foreground text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring transition"
              />
            </div>

            {error && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "가입 중..." : "회원가입"}
            </button>
          </form>
        </div>

        <p className="text-sm text-muted-foreground text-center mt-4">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="text-primary font-medium hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </div>
  )
}
