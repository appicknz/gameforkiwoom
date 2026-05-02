"use client"

import { useState, useRef, useCallback } from "react"
import { Lock, Shield, Upload, Trash2, ImageIcon, Users, TrendingUp, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"

interface UserRow {
  id: string
  username: string
  role: string
  balance: number
  created_at: string
}

interface DistributorPnl {
  id: string
  username: string
  rate_profit: number
  fee_total: number
  exchange_payout: number
  net_pnl: number
}

interface CardImage {
  url: string
  pathname: string
  uploadedAt: string
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

type Tab = "users" | "cards" | "pnl"

export default function AdminPage() {
  const [pw, setPw] = useState("")
  const [authed, setAuthed] = useState(false)
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<Tab>("users")

  // 손익 state
  const [pnlList, setPnlList] = useState<DistributorPnl[]>([])
  const [pnlLoading, setPnlLoading] = useState(false)
  const [pnlPeriod, setPnlPeriod] = useState<"all" | "month" | "last_month">("all")

  const loadPnl = useCallback(async (period: "all" | "month" | "last_month" = "all") => {
    setPnlLoading(true)
    const params = period !== "all" ? `?all=1&period=${period}` : "?all=1"
    const res = await fetch(`/api/admin/distributor-pnl${params}&pw=${encodeURIComponent(pw)}`)
    if (res.ok) { const d = await res.json(); setPnlList(d.pnl ?? []) }
    setPnlLoading(false)
  }, [pw])

  // 회원 관리
  const [users, setUsers] = useState<UserRow[]>([])

  // 카드 이미지 관리
  const [cardImages, setCardImages] = useState<CardImage[]>([])
  const [cardLoading, setCardLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleLogin = async () => {
    setLoading(true)
    setError("")
    const res = await fetch(`/api/admin/users?pw=${encodeURIComponent(pw)}`)
    if (res.ok) {
      const data = await res.json()
      setUsers(data.users ?? [])
      setAuthed(true)
      // 카드 이미지도 함께 로드
      fetchCardImages()
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

  const fetchCardImages = async () => {
    setCardLoading(true)
    try {
      const res = await fetch(`/api/admin/card-images?pw=${encodeURIComponent(pw)}`)
      if (res.ok) {
        const data = await res.json()
        setCardImages(data.images ?? [])
      }
    } finally {
      setCardLoading(false)
    }
  }

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true)
    setUploadError("")
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData()
        fd.append("file", file)
        const res = await fetch(`/api/admin/card-images?pw=${encodeURIComponent(pw)}`, {
          method: "POST",
          body: fd,
        })
        if (!res.ok) throw new Error("업로드 실패")
      }
      await fetchCardImages()
    } catch {
      setUploadError("업로드 중 오류가 발생했습니다.")
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  const handleDelete = async (url: string) => {
    if (!confirm("이 이미지를 삭제하시겠습니까?")) return
    try {
      const res = await fetch(`/api/admin/card-images?pw=${encodeURIComponent(pw)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      })
      if (res.ok) await fetchCardImages()
    } catch {
      alert("삭제 중 오류가 발생했습니다.")
    }
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
              <p className="text-xs text-muted-foreground">마스터 관리자</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={tab === "users" ? refresh : fetchCardImages} disabled={loading || cardLoading}>
            {loading || cardLoading ? "로딩..." : "새로고침"}
          </Button>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 mb-6 bg-muted rounded-xl p-1 w-fit">
          <button
            onClick={() => setTab("users")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "users"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Users className="w-4 h-4" />
            회원 관리
          </button>
          <button
            onClick={() => { setTab("cards"); fetchCardImages() }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "cards"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            카드 관리
          </button>
          <button
            onClick={() => { setTab("pnl"); loadPnl(pnlPeriod) }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "pnl"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            총판 손익
          </button>
        </div>

        {/* 회원 관리 탭 */}
        {tab === "users" && (
          <>
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
                <h2 className="text-sm font-semibold text-foreground">회원 목록 ({users.length}명)</h2>
              </div>
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
                        <td className="px-4 py-3 text-right font-mono text-sm">₩{u.balance.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-xs text-muted-foreground">
                          {new Date(u.created_at).toLocaleDateString("ko-KR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
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
                <div className="py-16 text-center text-muted-foreground text-sm">등록된 회원이 없습니다.</div>
              )}
            </div>
          </>
        )}

        {/* 카드 관리 탭 */}
        {tab === "cards" && (
          <div className="space-y-6">
            {/* 업로드 안내 */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-foreground mb-1">카드 이미지 관리</h2>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    업로드한 이미지는 순번 순서대로 카드 배경으로 사용됩니다.<br />
                    각 라운드에서 순번 기반으로 하나가 선택되어 카드에 오버레이됩니다.<br />
                    JPG, PNG, WebP 파일을 지원합니다.
                  </p>
                </div>
                <div className="shrink-0">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleUpload}
                  />
                  <Button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    {uploading ? "업로드 중..." : "이미지 추가"}
                  </Button>
                </div>
              </div>
              {uploadError && <p className="text-xs text-destructive">{uploadError}</p>}
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                <ImageIcon className="w-3.5 h-3.5" />
                <span>현재 등록된 이미지: <strong className="text-foreground">{cardImages.length}장</strong></span>
              </div>
            </div>

            {/* 이미지 그리드 */}
            {cardLoading ? (
              <div className="py-16 text-center text-muted-foreground text-sm">불러오는 중...</div>
            ) : cardImages.length === 0 ? (
              <div className="bg-card border border-dashed border-border rounded-xl py-20 text-center">
                <ImageIcon className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">업로드된 카드 이미지가 없습니다.</p>
                <p className="text-xs text-muted-foreground mt-1">위의 "이미지 추가" 버튼으로 업로드하세요.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {cardImages.map((img, idx) => (
                  <div key={img.pathname} className="group relative bg-card border border-border rounded-xl overflow-hidden aspect-[3/4]">
                    {/* 순번 배지 */}
                    <div className="absolute top-2 left-2 z-10 bg-black/70 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      #{idx + 1}
                    </div>
                    {/* 이미지 */}
                    <img
                      src={img.url}
                      alt={`카드 이미지 #${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {/* 호버 오버레이 */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => handleDelete(img.url)}
                        className="flex items-center gap-1.5 bg-destructive text-destructive-foreground text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-destructive/90 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        삭제
                      </button>
                    </div>
                    {/* 파일명 */}
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-2">
                      <p className="text-white text-xs truncate">{img.pathname.split("/").pop()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        {/* 총판 손익 탭 */}
        {tab === "pnl" && (
          <div>
            {/* 기간 필터 */}
            <div className="flex items-center gap-2 mb-6">
              {(["all", "month", "last_month"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => { setPnlPeriod(p); loadPnl(p) }}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    pnlPeriod === p
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {p === "all" ? "전체" : p === "month" ? "이번달" : "지난달"}
                </button>
              ))}
              <button
                onClick={() => loadPnl(pnlPeriod)}
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium bg-muted text-muted-foreground hover:text-foreground transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${pnlLoading ? "animate-spin" : ""}`} /> 새로고침
              </button>
            </div>

            {pnlLoading ? (
              <div className="py-20 flex justify-center">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
              </div>
            ) : pnlList.length === 0 ? (
              <div className="py-20 text-center text-sm text-muted-foreground">데이터가 없습니다.</div>
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <h2 className="text-sm font-semibold text-foreground">총판별 손익 현황</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50 text-muted-foreground text-xs">
                        <th className="text-left px-4 py-3 font-medium">총판</th>
                        <th className="text-right px-4 py-3 font-medium">요율 차익</th>
                        <th className="text-right px-4 py-3 font-medium">수수료</th>
                        <th className="text-right px-4 py-3 font-medium">환전 지급</th>
                        <th className="text-right px-4 py-3 font-medium">순 손익</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pnlList.map((d, i) => (
                        <tr key={d.id} className={`border-t border-border hover:bg-muted/30 transition-colors ${i % 2 === 0 ? "" : "bg-muted/10"}`}>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                                {d.username.slice(0, 1).toUpperCase()}
                              </div>
                              <span className="font-medium text-foreground">{d.username}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-600">
                            +₩{d.rate_profit.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-600">
                            +₩{d.fee_total.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-red-500">
                            -₩{d.exchange_payout.toLocaleString()}
                          </td>
                          <td className={`px-4 py-3 text-right font-mono font-bold ${d.net_pnl >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                            {d.net_pnl >= 0 ? "+" : ""}₩{d.net_pnl.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    {/* 합계 행 */}
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/30 font-semibold text-xs">
                        <td className="px-4 py-3 text-muted-foreground">합계</td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-600">
                          +₩{pnlList.reduce((s, d) => s + d.rate_profit, 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-emerald-600">
                          +₩{pnlList.reduce((s, d) => s + d.fee_total, 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-red-500">
                          -₩{pnlList.reduce((s, d) => s + d.exchange_payout, 0).toLocaleString()}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono ${pnlList.reduce((s, d) => s + d.net_pnl, 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                          {pnlList.reduce((s, d) => s + d.net_pnl, 0) >= 0 ? "+" : ""}₩{pnlList.reduce((s, d) => s + d.net_pnl, 0).toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
