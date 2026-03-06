"use client"

import { useEffect, useState, useCallback } from "react"
import { createClient } from "@supabase/supabase-js"
import { Users, Wallet, RefreshCw, Plus, Minus, Shield, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

const ADMIN_ROLES = ["master", "super_admin", "branch_admin"]

interface User {
  id: string
  username: string
  role: string
  created_at: string
  balance: number
}

export default function PanelPage() {
  const router = useRouter()
  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [adminPw, setAdminPw] = useState("")
  const [pwInput, setPwInput] = useState("")
  const [pwError, setPwError] = useState("")

  const [activeTab, setActiveTab] = useState<"users">("users")
  const [users, setUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(false)

  const [chargeUserId, setChargeUserId] = useState<string | null>(null)
  const [chargeAmount, setChargeAmount] = useState("")
  const [chargeLoading, setChargeLoading] = useState(false)
  const [chargeMsg, setChargeMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // 권한 확인: access_token으로 profiles 테이블에서 role 조회
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session?.user || !session.access_token) {
        router.replace("/")
        return
      }
      const res = await fetch("/api/user/profile", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) { router.replace("/"); return }
      const data = await res.json()
      const role = data.profile?.role ?? ""
      if (!ADMIN_ROLES.includes(role)) {
        router.replace("/")
        return
      }
      setLoading(false)
    })
  }, [router])

  // 관리자 비밀번호 확인
  const handlePwSubmit = () => {
    setPwError("")
    setAdminPw(pwInput)
  }

  // 회원 목록 로드
  const loadUsers = useCallback(async (pw: string) => {
    setUsersLoading(true)
    const res = await fetch(`/api/admin/users?pw=${encodeURIComponent(pw)}`)
    const data = await res.json()
    if (!res.ok) {
      setPwError("비밀번호가 올바르지 않습니다.")
      setAdminPw("")
    } else {
      setUsers(data.users ?? [])
    }
    setUsersLoading(false)
  }, [])

  useEffect(() => {
    if (adminPw) loadUsers(adminPw)
  }, [adminPw, loadUsers])

  // 잔고 충전
  const handleCharge = async (userId: string, delta: number) => {
    setChargeLoading(true)
    setChargeMsg(null)
    const amount = parseInt(chargeAmount)
    if (!chargeAmount || isNaN(amount) || amount <= 0) {
      setChargeMsg({ text: "올바른 금액을 입력하세요.", ok: false })
      setChargeLoading(false)
      return
    }
    const res = await fetch("/api/admin/charge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pw: adminPw, userId, amount: delta * amount }),
    })
    const data = await res.json()
    if (!res.ok) {
      setChargeMsg({ text: data.error ?? "오류가 발생했습니다.", ok: false })
    } else {
      setChargeMsg({ text: `잔고가 ${delta > 0 ? "충전" : "차감"}됐습니다.`, ok: true })
      setChargeAmount("")
      setChargeUserId(null)
      loadUsers(adminPw)
    }
    setChargeLoading(false)
  }

  const formatBalance = (n: number) => `₩${n.toLocaleString()}`
  const formatDate = (s: string) => new Date(s).toLocaleDateString("ko-KR")

  const roleLabel: Record<string, { label: string; color: string }> = {
    super_admin: { label: "슈퍼관리자", color: "bg-red-100 text-red-700" },
    master: { label: "마스터", color: "bg-purple-100 text-purple-700" },
    branch_admin: { label: "지점관리자", color: "bg-blue-100 text-blue-700" },
    user: { label: "일반회원", color: "bg-gray-100 text-gray-600" },
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  // 관리자 비밀번호 입력 화면
  if (!adminPw) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-sm p-8 bg-card border border-border rounded-2xl shadow-sm">
          <div className="flex items-center gap-2 mb-6">
            <Shield className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">관리자 인증</h1>
          </div>
          <div className="space-y-3">
            <Input
              type="password"
              placeholder="관리자 비밀번호"
              value={pwInput}
              onChange={e => setPwInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handlePwSubmit()}
            />
            {pwError && <p className="text-xs text-destructive">{pwError}</p>}
            <Button className="w-full" onClick={handlePwSubmit}>확인</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 */}
      <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">관리자 패널</h1>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.replace("/")} className="gap-1.5 text-muted-foreground">
          <LogOut className="w-4 h-4" /> 나가기
        </Button>
      </header>

      {/* 탭 */}
      <div className="border-b border-border bg-card">
        <div className="flex px-6">
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "users"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="w-4 h-4" /> 회원관리
          </button>
        </div>
      </div>

      {/* 컨텐츠 */}
      <main className="p-6 max-w-5xl mx-auto">
        {/* 상단 통계 */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">전체 회원</p>
            <p className="text-2xl font-bold text-foreground">{users.length}명</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-4">
            <p className="text-xs text-muted-foreground mb-1">총 잔고</p>
            <p className="text-2xl font-bold text-foreground">
              {formatBalance(users.reduce((s, u) => s + u.balance, 0))}
            </p>
          </div>
        </div>

        {/* 회원 목록 */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">회원 목록</h2>
            <Button
              variant="ghost" size="sm"
              onClick={() => loadUsers(adminPw)}
              disabled={usersLoading}
              className="gap-1.5 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${usersLoading ? "animate-spin" : ""}`} />
              새로고침
            </Button>
          </div>

          {usersLoading ? (
            <div className="py-12 flex justify-center">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <div className="divide-y divide-border">
              {users.map(user => {
                const rl = roleLabel[user.role] ?? { label: user.role, color: "bg-gray-100 text-gray-600" }
                const isCharging = chargeUserId === user.id
                return (
                  <div key={user.id} className="px-5 py-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-xs font-semibold text-primary">
                            {user.username.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{user.username}</span>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${rl.color}`}>
                              {rl.label}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">{formatDate(user.created_at)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="text-xs text-muted-foreground">잔고</p>
                          <p className="text-sm font-semibold text-foreground">{formatBalance(user.balance)}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs gap-1"
                          onClick={() => {
                            setChargeUserId(isCharging ? null : user.id)
                            setChargeAmount("")
                            setChargeMsg(null)
                          }}
                        >
                          <Wallet className="w-3 h-3" />
                          {isCharging ? "닫기" : "충전"}
                        </Button>
                      </div>
                    </div>

                    {/* 충전 폼 */}
                    {isCharging && (
                      <div className="mt-3 p-3 bg-muted rounded-lg">
                        <p className="text-xs font-medium text-foreground mb-2">잔고 충전 / 차감</p>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            placeholder="금액 입력"
                            value={chargeAmount}
                            onChange={e => setChargeAmount(e.target.value)}
                            className="h-8 text-sm"
                          />
                          <Button
                            size="sm"
                            className="gap-1 h-8 text-xs bg-primary hover:bg-primary/90"
                            onClick={() => handleCharge(user.id, 1)}
                            disabled={chargeLoading}
                          >
                            <Plus className="w-3 h-3" /> 충전
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => handleCharge(user.id, -1)}
                            disabled={chargeLoading}
                          >
                            <Minus className="w-3 h-3" /> 차감
                          </Button>
                        </div>
                        {chargeMsg && (
                          <p className={`text-xs mt-2 ${chargeMsg.ok ? "text-primary" : "text-destructive"}`}>
                            {chargeMsg.text}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
