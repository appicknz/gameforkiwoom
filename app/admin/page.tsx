"use client"

import { useState } from "react"
import { Lock, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"

interface UserRow {
  id: string
  username: string
  role: string
  balance: number
  created_at: string
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: "마스터",
  branch_admin: "지점",
  user: "사용자",
}

const ROLE_COLOR: Record<string, string> = {
  super_admin: "bg-red-100 text-red-700",
  branch_admin: "bg-blue-100 text-blue-700",
  user: "bg-secondary text-secondary-foreground",
}

export default function AdminPage() {
  const [pw, setPw] = useState("")
  const [authed, setAuthed] = useState(false)
  const [error, setError] = useState("")
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(false)

  const handleLogin = async () => {
    setLoading(true)
    setError("")
    const res = await fetch(`/api/admin/users?pw=${encodeURIComponent(pw)}`)
    if (res.ok) {
      const data = await res.json()
      setUsers(data.users ?? [])
      setAuthed(true)
    } else {
      setError("비밀번호가 올바르지 않습니다.")
    }
    setLoading(false)
  }

  const refresh = async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/users?pw=${encodeURIComponent(pw)}`)
    if (res.ok) {
      const data = await res.json()
      setUsers(data.users ?? [])
    }
    setLoading(false)
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-lg p-8">
          <div className="flex flex-col items-center gap-3 mb-8">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-xl font-bold text-foreground">관리자 패널</h1>
            <p className="text-xs text-muted-foreground">관리자 비밀번호를 입력하세요</p>
          </div>

          <div className="space-y-3">
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="password"
                placeholder="비밀번호"
                value={pw}
                onChange={e => setPw(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleLogin()}
                className="w-full h-10 pl-9 pr-4 text-sm bg-background border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <Button className="w-full" onClick={handleLogin} disabled={loading}>
              {loading ? "확인 중..." : "입장"}
            </Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-5xl mx-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">관리자 패널</h1>
              <p className="text-xs text-muted-foreground">총 {users.length}명의 회원</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            {loading ? "로딩..." : "새로고침"}
          </Button>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "전체 회원", value: users.length, color: "text-foreground" },
            { label: "일반 사용자", value: users.filter(u => u.role === "user").length, color: "text-foreground" },
            {
              label: "총 잔고",
              value: "₩" + users.reduce((s, u) => s + u.balance, 0).toLocaleString(),
              color: "text-primary",
            },
          ].map(stat => (
            <div key={stat.label} className="bg-card border border-border rounded-xl p-4">
              <p className="text-xs text-muted-foreground mb-1">{stat.label}</p>
              <p className={`text-xl font-bold ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>

        {/* 회원 목록 */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">회원 목록</h2>
          </div>

          {/* 데스크톱 테이블 */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50 text-muted-foreground text-xs">
                  <th className="text-left px-4 py-3 font-medium">아이디</th>
                  <th className="text-left px-4 py-3 font-medium">역할</th>
                  <th className="text-right px-4 py-3 font-medium">잔고</th>
                  <th className="text-right px-4 py-3 font-medium">가입일</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u, i) => (
                  <tr key={u.id} className={`border-t border-border hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {u.username.slice(0, 1).toUpperCase()}
                        </div>
                        <span className="font-medium text-foreground">{u.username}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLOR[u.role] ?? "bg-secondary text-secondary-foreground"}`}>
                        {ROLE_LABEL[u.role] ?? u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm">
                      ₩{u.balance.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString("ko-KR")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 모바일 카드 */}
          <div className="md:hidden divide-y divide-border">
            {users.map(u => (
              <div key={u.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 shrink-0 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary">
                    {u.username.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{u.username}</p>
                    <p className="text-xs text-muted-foreground">{new Date(u.created_at).toLocaleDateString("ko-KR")}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium block mb-1 ${ROLE_COLOR[u.role] ?? "bg-secondary text-secondary-foreground"}`}>
                    {ROLE_LABEL[u.role] ?? u.role}
                  </span>
                  <p className="text-xs font-mono text-foreground">₩{u.balance.toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>

          {users.length === 0 && (
            <div className="py-16 text-center text-muted-foreground text-sm">
              등록된 회원이 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
