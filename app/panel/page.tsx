"use client"

import { useEffect, useState, useCallback } from "react"
import { Users, Wallet, RefreshCw, Plus, Minus, Shield, LogOut, GitBranch, Trash2, UserCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"

const SUPER_ROLES = ["master", "super_admin"]
const ADMIN_ROLES = ["master", "super_admin", "branch_admin"]

function getToken(): string | null {
  try { return localStorage.getItem("app_token") } catch { return null }
}

interface User {
  id: string
  username: string
  role: string
  created_at: string
  balance: number
  branch_code: string | null
}

interface Branch {
  id: string
  code: string
  name: string
  status: string
  owner_email: string | null
  created_at: string
}

export default function PanelPage() {
  const router = useRouter()
  const [myRole, setMyRole] = useState<string>("")
  const [myBranchCode, setMyBranchCode] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [adminPw, setAdminPw] = useState("")
  const [pwInput, setPwInput] = useState("")
  const [pwError, setPwError] = useState("")

  const [activeTab, setActiveTab] = useState<"users" | "branches">("users")

  // 회원 목록
  const [users, setUsers] = useState<User[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [chargeUserId, setChargeUserId] = useState<string | null>(null)
  const [chargeAmount, setChargeAmount] = useState("")
  const [chargeLoading, setChargeLoading] = useState(false)
  const [chargeMsg, setChargeMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // 지점 관리
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchesLoading, setBranchesLoading] = useState(false)
  const [newBranchName, setNewBranchName] = useState("")
  const [newBranchCode, setNewBranchCode] = useState("")
  const [newBranchOwner, setNewBranchOwner] = useState("")
  const [ownerSearch, setOwnerSearch] = useState("")
  const [ownerDropdownOpen, setOwnerDropdownOpen] = useState(false)
  const [branchMsg, setBranchMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [branchLoading, setBranchLoading] = useState(false)

  // 권한 확인
  useEffect(() => {
    const token = getToken()
    if (!token) { router.replace("/"); return }
    fetch("/api/user/profile", { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) { router.replace("/"); return }
        const data = await res.json()
        const role = data.profile?.role ?? ""
        if (!ADMIN_ROLES.includes(role)) { router.replace("/"); return }
        setMyRole(role)
        setMyBranchCode(data.profile?.branch_code ?? null)
        setLoading(false)
      })
      .catch(() => router.replace("/"))
  }, [router])

  const handlePwSubmit = () => {
    setPwError("")
    setAdminPw(pwInput)
  }

  // 회원 목록 로드 (branch_admin은 자기 지점만)
  const loadUsers = useCallback(async (pw: string) => {
    setUsersLoading(true)
    const params = new URLSearchParams({ pw })
    if (myRole === "branch_admin" && myBranchCode) {
      params.set("branch_code", myBranchCode)
    }
    const res = await fetch(`/api/admin/users?${params}`)
    const data = await res.json()
    if (!res.ok) {
      setPwError("비밀번호가 올바르지 않습니다.")
      setAdminPw("")
    } else {
      setUsers(data.users ?? [])
    }
    setUsersLoading(false)
  }, [myRole, myBranchCode])

  // 지점 목록 로드
  const loadBranches = useCallback(async (pw: string) => {
    setBranchesLoading(true)
    const res = await fetch(`/api/admin/branches?pw=${encodeURIComponent(pw)}`)
    const data = await res.json()
    if (res.ok) setBranches(data.branches ?? [])
    setBranchesLoading(false)
  }, [])

  useEffect(() => {
    if (adminPw) {
      loadUsers(adminPw)
      if (SUPER_ROLES.includes(myRole)) loadBranches(adminPw)
    }
  }, [adminPw, myRole, loadUsers, loadBranches])

  // 잔고 충전/차감
  const handleCharge = async (userId: string, delta: number) => {
    setChargeLoading(true)
    setChargeMsg(null)
    const token = getToken()
    if (!token) {
      setChargeMsg({ text: "세션이 만료되었습니다.", ok: false })
      setChargeLoading(false)
      return
    }
    const amount = parseInt(chargeAmount)
    if (!chargeAmount || isNaN(amount) || amount <= 0) {
      setChargeMsg({ text: "올바른 금액을 입력하세요.", ok: false })
      setChargeLoading(false)
      return
    }
    const res = await fetch("/api/admin/charge", {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ userId, amount: delta * amount }),
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

  // 지점 생성
  const handleCreateBranch = async () => {
    setBranchLoading(true)
    setBranchMsg(null)
    const res = await fetch("/api/admin/branches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        pw: adminPw,
        name: newBranchName,
        code: newBranchCode.trim().toUpperCase(),
        ownerUsername: newBranchOwner.trim(),
      }),
    })
    const data = await res.json()
    if (!res.ok) {
      setBranchMsg({ text: data.error ?? "오류가 발생했습니다.", ok: false })
    } else {
      setBranchMsg({ text: `지점 '${newBranchName}'이 생성됐습니다.`, ok: true })
      setNewBranchName("")
      setNewBranchCode("")
      setNewBranchOwner("")
      setOwnerSearch("")
      loadBranches(adminPw)
      loadUsers(adminPw)
    }
    setBranchLoading(false)
  }

  // 지점 삭제
  const handleDeleteBranch = async (id: string) => {
    if (!confirm("지점을 삭제하시겠습니까? 소속 회원의 지점코드가 해제됩니다.")) return
    await fetch(`/api/admin/branches?pw=${encodeURIComponent(adminPw)}&id=${id}`, { method: "DELETE" })
    loadBranches(adminPw)
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

  if (!adminPw) {
    const isBranchAdmin = myRole === "branch_admin"
    const pwLabel = isBranchAdmin ? "본인 비밀번호" : "마스터 비밀번호"
    const pwDescription = isBranchAdmin ? "지점 관리 작업을 위해 본인 비밀번호를 입력하세요." : "관리 작업을 위해 마스터 비밀번호를 입력하세요."

    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-full max-w-sm p-8 bg-card border border-border rounded-2xl shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Shield className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">관리자 인증</h1>
          </div>
          <p className="text-xs text-muted-foreground mb-6">{pwDescription}</p>
          <div className="space-y-3">
            <Input
              type="password"
              placeholder={pwLabel}
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

  const isSuperAdmin = SUPER_ROLES.includes(myRole)

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-semibold text-foreground">관리자 패널</h1>
          {myBranchCode && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
              지점코드: {myBranchCode}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.replace("/")} className="gap-1.5 text-muted-foreground">
          <LogOut className="w-4 h-4" /> 나가기
        </Button>
      </header>

      <div className="border-b border-border bg-card">
        <div className="flex px-6">
          <button
            onClick={() => setActiveTab("users")}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "users" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="w-4 h-4" /> 회원관리
          </button>
          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab("branches")}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "branches" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <GitBranch className="w-4 h-4" /> 지점관리
            </button>
          )}
        </div>
      </div>

      <main className="p-6 max-w-5xl mx-auto">

        {/* 회원관리 탭 */}
        {activeTab === "users" && (
          <>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">
                  {myRole === "branch_admin" ? "소속 지점 회원" : "전체 회원"}
                </p>
                <p className="text-2xl font-bold text-foreground">{users.length}명</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">총 잔고</p>
                <p className="text-2xl font-bold text-foreground">
                  {formatBalance(users.reduce((s, u) => s + u.balance, 0))}
                </p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">회원 목록</h2>
                <Button variant="ghost" size="sm" onClick={() => loadUsers(adminPw)} disabled={usersLoading} className="gap-1.5 text-xs">
                  <RefreshCw className={`w-3.5 h-3.5 ${usersLoading ? "animate-spin" : ""}`} /> 새로고침
                </Button>
              </div>

              {usersLoading ? (
                <div className="py-12 flex justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {users.length === 0 && (
                    <p className="py-10 text-center text-sm text-muted-foreground">회원이 없습니다.</p>
                  )}
                  {users.map(user => {
                    const rl = roleLabel[user.role] ?? { label: user.role, color: "bg-gray-100 text-gray-600" }
                    const isCharging = chargeUserId === user.id
                    return (
                      <div key={user.id} className="px-5 py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-xs font-semibold text-primary">{user.username.charAt(0)}</span>
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-foreground">{user.username}</span>
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${rl.color}`}>{rl.label}</span>
                                {user.branch_code && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-600 font-medium">
                                    {user.branch_code}
                                  </span>
                                )}
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
                              size="sm" variant="outline" className="text-xs gap-1"
                              onClick={() => { setChargeUserId(isCharging ? null : user.id); setChargeAmount(""); setChargeMsg(null) }}
                            >
                              <Wallet className="w-3 h-3" />
                              {isCharging ? "닫기" : "충전"}
                            </Button>
                          </div>
                        </div>
                        {isCharging && (
                          <div className="mt-3 p-3 bg-muted rounded-lg">
                            <p className="text-xs font-medium text-foreground mb-2">잔고 충전 / 차감</p>
                            <div className="flex gap-2">
                              <Input type="number" placeholder="금액 입력" value={chargeAmount} onChange={e => setChargeAmount(e.target.value)} className="h-8 text-sm" />
                              <Button size="sm" className="gap-1 h-8 text-xs" onClick={() => handleCharge(user.id, 1)} disabled={chargeLoading}>
                                <Plus className="w-3 h-3" /> 충전
                              </Button>
                              <Button size="sm" variant="outline" className="gap-1 h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleCharge(user.id, -1)} disabled={chargeLoading}>
                                <Minus className="w-3 h-3" /> 차감
                              </Button>
                            </div>
                            {chargeMsg && <p className={`text-xs mt-2 ${chargeMsg.ok ? "text-primary" : "text-destructive"}`}>{chargeMsg.text}</p>}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* 지점관리 탭 (super_admin/master 전용) */}
        {activeTab === "branches" && isSuperAdmin && (
          <>
            {/* 지점 생성 폼 */}
            <div className="bg-card border border-border rounded-xl p-5 mb-6">
              <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-primary" /> 새 지점 생성
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
                <Input
                  placeholder="지점명 (예: 역삼1지점)"
                  value={newBranchName}
                  onChange={e => setNewBranchName(e.target.value)}
                />
                <Input
                  placeholder="지점코드 (예: YS001)"
                  value={newBranchCode}
                  onChange={e => setNewBranchCode(e.target.value.toUpperCase())}
                />
                {/* 지점관리자 검색 (필수) */}
                <div className="relative">
                  <UserCheck className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground z-10" />
                  <Input
                    className="pl-9"
                    placeholder="지점관리자 아이디 검색 (필수)"
                    value={ownerSearch}
                    onChange={e => {
                      setOwnerSearch(e.target.value)
                      setNewBranchOwner("")
                      setOwnerDropdownOpen(true)
                    }}
                    onFocus={() => setOwnerDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setOwnerDropdownOpen(false), 150)}
                  />
                  {newBranchOwner && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-primary font-medium">
                      {newBranchOwner} 선택됨
                    </span>
                  )}
                  {ownerDropdownOpen && ownerSearch.length >= 1 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {users
                        .filter(u => u.username.toLowerCase().includes(ownerSearch.toLowerCase()) && u.role !== "master")
                        .slice(0, 10)
                        .map(u => (
                          <button
                            key={u.id}
                            type="button"
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-muted flex items-center justify-between"
                            onMouseDown={() => {
                              setNewBranchOwner(u.username)
                              setOwnerSearch(u.username)
                              setOwnerDropdownOpen(false)
                            }}
                          >
                            <span>{u.username}</span>
                            <span className="text-xs text-muted-foreground">{roleLabel[u.role]?.label ?? u.role}</span>
                          </button>
                        ))}
                      {users.filter(u => u.username.toLowerCase().includes(ownerSearch.toLowerCase()) && u.role !== "master").length === 0 && (
                        <p className="px-4 py-3 text-sm text-muted-foreground">검색 결과 없음</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
              {branchMsg && <p className={`text-xs mb-3 ${branchMsg.ok ? "text-primary" : "text-destructive"}`}>{branchMsg.text}</p>}
              <Button onClick={handleCreateBranch} disabled={branchLoading || !newBranchName || !newBranchCode || !newBranchOwner} className="gap-1.5 text-sm">
                <Plus className="w-4 h-4" /> 지점 생성
              </Button>
            </div>

            {/* 지점 목록 */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">지점 목록</h2>
                <Button variant="ghost" size="sm" onClick={() => loadBranches(adminPw)} disabled={branchesLoading} className="gap-1.5 text-xs">
                  <RefreshCw className={`w-3.5 h-3.5 ${branchesLoading ? "animate-spin" : ""}`} /> 새로고침
                </Button>
              </div>

              {branchesLoading ? (
                <div className="py-12 flex justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {branches.length === 0 && (
                    <p className="py-10 text-center text-sm text-muted-foreground">생성된 지점이 없습니다.</p>
                  )}
                  {branches.map(branch => (
                    <div key={branch.id} className="px-5 py-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <GitBranch className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{branch.name}</span>
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 font-mono font-medium">
                              {branch.code}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            관리자: {branch.owner_email ?? "미지정"} · {formatDate(branch.created_at)}
                          </p>
                        </div>
                      </div>
                      <Button
                        size="sm" variant="ghost"
                        className="text-destructive hover:bg-destructive/10 gap-1 text-xs"
                        onClick={() => handleDeleteBranch(branch.id)}
                      >
                        <Trash2 className="w-3.5 h-3.5" /> 삭제
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
