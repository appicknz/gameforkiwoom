"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Users, Wallet, RefreshCw, Plus, Minus, Shield, LogOut, GitBranch, Trash2, UserCheck, Settings, ToggleLeft, ToggleRight, ImageIcon, Film, Activity, TrendingDown, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { RoundMonitor } from "@/components/admin/round-monitor"

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
  betting_mode: "fixed" | "pari"
  lp_enabled: boolean
  lp_amount: number
  lp_amount_baccarat?: number
  lp_amount_race?: number
  lp_multiplier_baccarat?: number
  lp_multiplier_race?: number
}

// LP 설정 행 컴포넌트
function LpBranchRow({ branch, onSaved }: { branch: Branch; onSaved: () => void }) {
  const [baccaratSeed, setBaccaratSeed] = useState(String(branch.lp_amount_baccarat ?? 10_000_000))
  const [raceSeed, setRaceSeed]         = useState(String(branch.lp_amount_race     ?? 10_000_000))
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const handleSave = async () => {
    setSaving(true); setMsg(null)
    const token = getToken(); if (!token) return
    const res = await fetch("/api/admin/branches/betting", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        branchId: branch.id,
        lpAmountBaccarat: parseInt(baccaratSeed) || 10_000_000,
        lpAmountRace:     parseInt(raceSeed)     || 10_000_000,
      }),
    })
    if (res.ok) { setMsg({ text: "저장됨", ok: true }); onSaved() }
    else { setMsg({ text: "저장 실패", ok: false }) }
    setSaving(false)
    setTimeout(() => setMsg(null), 2000)
  }

  const bSeedNum = parseInt(baccaratSeed) || 10_000_000
  const rSeedNum = parseInt(raceSeed)     || 10_000_000
  // 아무도 배팅 안 했을 때 배당 미리보기
  // 유저 배팅 0 → 수수료 0, 배당풀 = LP시드×3, 각 사이드 = seed
  // 배당 = (seed×3) / seed = 3.0x (항상, 유저 없을 때)
  const previewOdds = (bSeedNum * 3 / bSeedNum).toFixed(2)

  return (
    <div className="px-5 py-4 space-y-3">
      <p className="text-sm font-semibold text-foreground">{branch.name}</p>

      <div className="rounded-lg bg-muted/50 border border-border p-3 space-y-2">
        <p className="text-xs font-medium text-foreground">사이드별 LP 시드 금액</p>
        <p className="text-[11px] text-muted-foreground">
          Player / Banker / Tie 각각 이 금액으로 시작 · 아무도 배팅 안 했을 때 기본 배당: {previewOdds}x
        </p>
        <div className="flex gap-3 flex-wrap items-end">
          <div>
            <p className="text-xs text-muted-foreground mb-1">바카라 시드 (사이드당)</p>
            <Input type="number" step="1000000" min="0" value={baccaratSeed}
              onChange={e => setBaccaratSeed(e.target.value)} className="h-8 w-36 text-sm" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">레이스 시드 (사이드당)</p>
            <Input type="number" step="1000000" min="0" value={raceSeed}
              onChange={e => setRaceSeed(e.target.value)} className="h-8 w-36 text-sm" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </Button>
        {msg && <span className={`text-xs font-medium ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>{msg.text}</span>}
      </div>
    </div>
  )
}

export default function PanelPage() {
  const router = useRouter()
  const [myRole, setMyRole] = useState<string>("")
  const [myUserId, setMyUserId] = useState<string>("")
  const [myBranchCode, setMyBranchCode] = useState<string | null>(null)
  const [profile, setProfile] = useState<{ username: string; role: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [adminPw, setAdminPw] = useState("")
  const [pwInput, setPwInput] = useState("")
  const [pwError, setPwError] = useState("")

  const [activeTab, setActiveTab] = useState<"users" | "branches" | "monitor" | "cards" | "videos">("users")

  // 카드 이미지 관리
  interface CardImage { url: string; pathname: string; uploadedAt: string }
  const [cardImages, setCardImages] = useState<CardImage[]>([])
  const [cardLoading, setCardLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 영상 관리
  interface CardVideo { url: string; pathname: string; uploadedAt: string; size: number }
  const [cardVideos, setCardVideos] = useState<CardVideo[]>([])
  const [videoLoading, setVideoLoading] = useState(false)
  const [videoUploading, setVideoUploading] = useState(false)
  const [videoUploadError, setVideoUploadError] = useState("")
  const [videoUploadProgress, setVideoUploadProgress] = useState<string>("")
  const videoFileInputRef = useRef<HTMLInputElement>(null)

  const loadCardVideos = useCallback(async () => {
    setVideoLoading(true)
    const token = getToken(); if (!token) { setVideoLoading(false); return }
    const res = await fetch("/api/admin/card-videos", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setCardVideos(d.videos ?? []) }
    setVideoLoading(false)
  }, [])

  const handleVideoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setVideoUploading(true); setVideoUploadError(""); setVideoUploadProgress("")
    const token = getToken()
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        setVideoUploadProgress(`업로드 중 ${i + 1}/${files.length}: ${file.name}`)
        const fd = new FormData(); fd.append("file", file)
        const res = await fetch("/api/admin/card-videos", {
          method: "POST", body: fd,
          headers: { Authorization: `Bearer ${token ?? ""}` },
        })
        if (!res.ok) {
          const d = await res.json()
          throw new Error(d.error ?? "업로드 실패")
        }
      }
      setVideoUploadProgress("")
      await loadCardVideos()
    } catch (err: any) {
      setVideoUploadError(err.message ?? "업로드 중 오류가 발생했습니다.")
    } finally {
      setVideoUploading(false)
      if (videoFileInputRef.current) videoFileInputRef.current.value = ""
    }
  }

  const handleVideoDelete = async (pathname: string) => {
    if (!confirm("이 영상을 삭제하시겠습니까?")) return
    const token = getToken()
    const res = await fetch("/api/admin/card-videos", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify({ pathname }),
    })
    if (res.ok) await loadCardVideos()
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  // LP 히스토리
  interface LpTx { id: number; branch_id: string; round_time: number; pool_type: string; side: string; lp_amount: number; user_amount: number; settled_odds: number | null; created_at: string }
  const [lpHistory, setLpHistory] = useState<LpTx[]>([])
  const [lpTotal, setLpTotal] = useState(0)
  const [lpLoading, setLpLoading] = useState(false)

  const loadLpHistory = useCallback(async (branchId?: string) => {
    const token = getToken(); if (!token) return
    setLpLoading(true)
    const url = branchId ? `/api/admin/lp-history?branchId=${branchId}` : "/api/admin/lp-history"
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setLpHistory(d.history ?? []); setLpTotal(d.totalLpUsed ?? 0) }
    setLpLoading(false)
  }, [])

  // 하우스 손익 통계
  interface HouseStat {
    id: number; branch_id: string; game_type: string
    total_bet: number; total_payout: number; total_lp_used: number
    total_fee: number; total_collected: number; updated_at: string
    branches: { name: string; code: string } | null
  }
  interface FeeCollection { id: number; branch_id: string; game_type: string; collected_amount: number; note: string; created_at: string; branches: { name: string } | null }
  interface MasterSummary { totalBet: number; totalPayout: number; totalLpUsed: number; totalFee: number; totalCollected: number; pendingFee: number; houseProfit: number }

  const [houseStats, setHouseStats] = useState<HouseStat[]>([])
  const [feeCollections, setFeeCollections] = useState<FeeCollection[]>([])
  const [masterSummary, setMasterSummary] = useState<MasterSummary | null>(null)
  const [houseLoading, setHouseLoading] = useState(false)
  const [collectingId, setCollectingId] = useState<string | null>(null)

  const loadHouseStats = useCallback(async () => {
    const token = getToken(); if (!token) return
    setHouseLoading(true)
    const res = await fetch("/api/admin/house-stats", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const d = await res.json()
      setHouseStats(d.stats ?? [])
      setFeeCollections(d.collections ?? [])
      setMasterSummary(d.masterSummary ?? null)
    }
    setHouseLoading(false)
  }, [])

  const handleCollect = async (branchId: string, gameType: string) => {
    const key = `${branchId}-${gameType}`
    setCollectingId(key)
    const token = getToken(); if (!token) return
    const res = await fetch("/api/admin/house-stats", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ branch_id: branchId, game_type: gameType, note: "수금 처리" }),
    })
    if (res.ok) await loadHouseStats()
    setCollectingId(null)
  }

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
  const [bettingSettingId, setBettingSettingId] = useState<string | null>(null)
  const [lpInput, setLpInput] = useState("")
  const [bettingMsg, setBettingMsg] = useState<{ text: string; ok: boolean } | null>(null)

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
        setMyUserId(data.profile?.id ?? "")
        setMyRole(role)
        setMyBranchCode(data.profile?.branch_code ?? null)
        setProfile({ username: data.profile?.username ?? "", role })
        setLoading(false)
      })
      .catch(() => router.replace("/"))
  }, [router])

  const handlePwSubmit = async () => {
    setPwError("")
    setLoading(true)

    // 입력한 비밀번호 검증 (실제 로그인 시도)
    const res = await fetch("/api/admin/verify-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: profile?.username,
        password: pwInput,
      }),
    })

    if (!res.ok) {
      setPwError("비밀번호가 올바르지 않습니다.")
      setLoading(false)
      return
    }

    setAdminPw(pwInput)
    setPwInput("")
    setLoading(false)
  }

  // 회원 목록 로드 (branch_admin은 자기 지점만)
  const loadUsers = useCallback(async (pw: string) => {
    setUsersLoading(true)
    const token = getToken()
    if (!token) { setUsersLoading(false); return }
    const res = await fetch(`/api/admin/users`, {
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    })
    const data = await res.json()
    if (!res.ok) {
      setPwError("인증에 실패했습니다.")
      setAdminPw("")
    } else {
      setUsers(data.users ?? [])
    }
    setUsersLoading(false)
  }, [myUserId])

  // 지점 목록 로드
  const loadBranches = useCallback(async (pw: string) => {
    setBranchesLoading(true)
    const token = getToken()
    if (!token) { setBranchesLoading(false); return }
    const res = await fetch(`/api/admin/branches`, {
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    })
    const data = await res.json()
    if (res.ok) setBranches(data.branches ?? [])
    setBranchesLoading(false)
  }, [myUserId])

  const loadCardImages = useCallback(async () => {
    setCardLoading(true)
    const token = getToken(); if (!token) { setCardLoading(false); return }
    const res = await fetch("/api/admin/card-images", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setCardImages(d.images ?? []) }
    setCardLoading(false)
  }, [])

  const handleCardUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    setUploading(true); setUploadError("")
    const token = getToken()
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData(); fd.append("file", file)
        const res = await fetch("/api/admin/card-images", {
          method: "POST", body: fd,
          headers: { Authorization: `Bearer ${token ?? ""}` },
        })
        if (!res.ok) throw new Error("업로드 실패")
      }
      await loadCardImages()
    } catch { setUploadError("업로드 중 오류가 발생했습니다.") }
    finally { setUploading(false); if (fileInputRef.current) fileInputRef.current.value = "" }
  }

  const handleCardDelete = async (url: string) => {
    if (!confirm("이 이미지를 삭제하시겠습니까?")) return
    const token = getToken()
    const res = await fetch("/api/admin/card-images", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
      body: JSON.stringify({ url }),
    })
    if (res.ok) await loadCardImages()
  }

  useEffect(() => {
    if (adminPw && myUserId) {
      loadUsers(adminPw)
      if (SUPER_ROLES.includes(myRole)) loadBranches(adminPw)
    }
  }, [adminPw, myRole, myUserId])

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
      setChargeMsg({ text: "올바른 금액을 ���력하세요.", ok: false })
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
    const token = getToken()
    if (!token) { setBranchLoading(false); return }
    const res = await fetch("/api/admin/branches", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
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

  // 지점 배팅 모드 / LP 설정 변경
  const handleBettingUpdate = async (branchId: string, updates: { bettingMode?: string; lpEnabled?: boolean; lpAmount?: number }) => {
    const token = getToken()
    if (!token) return
    setBettingMsg(null)
    const res = await fetch("/api/admin/branches/betting", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ branchId, ...updates }),
    })
    const data = await res.json()
    if (!res.ok) {
      setBettingMsg({ text: data.error ?? "오류가 발생했습니다.", ok: false })
    } else {
      setBettingMsg({ text: "설정이 저장됐습니다.", ok: true })
      setBranches(prev => prev.map(b => b.id === branchId ? { ...b, ...data.branch } : b))
      setLpInput("")
    }
  }

  // 지점 삭제
  const handleDeleteBranch = async (id: string) => {
    if (!confirm("지점을 삭제하시겠습니까? 소속 회원의 지점코드가 해제됩니다.")) return
    const token = getToken()
    if (!token) return
    await fetch(`/api/admin/branches?id=${id}`, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`,
      },
    })
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
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "users" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
          >
            <Users className="w-4 h-4" /> 회원관리
          </button>
          {isSuperAdmin && (
            <button
              onClick={() => setActiveTab("branches")}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "branches" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
            >
              <GitBranch className="w-4 h-4" /> 지점관리
            </button>
          )}
          <button
            onClick={() => setActiveTab("monitor")}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "monitor" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
          >
            <Activity className="w-4 h-4" /> 라운드 모니터
          </button>
          {isSuperAdmin && (
            <button
              onClick={() => { setActiveTab("cards"); loadCardImages() }}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "cards" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
            >
              <ImageIcon className="w-4 h-4" /> 카드이���지
            </button>
          )}
          {isSuperAdmin && (
            <button
              onClick={() => { setActiveTab("videos"); loadCardVideos() }}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "videos" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
            >
              <Film className="w-4 h-4" /> 영상관리
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
                  {bettingMsg && (
                    <p className={`px-5 py-2 text-xs font-medium ${bettingMsg.ok ? "text-primary bg-primary/5" : "text-destructive bg-destructive/5"}`}>
                      {bettingMsg.text}
                    </p>
                  )}
                  {branches.map(branch => {
                    const isSettingOpen = bettingSettingId === branch.id
                    const isPari = branch.betting_mode === "pari"
                    return (
                      <div key={branch.id} className="px-5 py-4">
                        <div className="flex items-center justify-between">
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
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${isPari ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
                                  {isPari ? "파리뮤추얼" : "고정배당"}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                관리자: {branch.owner_email ?? "미지정"} · {formatDate(branch.created_at)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm" variant="ghost"
                              className="gap-1 text-xs text-muted-foreground hover:text-foreground"
                              onClick={() => { setBettingSettingId(isSettingOpen ? null : branch.id); setBettingMsg(null); setLpInput("") }}
                            >
                              <Settings className="w-3.5 h-3.5" /> 설정
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              className="text-destructive hover:bg-destructive/10 gap-1 text-xs"
                              onClick={() => handleDeleteBranch(branch.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" /> 삭제
                            </Button>
                          </div>
                        </div>

                        {/* 배팅 모드 설정 패널 */}
                        {isSettingOpen && (
                          <div className="mt-3 p-4 bg-muted/50 rounded-xl border border-border space-y-4">
                            <p className="text-xs font-semibold text-foreground">배팅 모드 설정</p>

                            {/* 모드 토글 */}
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium text-foreground">
                                  {isPari ? "파리뮤추얼 (동적 배당)" : "고정 배당 (x1.95)"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {isPari ? "참가자 풀에 따라 배당이 실시간 변동됩니다." : "모든 배팅에 고정 1.95배가 적용됩니다."}
                                </p>
                              </div>
                              <button
                                onClick={() => handleBettingUpdate(branch.id, { bettingMode: isPari ? "fixed" : "pari" })}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                                style={{ background: isPari ? "#7c3aed20" : "#f3f4f6", color: isPari ? "#7c3aed" : "#6b7280" }}
                              >
                                {isPari ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                                {isPari ? "파리뮤추얼 ON" : "고정배당 ON"}
                              </button>
                            </div>

                            {/* LP 설정 (파리뮤추얼 모드에서만 표시) */}
                            {isPari && (
                              <div className="space-y-3 pt-3 border-t border-border">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <p className="text-sm font-medium text-foreground">초기 유동성 (LP)</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                      현재: {branch.lp_enabled ? `₩${branch.lp_amount.toLocaleString()} 활성` : "비활성"}
                                    </p>
                                  </div>
                                  <button
                                    onClick={() => handleBettingUpdate(branch.id, { lpEnabled: !branch.lp_enabled })}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                                    style={{ background: branch.lp_enabled ? "#10b98120" : "#f3f4f6", color: branch.lp_enabled ? "#10b981" : "#6b7280" }}
                                  >
                                    {branch.lp_enabled ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                                    {branch.lp_enabled ? "LP 활성" : "LP 비활성"}
                                  </button>
                                </div>
                                {branch.lp_enabled && (
                                  <div className="flex gap-2">
                                    <Input
                                      type="number"
                                      placeholder={`LP 금액 (현재: ₩${branch.lp_amount.toLocaleString()})`}
                                      value={lpInput}
                                      onChange={e => setLpInput(e.target.value)}
                                      className="h-8 text-sm"
                                    />
                                    <Button
                                      size="sm" className="h-8 text-xs shrink-0"
                                      disabled={!lpInput}
                                      onClick={() => handleBettingUpdate(branch.id, { lpAmount: parseFloat(lpInput) })}
                                    >
                                      저장
                                    </Button>
                                  </div>
                                )}
                                <p className="text-[11px] text-muted-foreground">
                                  LP는 라��드 시작 시 6개 풀에 균등 배분됩니다. 최소 참가자 전에도 자연스러운 배당이 표시됩니다.
                                </p>
                              </div>
                            )}
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
        {/* LP 히스토리 탭 - 라운드 모니터로 통합됨 (이 블록은 도달 안됨) */}
        {false && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">LP 유동성 히스토리</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">파리뮤추얼 라운드별 LP 투입 기록</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">총 LP 사용액</p>
                  <p className="text-sm font-bold text-foreground">₩{lpTotal.toLocaleString()}</p>
                </div>
              </div>

              {lpLoading ? (
                <div className="flex justify-center py-10"><div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : lpHistory.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">LP 사용 내역이 없습니다.</div>
              ) : (
                <div className="divide-y divide-border">
                  {lpHistory.map(tx => {
                    const poolLabel: Record<string, string> = { long_short: "롱/숏", under_over: "언더/오버", odd_even: "홀/짝" }
                    const sideLabel = tx.side === "a" ? "A (롱·언더·홀)" : "B (숏·오버·짝)"
                    return (
                      <div key={tx.id} className="px-5 py-3 flex items-center justify-between text-sm">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-foreground">{poolLabel[tx.pool_type] ?? tx.pool_type}</span>
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 font-medium">{sideLabel}</span>
                            {tx.settled_odds != null && (
                              <span className="text-xs text-muted-foreground">확정 x{tx.settled_odds.toFixed(2)}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            라운드 {new Date(tx.round_time * 1000).toLocaleString("ko-KR")} · 사용자 배팅 ₩{tx.user_amount.toLocaleString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-foreground">₩{tx.lp_amount.toLocaleString()}</p>
                          <p className="text-[11px] text-muted-foreground">{new Date(tx.created_at).toLocaleTimeString("ko-KR")}</p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 하우스 손익 탭 - 라운드 모니터로 통합됨 */}
        {false && (
          <div className="space-y-5">

            {/* 마스터 전체 집계 요약 */}
            {masterSummary && (
              <div className="bg-card border border-border rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4 text-primary" /> 전체 지점 합산
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { label: "총 배팅액", value: masterSummary.totalBet, color: "text-foreground" },
                    { label: "총 지급액", value: masterSummary.totalPayout, color: "text-red-500" },
                    { label: "하우스 손익", value: masterSummary.houseProfit, color: masterSummary.houseProfit >= 0 ? "text-emerald-500" : "text-red-500" },
                    { label: "총 LP 사용", value: masterSummary.totalLpUsed, color: "text-blue-500" },
                    { label: "누적 수수료", value: masterSummary.totalFee, color: "text-amber-500" },
                    { label: "수금 완료", value: masterSummary.totalCollected, color: "text-muted-foreground" },
                    { label: "미수금", value: masterSummary.pendingFee, color: masterSummary.pendingFee > 0 ? "text-orange-500" : "text-muted-foreground" },
                  ].map(item => (
                    <div key={item.label} className="bg-background rounded-xl p-3">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className={`text-base font-bold tabular-nums mt-0.5 ${item.color}`}>
                        {item.value >= 0 ? "" : "-"}₩{Math.abs(item.value).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 지점별 상세 */}
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">지점별 하우스 손익</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">게임 유형별 배팅·지급·LP·수수료 집계</p>
                </div>
                <Button variant="ghost" size="sm" onClick={loadHouseStats} disabled={houseLoading} className="gap-1.5 text-xs">
                  <RefreshCw className={`w-3.5 h-3.5 ${houseLoading ? "animate-spin" : ""}`} /> 새로고침
                </Button>
              </div>

              {houseLoading ? (
                <div className="py-10 flex justify-center">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : houseStats.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">아직 집계 데이터가 없습니다.</div>
              ) : (
                <div className="divide-y divide-border">
                  {houseStats.map(stat => {
                    const pending = Math.max(0, stat.total_fee - stat.total_collected)
                    const housePnl = stat.total_bet - stat.total_payout
                    const key = `${stat.branch_id}-${stat.game_type}`
                    return (
                      <div key={stat.id} className="px-5 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">
                              {stat.branches?.name ?? stat.branch_id}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                              {stat.game_type === "baccarat" ? "바카라" : "레이스"}
                            </span>
                          </div>
                          {isSuperAdmin && pending > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1.5"
                              disabled={collectingId === key}
                              onClick={() => handleCollect(stat.branch_id, stat.game_type)}
                            >
                              <Download className="w-3 h-3" />
                              {collectingId === key ? "처리 중..." : `₩${pending.toLocaleString()} 수금`}
                            </Button>
                          )}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                          <div>
                            <p className="text-muted-foreground">총 배팅</p>
                            <p className="font-semibold text-foreground tabular-nums">₩{stat.total_bet.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">총 지급</p>
                            <p className="font-semibold text-red-500 tabular-nums">₩{stat.total_payout.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">하우스 손익</p>
                            <p className={`font-bold tabular-nums ${housePnl >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                              {housePnl >= 0 ? "+" : "-"}₩{Math.abs(housePnl).toLocaleString()}
                            </p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">LP 사용</p>
                            <p className="font-semibold text-blue-500 tabular-nums">₩{stat.total_lp_used.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">미수금 수수료</p>
                            <p className={`font-bold tabular-nums ${pending > 0 ? "text-orange-500" : "text-muted-foreground"}`}>
                              ₩{pending.toLocaleString()}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 수금 이력 */}
            {feeCollections.length > 0 && (
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">수금 이력</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">최근 20건</p>
                </div>
                <div className="divide-y divide-border">
                  {feeCollections.map(fc => (
                    <div key={fc.id} className="px-5 py-3 flex items-center justify-between text-sm">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-foreground">{fc.branches?.name ?? fc.branch_id}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                            {fc.game_type === "baccarat" ? "바카라" : "레이스"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{fc.note} · {new Date(fc.created_at).toLocaleString("ko-KR")}</p>
                      </div>
                      <p className="font-bold text-emerald-500 tabular-nums">₩{fc.collected_amount.toLocaleString()}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 지점별 LP 설정 (마스터 전용) */}
            {isSuperAdmin && (
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">지점별 LP 금액 설정</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">바카라 / 레이스 게임별 LP 유동성 금액 (마스터 전용)</p>
                </div>
                <div className="divide-y divide-border">
                  {branches.map(branch => (
                    <LpBranchRow key={branch.id} branch={branch} onSaved={loadHouseStats} />
                  ))}
                  {branches.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">지점이 없습니다.</p>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 라운드 모니터 탭 (LP 히스토리 + 하우스 손익 통합) */}
        {activeTab === "monitor" && (
          <div className="space-y-5">
            <RoundMonitor isSuperAdmin={isSuperAdmin} branches={branches} />
          </div>
        )}

        {/* 카드관리 탭 */}
        {activeTab === "cards" && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">카드 이미지 관리</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">바카라 게임에 표시될 카드 이미지를 업로드하세요</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleCardUpload}
                    className="hidden"
                  />
                  <Button
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="gap-1.5 text-xs"
                  >
                    {uploading ? "업로드 중..." : "이미지 추가"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadCardImages}
                    disabled={cardLoading}
                    className="gap-1.5 text-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${cardLoading ? "animate-spin" : ""}`} /> 새로고침
                  </Button>
                </div>
              </div>

              {uploadError && (
                <div className="px-5 py-2 bg-destructive/10 border-b border-border">
                  <p className="text-xs text-destructive">{uploadError}</p>
                </div>
              )}

              {cardLoading ? (
                <div className="flex justify-center py-10">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : cardImages.length === 0 ? (
                <div className="py-16 text-center">
                  <ImageIcon className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
                  <p className="text-sm text-muted-foreground">등록된 카드 이미지가 없습니다.</p>
                  <p className="text-xs text-muted-foreground mt-1">이미지를 추가해주세요.</p>
                </div>
              ) : (
                <div className="p-5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                    {cardImages.map((img, idx) => (
                      <div key={img.url} className="relative group">
                        <div className="aspect-[2/3] rounded-lg overflow-hidden bg-muted border border-border relative">
                          <img
                            src={img.url}
                            alt={`Card ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center">
                            <button
                              onClick={() => handleCardDelete(img.url)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground rounded-full p-2 hover:bg-destructive/90"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          <div className="absolute top-2 left-2 bg-background/90 backdrop-blur-sm text-foreground text-xs font-semibold px-2 py-1 rounded-full">
                            #{idx + 1}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      총 {cardImages.length}개 카드 이미지 • 라운드마다 순번 기반 랜덤 표시
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 영상관리 탭 */}
        {activeTab === "videos" && (
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-border flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">영상 관리</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">배팅 시작 시 카드에 표시될 영상을 업로드하세요 (MP4 / WebM / MOV)</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={videoFileInputRef}
                    type="file"
                    accept="video/mp4,video/webm,video/mov,video/quicktime"
                    multiple
                    onChange={handleVideoUpload}
                    className="hidden"
                  />
                  <Button
                    size="sm"
                    onClick={() => videoFileInputRef.current?.click()}
                    disabled={videoUploading}
                    className="gap-1.5 text-xs"
                  >
                    <Film className="w-3.5 h-3.5" />
                    {videoUploading ? (videoUploadProgress || "업로드 중...") : "영상 추가"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadCardVideos}
                    disabled={videoLoading}
                    className="gap-1.5 text-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${videoLoading ? "animate-spin" : ""}`} /> 새로고침
                  </Button>
                </div>
              </div>

              {videoUploadError && (
                <div className="px-5 py-2 bg-destructive/10 border-b border-border">
                  <p className="text-xs text-destructive">{videoUploadError}</p>
                </div>
              )}

              {videoLoading ? (
                <div className="flex justify-center py-10">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : cardVideos.length === 0 ? (
                <div className="py-16 text-center">
                  <Film className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
                  <p className="text-sm text-muted-foreground">등록된 영상이 없습니다.</p>
                  <p className="text-xs text-muted-foreground mt-1">영상 파일을 추가해주세요.</p>
                </div>
              ) : (
                <div className="p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {cardVideos.map((video, idx) => (
                      <div key={video.url} className="relative group">
                        <div className="aspect-[2/3] rounded-lg overflow-hidden bg-black border border-border relative">
                          <video
                            src={video.url}
                            className="w-full h-full object-cover"
                            muted
                            loop
                            playsInline
                            preload="metadata"
                            onMouseEnter={e => (e.currentTarget as HTMLVideoElement).play()}
                            onMouseLeave={e => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0 }}
                          />
                          {/* hover overlay with delete */}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center">
                            <button
                              onClick={() => handleVideoDelete(video.pathname)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity bg-destructive text-destructive-foreground rounded-full p-2 hover:bg-destructive/90"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          {/* index badge */}
                          <div className="absolute top-2 left-2 bg-background/90 backdrop-blur-sm text-foreground text-xs font-semibold px-2 py-1 rounded-full">
                            #{idx + 1}
                          </div>
                          {/* file size badge */}
                          <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                            {formatFileSize(video.size)}
                          </div>
                        </div>
                        <p className="mt-1.5 text-[11px] text-muted-foreground truncate px-0.5">
                          {video.pathname.split("/").pop()}
                        </p>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-border">
                    <p className="text-xs text-muted-foreground">
                      총 {cardVideos.length}개 영상 • 호버 시 미리보기 • 라운드마다 순번 기반 랜덤 재생
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  )
}
