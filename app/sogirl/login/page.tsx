"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

export default function SogirlLoginPage() {
  const router = useRouter()
  const [id, setId] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)

    const res = await fetch("/api/sogirl/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, password }),
    })

    const data = await res.json()
    setLoading(false)

    if (!res.ok) {
      setError(data.error ?? "로그인 실패")
      return
    }

    // 쿠키가 설정된 후 서버 컴포넌트가 새 쿠키를 읽을 수 있도록 refresh 먼저
    router.refresh()
    router.push("/sogirl")
  }

  return (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* 로고 */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-2xl bg-primary/20 border border-primary/30 flex items-center justify-center mb-3">
            <span className="text-primary font-bold text-xl">S</span>
          </div>
          <h1 className="text-white font-bold text-xl">관리자 로그인</h1>
          <p className="text-white/40 text-sm mt-1">본사 전용 페이지입니다</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            placeholder="아이디"
            value={id}
            onChange={e => setId(e.target.value)}
            required
            autoComplete="username"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 text-sm focus:outline-none focus:border-primary/50 transition"
          />
          <input
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-white/30 text-sm focus:outline-none focus:border-primary/50 transition"
          />

          {error && (
            <p className="text-red-400 text-xs text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-primary text-white font-semibold text-sm hover:opacity-90 transition disabled:opacity-50 mt-1"
          >
            {loading ? "확인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </div>
  )
}
