"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Users, Wallet, RefreshCw, Plus, Minus, Shield, LogOut, GitBranch, Trash2, UserCheck, Settings, ToggleLeft, ToggleRight, Activity, TrendingDown, TrendingUp, Download, Banknote, CalendarDays, ArrowLeftRight, KeyRound, ChevronDown, ChevronRight, Trophy, ImageIcon, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { RoundMonitor } from "@/components/admin/round-monitor"
import { RoundHistory } from "@/components/admin/round-history"

const SUPER_ROLES = ["master", "super_admin"]
const ADMIN_ROLES = ["master", "super_admin", "branch_admin", "admin"]

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
// 시드는 역대 실시간 배팅 데이터로 자동 계산됨.
// 여기서는 "초기 기본 시드(데이터 없을 때 사용)" 와 "감쇠 속도"만 설정.
function LpBranchRow({ branch, onSaved }: { branch: Branch; onSaved: () => void }) {
  const [fallbackSeed, setFallbackSeed] = useState(
    String(branch.lp_amount_baccarat ?? 100_000)
  )
  const [multiplier, setMultiplier] = useState(branch.lp_multiplier_baccarat ?? 1.0)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const handleSave = async () => {
    setSaving(true); setMsg(null)
    const token = getToken(); if (!token) return
    const seed = parseInt(fallbackSeed) || 100_000
    const res = await fetch("/api/admin/branches/betting", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        branchId:             branch.id,
        lpAmountBaccarat:     seed,
        lpAmountRace:         seed,
        lpMultiplierBaccarat: multiplier,
        lpMultiplierRace:     multiplier,
      }),
    })
    if (res.ok) { setMsg({ text: "저장됨", ok: true }); onSaved() }
    else { setMsg({ text: "저장 실패", ok: false }) }
    setSaving(false)
    setTimeout(() => setMsg(null), 2000)
  }

  const DECAY_OPTIONS = [
    { label: "빠름", val: 0.5, desc: "유저 배팅이 시드×1.5 되면 LP 50% 감쇠" },
    { label: "기본", val: 1.0, desc: "유저 배팅이 시드×3 되면 LP 50% 감쇠"   },
    { label: "느림", val: 2.0, desc: "유저 배팅이 시드×6 되면 LP 50% 감쇠"   },
  ]

  return (
    <div className="px-5 py-4 space-y-4">
      <p className="text-sm font-semibold text-foreground">{branch.name}</p>

      {/* 자동 계산 안내 */}
      <div className="rounded-lg bg-muted/60 border border-border p-3 text-xs space-y-1">
        <p className="font-medium text-foreground">LP 시드 자동 계산 활성</p>
        <p className="text-muted-foreground">
          3라운드 이상 데이터가 쌓이면 역대 라운드 평균 배팅액으로 시드를 자동 결정합니다.
          초기에만 아래 기본값을 사용합니다.
        </p>
      </div>

      <div className="flex gap-4 flex-wrap items-end">
        {/* 초기 기본 시드 */}
        <div>
          <p className="text-xs font-medium text-foreground mb-1">초기 기본 시드 (사이드당)</p>
          <p className="text-[11px] text-muted-foreground mb-1.5">데이터 부족 시 사용, 3라운드 후 자동 대체</p>
          <Input
            type="number" step="10000" min="0"
            value={fallbackSeed}
            onChange={e => setFallbackSeed(e.target.value)}
            className="h-8 w-36 text-sm"
          />
        </div>

        {/* 감쇠 속도 */}
        <div>
          <p className="text-xs font-medium text-foreground mb-1">감쇠 속도</p>
          <p className="text-[11px] text-muted-foreground mb-1.5">유저 배팅이 얼마나 쌓이면 LP가 줄어드는지</p>
          <div className="flex gap-1.5">
            {DECAY_OPTIONS.map(({ label, val, desc }) => (
              <button
                key={val}
                onClick={() => setMultiplier(val)}
                title={desc}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  multiplier === val
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={saving}>
          {saving ? "저장 중..." : "저장"}
        </Button>
        {msg && (
          <span className={`text-xs font-medium ${msg.ok ? "text-emerald-500" : "text-red-500"}`}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  )
}

export default function PanelPage() {
  const router = useRouter()
  const [myRole, setMyRole] = useState<string>("")
  const [myUserId, setMyUserId] = useState<string>("")
  const [myBranchCode, setMyBranchCode] = useState<string | null>(null)
  const [myBranchId, setMyBranchId] = useState<string | undefined>(undefined)
  const [profile, setProfile] = useState<{ username: string; role: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [adminPw, setAdminPw] = useState("")
  const [pwInput, setPwInput] = useState("")
  const [pwError, setPwError] = useState("")

  const [activeTab, setActiveTab] = useState<"users" | "branches" | "monitor" | "history" | "points" | "cash" | "calendar" | "pnl" | "cards">("users")

  // 카드 이미지 관리 state (master 전용)
  interface CardImage { url: string; pathname: string; uploadedAt: string }
  const [cardImages, setCardImages] = useState<CardImage[]>([])
  const [cardLoading, setCardLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const cardFileInputRef = useRef<HTMLInputElement>(null)

  const fetchCardImages = useCallback(async () => {
    const token = getToken(); if (!token) return
    setCardLoading(true)
    try {
      const res = await fetch(`/api/admin/card-images`, { headers: { Authorization: `Bearer ${token}` } })
      if (res.ok) { const d = await res.json(); setCardImages(d.images ?? []) }
    } finally { setCardLoading(false) }
  }, [])

  const handleCardUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files; if (!files || files.length === 0) return
    const token = getToken(); if (!token) return
    setUploading(true); setUploadError("")
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData(); fd.append("file", file)
        const res = await fetch("/api/admin/card-images", { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd })
        if (!res.ok) throw new Error("업로드 실패")
      }
      await fetchCardImages()
    } catch { setUploadError("업로드 중 오류가 발생했습니다.") }
    finally { setUploading(false); if (cardFileInputRef.current) cardFileInputRef.current.value = "" }
  }

  const handleCardDelete = async (url: string) => {
    if (!confirm("이 이미지를 삭제하시겠습니까?")) return
    const token = getToken(); if (!token) return
    const res = await fetch("/api/admin/card-images", { method: "DELETE", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ url }) })
    if (res.ok) await fetchCardImages()
    else alert("삭제 중 오류가 발생했습니다.")
  }

  // 손익 state
  interface PnlData { rate_profit: number; fee_total: number; exchange_payout: number; net_pnl: number; balance: number; cash_balance: number }
  const [pnlData, setPnlData] = useState<PnlData | null>(null)
  const [pnlLoading, setPnlLoading] = useState(false)
  const [pnlPeriod, setPnlPeriod] = useState<"all" | "month" | "last_month">("all")

  const loadPnl = useCallback(async (period: "all" | "month" | "last_month" = "all") => {
    const token = getToken(); if (!token) return
    setPnlLoading(true)
    const params = period !== "all" ? `?period=${period}` : ""
    const res = await fetch(`/api/admin/distributor-pnl${params}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setPnlData(d) }
    setPnlLoading(false)
  }, [])


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

  const [pwChecking, setPwChecking] = useState(false)

  const handlePwSubmit = async () => {
    if (!pwInput.trim()) return
    setPwError("")
    setPwChecking(true)

    const token = getToken()
    const res = await fetch("/api/admin/verify-password", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        username: profile?.username,
        password: pwInput,
      }),
    })

    setPwChecking(false)

    if (!res.ok) {
      const d = await res.json().catch(() => ({}))
      setPwError(d.error ?? "비밀번호가 올바르지 않습니다.")
      return
    }

    setAdminPw(pwInput)
    setPwInput("")
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



  useEffect(() => {
    if (adminPw && myUserId) {
      loadUsers(adminPw)
      // superadmin: 전체 지점 로드
      // branch_admin: 자기 지점 id 파악을 위해 branches 로드 후 myBranchId 설정
      loadBranches(adminPw).then(() => {
        // branches 상태는 비동기로 업데이트되므로 직접 fetch
        if (myRole === "branch_admin" && myBranchCode) {
          const token = getToken()
          if (!token) return
          fetch("/api/admin/branches", { headers: { Authorization: `Bearer ${token}` } })
            .then(r => r.json())
            .then(d => {
              const found = (d.branches ?? []).find((b: { code: string; id: string }) => b.code === myBranchCode)
              if (found) setMyBranchId(found.id)
            })
            .catch(() => {})
        }
      })
    }
  }, [adminPw, myRole, myUserId, myBranchCode])

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
    master:       { label: "마스터",     color: "bg-purple-100 text-purple-700" },
    super_admin:  { label: "수퍼관리자", color: "bg-red-100 text-red-700" },
    branch_admin: { label: "지점관리자", color: "bg-blue-100 text-blue-700" },
    admin:        { label: "관리자",     color: "bg-orange-100 text-orange-700" },
    user:         { label: "일반회원",   color: "bg-gray-100 text-gray-600" },
  }

  // ── 포인트 구매 요청 (현금 내고 포인트 사기) ──
  const [ppRequests, setPpRequests]         = useState<any[]>([])
  const [ppLoading, setPpLoading]           = useState(false)
  const [ppCashAmt, setPpCashAmt]           = useState("")
  const [ppMemo, setPpMemo]                 = useState("")
  const [ppSubmitting, setPpSubmitting]     = useState(false)
  const [ppMsg, setPpMsg]                   = useState<{ text: string; ok: boolean } | null>(null)
  // 승인 모달
  const [ppApproveId, setPpApproveId]       = useState<string | null>(null)
  const [ppApprovePw, setPpApprovePw]       = useState("")
  const [ppApprovePoints, setPpApprovePoints] = useState("")
  const [ppApproveMsg, setPpApproveMsg]     = useState<{ text: string; ok: boolean } | null>(null)
  const [ppApproving, setPpApproving]       = useState(false)

  // ── 포인트 충전 요청 (임시계정 생성) ──
  const [pcRequests, setPcRequests]         = useState<any[]>([])
  const [pcLoading, setPcLoading]           = useState(false)
  const [pcPointAmt, setPcPointAmt]         = useState("")
  const [pcMemo, setPcMemo]                 = useState("")
  const [pcSubmitting, setPcSubmitting]     = useState(false)
  const [pcMsg, setPcMsg]                   = useState<{ text: string; ok: boolean } | null>(null)
  const [pcApproveId, setPcApproveId]       = useState<string | null>(null)
  const [pcApproving, setPcApproving]       = useState(false)
  const [pcApproveMsg, setPcApproveMsg]     = useState<{ text: string; ok: boolean } | null>(null)
  // 계정 활성화
  const [pcActivateId, setPcActivateId]     = useState<string | null>(null)
  const [pcActivatePw1, setPcActivatePw1]   = useState("")
  const [pcActivatePw2, setPcActivatePw2]   = useState("")
  const [pcActivating, setPcActivating]     = useState(false)
  const [pcActivateMsg, setPcActivateMsg]   = useState<{ text: string; ok: boolean } | null>(null)

  // ── 환전 요청 ──
  const [exRequests, setExRequests]         = useState<any[]>([])
  const [exLoading, setExLoading]           = useState(false)
  const [exTargetId, setExTargetId]         = useState("")
  const [exPointAmt, setExPointAmt]         = useState("")
  const [exMemo, setExMemo]                 = useState("")
  const [exSubmitting, setExSubmitting]     = useState(false)
  const [exMsg, setExMsg]                   = useState<{ text: string; ok: boolean } | null>(null)
  const [exApproveId, setExApproveId]       = useState<string | null>(null)
  const [exApproving, setExApproving]       = useState(false)
  const [exApproveMsg, setExApproveMsg]     = useState<{ text: string; ok: boolean } | null>(null)

  // ── 비밀번호 초기화 요청 ──
  const [prRequests, setPrRequests]         = useState<any[]>([])
  const [prLoading, setPrLoading]           = useState(false)
  const [prTargetId, setPrTargetId]         = useState("")
  const [prSubmitting, setPrSubmitting]     = useState(false)
  const [prMsg, setPrMsg]                   = useState<{ text: string; ok: boolean } | null>(null)
  const [prApproveId, setPrApproveId]       = useState<string | null>(null)
  const [prNewPw, setPrNewPw]               = useState("")
  const [prApproving, setPrApproving]       = useState(false)
  const [prApproveMsg, setPrApproveMsg]     = useState<{ text: string; ok: boolean } | null>(null)

  // ── 현금 잔고 & 거래이력 ──
  const [cashBalance, setCashBalance]       = useState(0)
  const [pointBalance, setPointBalance]     = useState(0)
  const [cashTxns, setCashTxns]             = useState<any[]>([])
  const [subBalances, setSubBalances]       = useState<any[]>([])
  const [cashLoading, setCashLoading]       = useState(false)

  // ── 달력 매출 ──
  const [calYear, setCalYear]               = useState(new Date().getFullYear())
  const [calMonth, setCalMonth]             = useState(new Date().getMonth() + 1)
  const [calData, setCalData]               = useState<any[]>([])
  const [calLoading, setCalLoading]         = useState(false)
  const [calSelectedDate, setCalSelectedDate] = useState<string | null>(null)
  const [calBranchFilter, setCalBranchFilter] = useState("")
  const [memberDetail, setMemberDetail]     = useState<any | null>(null)
  const [expandedUser, setExpandedUser]     = useState<string | null>(null)

  // ── loaders ──
  const loadPpRequests = useCallback(async () => {
    const token = getToken(); if (!token) return
    setPpLoading(true)
    const res = await fetch("/api/admin/point-purchase", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setPpRequests(d.requests ?? []) }
    setPpLoading(false)
  }, [])

  const loadPcRequests = useCallback(async () => {
    const token = getToken(); if (!token) return
    setPcLoading(true)
    const res = await fetch("/api/admin/point-charge", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setPcRequests(d.requests ?? []) }
    setPcLoading(false)
  }, [])

  const loadExRequests = useCallback(async () => {
    const token = getToken(); if (!token) return
    setExLoading(true)
    const res = await fetch("/api/admin/exchange-request", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setExRequests(d.requests ?? []) }
    setExLoading(false)
  }, [])

  const loadPrRequests = useCallback(async () => {
    const token = getToken(); if (!token) return
    setPrLoading(true)
    const res = await fetch("/api/admin/password-reset", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) { const d = await res.json(); setPrRequests(d.requests ?? []) }
    setPrLoading(false)
  }, [])

  const loadCash = useCallback(async () => {
    const token = getToken(); if (!token) return
    setCashLoading(true)
    const res = await fetch("/api/admin/cash", { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const d = await res.json()
      setCashBalance(d.cashBalance ?? 0)
      setPointBalance(d.pointBalance ?? 0)
      setCashTxns(d.transactions ?? [])
      setSubBalances(d.subBalances ?? [])
    }
    setCashLoading(false)
  }, [])

  const loadCalendar = useCallback(async (year: number, month: number, branch?: string, date?: string) => {
    const token = getToken(); if (!token) return
    setCalLoading(true)
    const params = new URLSearchParams({ year: String(year), month: String(month) })
    if (branch) params.set("branch_code", branch)
    if (date) params.set("date", date)
    const res = await fetch(`/api/admin/daily-sales?${params}`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) {
      const d = await res.json()
      setCalData(d.calendar ?? [])
      if (date) setMemberDetail(d.memberDetail ?? null)
    }
    setCalLoading(false)
  }, [])

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
            <Button className="w-full" onClick={handlePwSubmit} disabled={pwChecking}>
              {pwChecking ? "확인 중..." : "확인"}
            </Button>
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
          <button
            onClick={() => setActiveTab("history")}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "history" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
          >
            <TrendingDown className="w-4 h-4" /> 라운드 기록
          </button>

          <button
            onClick={() => { setActiveTab("points"); loadPpRequests(); loadPcRequests() }}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "points" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <Wallet className="w-4 h-4" /> 포인트
          </button>
          <button
            onClick={() => { setActiveTab("cash"); loadCash(); loadExRequests(); loadPrRequests() }}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "cash" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <Banknote className="w-4 h-4" /> 현금/환전
          </button>
          <button
            onClick={() => { setActiveTab("calendar"); loadCalendar(calYear, calMonth, calBranchFilter || undefined) }}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "calendar" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            <CalendarDays className="w-4 h-4" /> 매출달력
          </button>
          {isSuperAdmin && (
            <button
              onClick={() => { setActiveTab("pnl"); loadPnl(pnlPeriod) }}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "pnl" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <TrendingUp className="w-4 h-4" /> 손익
            </button>
          )}
          {myRole === "master" && (
            <button
              onClick={() => { setActiveTab("cards"); fetchCardImages() }}
              className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === "cards" ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              <ImageIcon className="w-4 h-4" /> 카드관리
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

                  {branches.map(branch => {
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
                              </div>
                              <p className="text-xs text-muted-foreground">
                                관리자: {branch.owner_email ?? "미지정"} · {formatDate(branch.created_at)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm" variant="ghost"
                              className="text-destructive hover:bg-destructive/10 gap-1 text-xs"
                              onClick={() => handleDeleteBranch(branch.id)}
                            >
                              <Trash2 className="w-3.5 h-3.5" /> 삭제
                            </Button>
                          </div>
                        </div>


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
                              {housePnl >= 0 ? "+" : "-"}���{Math.abs(housePnl).toLocaleString()}
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

        {/* 라운드 모니터 + 자동배팅 통합 탭 */}
        {activeTab === "monitor" && (
          <div>
            <RoundMonitor
              isSuperAdmin={isSuperAdmin}
              branchId={isSuperAdmin ? undefined : myBranchId}
              branches={branches}
            />
          </div>
        )}

        {/* 라운드 기록 탭 */}
        {activeTab === "history" && (
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="mb-4">
              <h2 className="text-base font-semibold">라운드 기록</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                바카라·레이스 라운드별 결과, 배당, 참여 회원 및 수익을 확인합니다.
              </p>
            </div>
            <RoundHistory />
          </div>
        )}



        {/* ───────────── 포인트 탭 ───────────── */}
        {activeTab === "points" && (
          <div className="space-y-6">

            {/* 포인트 구매 요청 (현금 내고 포인트 사기) — super_admin/branch_admin/admin */}
            {!isSuperAdmin && (
              <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Wallet className="w-4 h-4 text-primary" /> 포인트 구매 요청</h2>
                <p className="text-xs text-muted-foreground">현금 금액을 입력하고 요청하면 마스터/수퍼관리자가 포인트를 지급합니다.</p>
                <div className="flex gap-2">
                  <Input placeholder="현금 금액" type="number" value={ppCashAmt} onChange={e => setPpCashAmt(e.target.value)} className="h-9 text-sm w-40" />
                  <Input placeholder="메모 (선택)" value={ppMemo} onChange={e => setPpMemo(e.target.value)} className="h-9 text-sm flex-1" />
                  <Button size="sm" className="h-9 shrink-0" disabled={ppSubmitting} onClick={async () => {
                    setPpSubmitting(true); setPpMsg(null)
                    const token = getToken()
                    const res = await fetch("/api/admin/point-purchase", {
                      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ cashAmount: Number(ppCashAmt), memo: ppMemo }),
                    })
                    const d = await res.json()
                    setPpMsg(res.ok ? { text: "요청됐습니다.", ok: true } : { text: d.error ?? "오류", ok: false })
                    if (res.ok) { setPpCashAmt(""); setPpMemo(""); loadPpRequests() }
                    setPpSubmitting(false)
                  }}>요청</Button>
                </div>
                {ppMsg && <p className={`text-xs ${ppMsg.ok ? "text-primary" : "text-destructive"}`}>{ppMsg.text}</p>}
              </div>
            )}

            {/* 포인트 구매 요청 목록 */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">포인트 구매 요청 목록</h2>
                <Button variant="ghost" size="sm" onClick={loadPpRequests} disabled={ppLoading} className="gap-1.5 text-xs">
                  <RefreshCw className={`w-3.5 h-3.5 ${ppLoading ? "animate-spin" : ""}`} /> 새로고침
                </Button>
              </div>
              <div className="divide-y divide-border">
                {ppRequests.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">요청이 없습니다.</p>}
                {ppRequests.map((r: any) => (
                  <div key={r.id} className="px-5 py-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{r.requester?.username}</span>
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{r.requester_role}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${r.status === "approved" ? "bg-green-100 text-green-700" : r.status === "rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>{r.status === "pending" ? "대기" : r.status === "approved" ? "승인" : "거절"}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">현금 ₩{r.cash_amount?.toLocaleString()} {r.point_amount ? `→ 포인트 ${r.point_amount?.toLocaleString()}` : ""} {r.memo ? `· ${r.memo}` : ""}</p>
                      <p className="text-[10px] text-muted-foreground/60">{new Date(r.created_at).toLocaleString("ko-KR")}</p>
                    </div>
                    {isSuperAdmin && r.status === "pending" && (
                      <div className="flex gap-1.5 shrink-0">
                        <Button size="sm" variant="outline" className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={async () => {
                          const token = getToken()
                          await fetch("/api/admin/point-purchase", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ requestId: r.id, action: "reject" }) })
                          loadPpRequests()
                        }}>거절</Button>
                        <Button size="sm" className="h-8 text-xs" onClick={() => { setPpApproveId(r.id); setPpApprovePw(""); setPpApprovePoints(""); setPpApproveMsg(null) }}>승인</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 승인 모달 (포인트 구매) */}
            {ppApproveId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
                  <h3 className="text-sm font-semibold text-foreground">포인트 구매 승인</h3>
                  <div className="space-y-2">
                    <Input type="password" placeholder="내 비밀번호 입력" value={ppApprovePw} onChange={e => setPpApprovePw(e.target.value)} className="h-9 text-sm" />
                    <Input type="number" placeholder="지급할 포인트 금액" value={ppApprovePoints} onChange={e => setPpApprovePoints(e.target.value)} className="h-9 text-sm" />
                  </div>
                  {ppApproveMsg && <p className={`text-xs ${ppApproveMsg.ok ? "text-primary" : "text-destructive"}`}>{ppApproveMsg.text}</p>}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setPpApproveId(null)}>취소</Button>
                    <Button size="sm" className="flex-1" disabled={ppApproving} onClick={async () => {
                      setPpApproving(true); setPpApproveMsg(null)
                      const token = getToken()
                      const res = await fetch("/api/admin/point-purchase", {
                        method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ requestId: ppApproveId, pointAmount: Number(ppApprovePoints), password: ppApprovePw }),
                      })
                      const d = await res.json()
                      setPpApproveMsg(res.ok ? { text: `승인 완료. ${d.pointAmount?.toLocaleString()} 포인트 지급됨`, ok: true } : { text: d.error ?? "오류", ok: false })
                      if (res.ok) { loadPpRequests(); setTimeout(() => setPpApproveId(null), 1500) }
                      setPpApproving(false)
                    }}>승인 확인</Button>
                  </div>
                </div>
              </div>
            )}

            {/* 포인트 충전 요청 (임시계정 생성) — 모든 admin 역할 */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><Plus className="w-4 h-4 text-primary" /> 포인트 충전 요청 (유저 계정 생성)</h2>
              <p className="text-xs text-muted-foreground">승인되면 포인트가 충전된 임시 계정이 자동 생성됩니다.</p>
              <div className="flex gap-2">
                <Input placeholder="충전 포인트" type="number" value={pcPointAmt} onChange={e => setPcPointAmt(e.target.value)} className="h-9 text-sm w-40" />
                <Input placeholder="메모 (선택)" value={pcMemo} onChange={e => setPcMemo(e.target.value)} className="h-9 text-sm flex-1" />
                <Button size="sm" className="h-9 shrink-0" disabled={pcSubmitting} onClick={async () => {
                  setPcSubmitting(true); setPcMsg(null)
                  const token = getToken()
                  const res = await fetch("/api/admin/point-charge", {
                    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ pointAmount: Number(pcPointAmt), memo: pcMemo }),
                  })
                  const d = await res.json()
                  setPcMsg(res.ok ? { text: "충전 요청됐습니다.", ok: true } : { text: d.error ?? "오류", ok: false })
                  if (res.ok) { setPcPointAmt(""); setPcMemo(""); loadPcRequests() }
                  setPcSubmitting(false)
                }}>요청</Button>
              </div>
              {pcMsg && <p className={`text-xs ${pcMsg.ok ? "text-primary" : "text-destructive"}`}>{pcMsg.text}</p>}
            </div>

            {/* 충전 요청 목록 */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">충전 요청 목록</h2>
                <Button variant="ghost" size="sm" onClick={loadPcRequests} disabled={pcLoading} className="gap-1.5 text-xs">
                  <RefreshCw className={`w-3.5 h-3.5 ${pcLoading ? "animate-spin" : ""}`} /> 새로고침
                </Button>
              </div>
              <div className="divide-y divide-border">
                {pcRequests.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">요청이 없습니다.</p>}
                {pcRequests.map((r: any) => (
                  <div key={r.id} className="px-5 py-4 space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{r.requester?.username}</span>
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{r.branch_code ?? "지점없음"}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${r.status === "approved" || r.status === "activated" ? "bg-green-100 text-green-700" : r.status === "rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                            {r.status === "pending" ? "대기" : r.status === "approved" ? "승인(미활성)" : r.status === "activated" ? "활성화" : "거절"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">포인트 {r.point_amount?.toLocaleString()} {r.memo ? `· ${r.memo}` : ""}</p>
                        {(r.status === "approved" || r.status === "activated") && r.temp_username && (
                          <p className="text-xs font-mono bg-muted rounded px-2 py-1 mt-1 text-foreground">
                            ID: {r.temp_username} {r.status === "approved" ? `/ PW: ${r.temp_password}` : "(활성화됨)"}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{new Date(r.created_at).toLocaleString("ko-KR")}</p>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {isSuperAdmin && r.status === "pending" && (
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline" className="h-7 text-xs text-destructive border-destructive/30" onClick={async () => {
                              const token = getToken()
                              await fetch("/api/admin/point-charge", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ requestId: r.id, action: "reject" }) })
                              loadPcRequests()
                            }}>거절</Button>
                            <Button size="sm" className="h-7 text-xs" disabled={pcApproving && pcApproveId === r.id} onClick={async () => {
                              setPcApproveId(r.id); setPcApproving(true); setPcApproveMsg(null)
                              const token = getToken()
                              const res = await fetch("/api/admin/point-charge", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ requestId: r.id, action: "approve" }) })
                              const d = await res.json()
                              setPcApproveMsg(res.ok ? { text: `승인됨: ${d.tempUsername} / ${d.tempPassword}`, ok: true } : { text: d.error ?? "오류", ok: false })
                              if (res.ok) loadPcRequests()
                              setPcApproving(false); setPcApproveId(null)
                            }}>승인</Button>
                          </div>
                        )}
                        {r.status === "approved" && (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { setPcActivateId(r.id); setPcActivatePw1(""); setPcActivatePw2(""); setPcActivateMsg(null) }}>
                            비밀번호 설정
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 계정 활성화 모달 */}
            {pcActivateId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
                  <h3 className="text-sm font-semibold text-foreground">계정 비밀번호 설정</h3>
                  <p className="text-xs text-muted-foreground">사용자에게 전달할 비밀번호를 두 번 입력해 검증합니다.</p>
                  <div className="space-y-2">
                    <Input type="password" placeholder="새 비밀번호" value={pcActivatePw1} onChange={e => setPcActivatePw1(e.target.value)} className="h-9 text-sm" />
                    <Input type="password" placeholder="새 비밀번호 확인" value={pcActivatePw2} onChange={e => setPcActivatePw2(e.target.value)} className="h-9 text-sm" />
                  </div>
                  {pcActivateMsg && <p className={`text-xs ${pcActivateMsg.ok ? "text-primary" : "text-destructive"}`}>{pcActivateMsg.text}</p>}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setPcActivateId(null)}>취소</Button>
                    <Button size="sm" className="flex-1" disabled={pcActivating} onClick={async () => {
                      setPcActivating(true); setPcActivateMsg(null)
                      if (pcActivatePw1 !== pcActivatePw2) { setPcActivateMsg({ text: "비밀번호가 일치하지 않습니다.", ok: false }); setPcActivating(false); return }
                      const token = getToken()
                      const res = await fetch("/api/admin/point-charge", {
                        method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ requestId: pcActivateId, action: "activate", password1: pcActivatePw1, password2: pcActivatePw2 }),
                      })
                      const d = await res.json()
                      setPcActivateMsg(res.ok ? { text: `활성화됨: ${d.username}`, ok: true } : { text: d.error ?? "오류", ok: false })
                      if (res.ok) { loadPcRequests(); setTimeout(() => setPcActivateId(null), 1500) }
                      setPcActivating(false)
                    }}>확인</Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ───────────── 현금/환전 탭 ───────────── */}
        {activeTab === "cash" && (
          <div className="space-y-6">

            {/* 내 잔고 요약 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">내 현금 잔고</p>
                <p className="text-2xl font-bold text-foreground">₩{cashBalance.toLocaleString()}</p>
              </div>
              <div className="bg-card border border-border rounded-xl p-4">
                <p className="text-xs text-muted-foreground mb-1">내 포인트 잔고</p>
                <p className="text-2xl font-bold text-foreground">{pointBalance.toLocaleString()} P</p>
              </div>
            </div>

            {/* 하위 역할 잔고 현황 (master/super_admin만) */}
            {isSuperAdmin && subBalances.length > 0 && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-3 border-b border-border flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-foreground">하위 계정 잔고 현황</h2>
                  <Button variant="ghost" size="sm" onClick={loadCash} disabled={cashLoading} className="text-xs gap-1.5">
                    <RefreshCw className={`w-3.5 h-3.5 ${cashLoading ? "animate-spin" : ""}`} /> 새로고침
                  </Button>
                </div>
                <div className="divide-y divide-border">
                  {subBalances.map((s: any) => (
                    <div key={s.userId} className="px-5 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">{s.username}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${roleLabel[s.role]?.color ?? "bg-gray-100 text-gray-600"}`}>{roleLabel[s.role]?.label ?? s.role}</span>
                      </div>
                      <div className="flex gap-4 text-right text-xs">
                        <div><p className="text-muted-foreground">현금</p><p className="font-semibold text-foreground">₩{s.cashAmount.toLocaleString()}</p></div>
                        <div><p className="text-muted-foreground">포인트</p><p className="font-semibold text-foreground">{s.pointAmount.toLocaleString()} P</p></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 환전 요청 생성 */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><ArrowLeftRight className="w-4 h-4 text-primary" /> 환전 요청</h2>
              <p className="text-xs text-muted-foreground">유저 아이디와 환전할 포인트를 입력하면 수퍼관리자/마스터가 승인합니다. 승인 시 해당 포인트가 차감됩니다.</p>
              <div className="flex gap-2 flex-wrap">
                <Input placeholder="유저 아이디" value={exTargetId} onChange={e => setExTargetId(e.target.value)} className="h-9 text-sm w-40" />
                <Input placeholder="포인트 금액" type="number" value={exPointAmt} onChange={e => setExPointAmt(e.target.value)} className="h-9 text-sm w-36" />
                <Input placeholder="메모 (선택)" value={exMemo} onChange={e => setExMemo(e.target.value)} className="h-9 text-sm flex-1" />
                <Button size="sm" className="h-9 shrink-0" disabled={exSubmitting} onClick={async () => {
                  setExSubmitting(true); setExMsg(null)
                  const token = getToken()
                  const res = await fetch("/api/admin/exchange-request", {
                    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ targetUsername: exTargetId, pointAmount: Number(exPointAmt), memo: exMemo }),
                  })
                  const d = await res.json()
                  setExMsg(res.ok ? { text: "환전 요청됐습니다.", ok: true } : { text: d.error ?? "오류", ok: false })
                  if (res.ok) { setExTargetId(""); setExPointAmt(""); setExMemo(""); loadExRequests() }
                  setExSubmitting(false)
                }}>요청</Button>
              </div>
              {exMsg && <p className={`text-xs ${exMsg.ok ? "text-primary" : "text-destructive"}`}>{exMsg.text}</p>}
            </div>

            {/* 환전 요청 목록 */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">환전 요청 목록</h2>
                <Button variant="ghost" size="sm" onClick={loadExRequests} disabled={exLoading} className="text-xs gap-1.5">
                  <RefreshCw className={`w-3.5 h-3.5 ${exLoading ? "animate-spin" : ""}`} /> 새로고침
                </Button>
              </div>
              <div className="divide-y divide-border">
                {exRequests.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">요청이 없습니다.</p>}
                {exRequests.map((r: any) => (
                  <div key={r.id} className="px-5 py-4 flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{r.target_user?.username}</span>
                        <span className="text-xs font-semibold text-foreground">{r.point_amount?.toLocaleString()} P</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${r.status === "approved" ? "bg-green-100 text-green-700" : r.status === "rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                          {r.status === "pending" ? "대기" : r.status === "approved" ? "완료" : "거절"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">요청자: {r.requester?.username} {r.memo ? `· ${r.memo}` : ""}</p>
                      <p className="text-[10px] text-muted-foreground/60">{new Date(r.created_at).toLocaleString("ko-KR")}</p>
                    </div>
                    {isSuperAdmin && r.status === "pending" && (
                      <div className="flex gap-1.5 shrink-0">
                        <Button size="sm" variant="outline" className="h-8 text-xs text-destructive border-destructive/30" onClick={async () => {
                          const token = getToken()
                          await fetch("/api/admin/exchange-request", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ requestId: r.id, action: "reject" }) })
                          loadExRequests()
                        }}>거절</Button>
                        <Button size="sm" className="h-8 text-xs" disabled={exApproving && exApproveId === r.id} onClick={async () => {
                          setExApproveId(r.id); setExApproving(true)
                          const token = getToken()
                          const res = await fetch("/api/admin/exchange-request", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ requestId: r.id, action: "approve" }) })
                          const d = await res.json()
                          setExApproveMsg(res.ok ? { text: "승인됨", ok: true } : { text: d.error ?? "오류", ok: false })
                          if (res.ok) loadExRequests()
                          setExApproving(false); setExApproveId(null)
                        }}>승인</Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {exApproveMsg && <p className={`text-xs text-center ${exApproveMsg.ok ? "text-primary" : "text-destructive"}`}>{exApproveMsg.text}</p>}

            {/* 비밀번호 초기화 요청 */}
            {["branch_admin", "admin"].includes(myRole) && (
              <div className="bg-card border border-border rounded-xl p-5 space-y-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-2"><KeyRound className="w-4 h-4 text-primary" /> 비밀번호 초기화 요청</h2>
                <div className="flex gap-2">
                  <Input placeholder="유저 아이디" value={prTargetId} onChange={e => setPrTargetId(e.target.value)} className="h-9 text-sm flex-1" />
                  <Button size="sm" className="h-9 shrink-0" disabled={prSubmitting} onClick={async () => {
                    setPrSubmitting(true); setPrMsg(null)
                    const token = getToken()
                    const res = await fetch("/api/admin/password-reset", {
                      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                      body: JSON.stringify({ targetUsername: prTargetId }),
                    })
                    const d = await res.json()
                    setPrMsg(res.ok ? { text: "초기화 요청됐습니다.", ok: true } : { text: d.error ?? "오류", ok: false })
                    if (res.ok) { setPrTargetId(""); loadPrRequests() }
                    setPrSubmitting(false)
                  }}>요청</Button>
                </div>
                {prMsg && <p className={`text-xs ${prMsg.ok ? "text-primary" : "text-destructive"}`}>{prMsg.text}</p>}
              </div>
            )}

            {/* 비밀번호 초기화 목록 (super/master만) */}
            {isSuperAdmin && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                  <h2 className="text-sm font-semibold text-foreground">비밀번호 초기화 요청 목록</h2>
                  <Button variant="ghost" size="sm" onClick={loadPrRequests} disabled={prLoading} className="text-xs gap-1.5">
                    <RefreshCw className={`w-3.5 h-3.5 ${prLoading ? "animate-spin" : ""}`} /> 새로고침
                  </Button>
                </div>
                <div className="divide-y divide-border">
                  {prRequests.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">요청이 없습니다.</p>}
                  {prRequests.map((r: any) => (
                    <div key={r.id} className="px-5 py-4 flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground">{r.target_user?.username}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${r.status === "approved" ? "bg-green-100 text-green-700" : r.status === "rejected" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                            {r.status === "pending" ? "대기" : r.status === "approved" ? "완료" : "거절"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">요청자: {r.requester?.username}</p>
                      </div>
                      {r.status === "pending" && (
                        <div className="flex gap-1.5 shrink-0">
                          <Button size="sm" variant="outline" className="h-8 text-xs text-destructive border-destructive/30" onClick={async () => {
                            const token = getToken()
                            await fetch("/api/admin/password-reset", { method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ requestId: r.id, action: "reject" }) })
                            loadPrRequests()
                          }}>거절</Button>
                          <Button size="sm" className="h-8 text-xs" onClick={() => { setPrApproveId(r.id); setPrNewPw(""); setPrApproveMsg(null) }}>승인</Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 비밀번호 초기화 승인 모달 */}
            {prApproveId && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                <div className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm space-y-4 shadow-2xl">
                  <h3 className="text-sm font-semibold text-foreground">비밀번호 초기화 승인</h3>
                  <Input type="password" placeholder="새 비밀번호 (4자 이상)" value={prNewPw} onChange={e => setPrNewPw(e.target.value)} className="h-9 text-sm" />
                  {prApproveMsg && <p className={`text-xs ${prApproveMsg.ok ? "text-primary" : "text-destructive"}`}>{prApproveMsg.text}</p>}
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => setPrApproveId(null)}>취소</Button>
                    <Button size="sm" className="flex-1" disabled={prApproving} onClick={async () => {
                      setPrApproving(true); setPrApproveMsg(null)
                      const token = getToken()
                      const res = await fetch("/api/admin/password-reset", {
                        method: "PATCH", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                        body: JSON.stringify({ requestId: prApproveId, newPassword: prNewPw }),
                      })
                      const d = await res.json()
                      setPrApproveMsg(res.ok ? { text: "초기화 완료", ok: true } : { text: d.error ?? "오류", ok: false })
                      if (res.ok) { loadPrRequests(); setTimeout(() => setPrApproveId(null), 1200) }
                      setPrApproving(false)
                    }}>확인</Button>
                  </div>
                </div>
              </div>
            )}

            {/* 현금 거래 이력 */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 border-b border-border">
                <h2 className="text-sm font-semibold text-foreground">현금 거래 이력</h2>
                <Button variant="ghost" size="sm" onClick={loadCash} disabled={cashLoading} className="text-xs gap-1.5">
                  <RefreshCw className={`w-3.5 h-3.5 ${cashLoading ? "animate-spin" : ""}`} /> 새로고침
                </Button>
              </div>
              <div className="divide-y divide-border">
                {cashTxns.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">거래 이력이 없습니다.</p>}
                {cashTxns.map((t: any) => (
                  <div key={t.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">
                          {t.from_user?.username} → {t.to_user?.username}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">{t.tx_type}</span>
                      </div>
                      {t.memo && <p className="text-xs text-muted-foreground mt-0.5">{t.memo}</p>}
                      <p className="text-[10px] text-muted-foreground/60">{new Date(t.created_at).toLocaleString("ko-KR")}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-semibold text-foreground">₩{t.cash_amount?.toLocaleString()}</p>
                      {t.point_amount > 0 && <p className="text-xs text-muted-foreground">{t.point_amount?.toLocaleString()} P</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ───────────── 매출 달력 탭 ───────────── */}
        {activeTab === "calendar" && (
          <div className="space-y-6">

            {/* 연월 + 지점 필터 */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => {
                  const d = new Date(calYear, calMonth - 2); setCalYear(d.getFullYear()); setCalMonth(d.getMonth() + 1)
                  loadCalendar(d.getFullYear(), d.getMonth() + 1, calBranchFilter || undefined)
                }}>{'<'}</Button>
                <span className="text-sm font-semibold text-foreground w-24 text-center">{calYear}년 {calMonth}월</span>
                <Button variant="outline" size="sm" className="h-8 w-8 p-0" onClick={() => {
                  const d = new Date(calYear, calMonth); setCalYear(d.getFullYear()); setCalMonth(d.getMonth() + 1)
                  loadCalendar(d.getFullYear(), d.getMonth() + 1, calBranchFilter || undefined)
                }}>{'>'}</Button>
              </div>
              {isSuperAdmin && (
                <Input placeholder="지점코드 필터" value={calBranchFilter} onChange={e => setCalBranchFilter(e.target.value)} className="h-8 text-sm w-36" />
              )}
              <Button size="sm" className="h-8 text-xs" onClick={() => { setCalSelectedDate(null); setMemberDetail(null); loadCalendar(calYear, calMonth, calBranchFilter || undefined) }}>
                {calLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : "조회"}
              </Button>
            </div>

            {/* 달력 그리드 */}
            {(() => {
              const daysInMonth = new Date(calYear, calMonth, 0).getDate()
              const firstDay = new Date(calYear, calMonth - 1, 1).getDay()
              const dataMap: Record<string, any> = {}
              for (const row of calData) {
                const day = String(new Date(row.log_date).getDate())
                if (!dataMap[day]) dataMap[day] = { charge: 0, exchange: 0, net: 0 }
                dataMap[day].charge += row.charge_total
                dataMap[day].exchange += row.exchange_total
                dataMap[day].net += row.net_total
              }
              const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
              return (
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="grid grid-cols-7 border-b border-border">
                    {["일", "월", "화", "수", "목", "금", "토"].map(d => (
                      <div key={d} className="py-2 text-center text-xs font-medium text-muted-foreground">{d}</div>
                    ))}
                  </div>
                  <div className="grid grid-cols-7">
                    {cells.map((day, i) => {
                      if (!day) return <div key={`empty-${i}`} className="h-20 border-b border-r border-border last:border-r-0" />
                      const dateStr = `${calYear}-${String(calMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                      const d = dataMap[String(day)]
                      const isSelected = calSelectedDate === dateStr
                      const isToday = new Date().toISOString().slice(0, 10) === dateStr
                      return (
                        <button key={day} onClick={() => {
                          setCalSelectedDate(dateStr); setMemberDetail(null); setExpandedUser(null)
                          loadCalendar(calYear, calMonth, calBranchFilter || undefined, dateStr)
                        }}
                          className={`h-20 p-1.5 border-b border-r border-border last:border-r-0 text-left transition-colors hover:bg-secondary/50 ${isSelected ? "bg-primary/10 border-primary/30" : ""}`}
                        >
                          <span className={`text-xs font-medium ${isToday ? "w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center" : "text-foreground"}`}>{day}</span>
                          {d && (
                            <div className="mt-1 space-y-0.5">
                              <p className="text-[9px] text-emerald-600 font-medium">+{(d.charge / 10000).toFixed(0)}만</p>
                              {d.exchange > 0 && <p className="text-[9px] text-red-500">-{(d.exchange / 10000).toFixed(0)}만</p>}
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {/* 월 합계 */}
                  <div className="px-5 py-3 border-t border-border bg-muted/30 flex gap-6 text-sm">
                    <span className="text-muted-foreground">월 합계</span>
                    <span className="text-emerald-600 font-semibold">충전 +{calData.reduce((s, r) => s + r.charge_total, 0).toLocaleString()}</span>
                    <span className="text-red-500 font-semibold">환전 -{calData.reduce((s, r) => s + r.exchange_total, 0).toLocaleString()}</span>
                    <span className="font-bold text-foreground">순이익 {calData.reduce((s, r) => s + r.net_total, 0).toLocaleString()}</span>
                  </div>
                </div>
              )
            })()}

            {/* 날짜 클릭 시 회원 상세 */}
            {calSelectedDate && memberDetail && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-border">
                  <h2 className="text-sm font-semibold text-foreground">{calSelectedDate} 지점별 회원 상세</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{memberDetail.branch} · {memberDetail.members?.length ?? 0}명</p>
                </div>

                {/* 랭킹 */}
                {memberDetail.members?.length > 0 && (
                  <div className="px-5 py-3 border-b border-border bg-muted/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                      <span className="text-xs font-semibold text-foreground">배팅 랭킹</span>
                    </div>
                    <div className="space-y-1">
                      {memberDetail.members.slice(0, 5).map((m: any, idx: number) => (
                        <div key={m.userId} className="flex items-center gap-3 text-xs">
                          <span className={`w-4 text-center font-bold ${idx === 0 ? "text-yellow-500" : idx === 1 ? "text-gray-400" : idx === 2 ? "text-amber-600" : "text-muted-foreground"}`}>{idx + 1}</span>
                          <span className="flex-1 font-medium text-foreground">{m.username}</span>
                          <span className="text-muted-foreground">{m.totalBets}게임</span>
                          <span className="font-semibold text-foreground">{m.totalWagered.toLocaleString()} P</span>
                          <span className={`font-medium ${m.totalProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{m.totalProfit >= 0 ? "+" : ""}{m.totalProfit.toLocaleString()}</span>
                          <span className="text-muted-foreground">{m.winRate}%</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 회원별 상세 */}
                <div className="divide-y divide-border">
                  {(memberDetail.members ?? []).length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">게임 기록이 없습니다.</p>}
                  {(memberDetail.members ?? []).map((m: any) => (
                    <div key={m.userId}>
                      <button className="w-full px-5 py-4 flex items-center justify-between hover:bg-secondary/40 transition-colors" onClick={() => setExpandedUser(expandedUser === m.userId ? null : m.userId)}>
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <span className="text-xs font-semibold text-primary">{m.username.charAt(0)}</span>
                          </div>
                          <div className="text-left">
                            <p className="text-sm font-medium text-foreground">{m.username}</p>
                            <p className="text-xs text-muted-foreground">충전 {m.chargeAmount.toLocaleString()} P · {m.totalBets}게임 · 승률 {m.winRate}%</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">총배팅</p>
                            <p className="text-sm font-semibold text-foreground">{m.totalWagered.toLocaleString()} P</p>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">수익</p>
                            <p className={`text-sm font-semibold ${m.totalProfit >= 0 ? "text-emerald-600" : "text-red-500"}`}>{m.totalProfit >= 0 ? "+" : ""}{m.totalProfit.toLocaleString()}</p>
                          </div>
                          {expandedUser === m.userId ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                        </div>
                      </button>

                      {/* 베팅 상세 */}
                      {expandedUser === m.userId && (
                        <div className="px-5 pb-4 bg-muted/20">
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="border-b border-border text-muted-foreground">
                                  <th className="py-2 text-left font-medium">라운드</th>
                                  <th className="py-2 text-left font-medium">게임</th>
                                  <th className="py-2 text-left font-medium">배팅</th>
                                  <th className="py-2 text-right font-medium">배팅액</th>
                                  <th className="py-2 text-right font-medium">배당</th>
                                  <th className="py-2 text-right font-medium">결과</th>
                                  <th className="py-2 text-right font-medium">수익</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border">
                                {m.bets.map((b: any, bi: number) => (
                                  <tr key={bi} className="text-foreground">
                                    <td className="py-1.5 font-mono text-[10px] text-muted-foreground">{b.round_id}</td>
                                    <td className="py-1.5">{b.game === "baka" ? "바카라" : "레이스"}</td>
                                    <td className="py-1.5">{b.bet_side ?? b.bet_position}</td>
                                    <td className="py-1.5 text-right">{b.amount?.toLocaleString()}</td>
                                    <td className="py-1.5 text-right">{b.payout_multiplier?.toFixed(2)}x</td>
                                    <td className="py-1.5 text-right">
                                      <span className={`px-1.5 py-0.5 rounded-full font-medium ${b.result === "win" ? "bg-emerald-100 text-emerald-700" : b.result === "lose" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"}`}>
                                        {b.result === "win" ? "승" : b.result === "lose" ? "패" : b.result ?? "-"}
                                      </span>
                                    </td>
                                    <td className={`py-1.5 text-right font-semibold ${(b.profit ?? 0) >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                                      {(b.profit ?? 0) >= 0 ? "+" : ""}{b.profit?.toLocaleString() ?? 0}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* 카드 관리 탭 (master 전용) */}
        {activeTab === "cards" && myRole === "master" && (
          <div className="space-y-6">
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
                  <input ref={cardFileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleCardUpload} />
                  <Button onClick={() => cardFileInputRef.current?.click()} disabled={uploading} className="flex items-center gap-2">
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
            {cardLoading ? (
              <div className="py-16 text-center text-muted-foreground text-sm">불러오는 중...</div>
            ) : cardImages.length === 0 ? (
              <div className="bg-card border border-dashed border-border rounded-xl py-20 text-center">
                <ImageIcon className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">업로드된 카드 이미지가 없습니다.</p>
                <p className="text-xs text-muted-foreground mt-1">위의 &quot;이미지 추가&quot; 버튼으로 업로드하세요.</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {cardImages.map((img, idx) => (
                  <div key={img.pathname} className="group relative bg-card border border-border rounded-xl overflow-hidden aspect-[3/4]">
                    <div className="absolute top-2 left-2 z-10 bg-black/70 text-white text-xs font-bold px-2 py-0.5 rounded-full">#{idx + 1}</div>
                    <img src={img.url} alt={`카드 이미지 #${idx + 1}`} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => handleCardDelete(img.url)}
                        className="flex items-center gap-1.5 bg-destructive text-destructive-foreground text-xs font-medium px-3 py-1.5 rounded-lg hover:bg-destructive/90 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> 삭제
                      </button>
                    </div>
                    <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-2 py-2">
                      <p className="text-white text-xs truncate">{img.pathname.split("/").pop()}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 손익 탭 */}
        {activeTab === "pnl" && isSuperAdmin && (
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
            ) : pnlData ? (
              <>
                {/* 요약 카드 4개 */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="bg-card border border-border rounded-xl p-5">
                    <p className="text-xs text-muted-foreground mb-1">요율 차익</p>
                    <p className="text-xs text-muted-foreground mb-2">현금 입금 → 포인트 발급 차이</p>
                    <p className="text-2xl font-bold text-emerald-600">
                      +{formatBalance(pnlData.rate_profit)}
                    </p>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-5">
                    <p className="text-xs text-muted-foreground mb-1">수수료 누적</p>
                    <p className="text-xs text-muted-foreground mb-2">산하 지점 게임 수수료</p>
                    <p className="text-2xl font-bold text-emerald-600">
                      +{formatBalance(pnlData.fee_total)}
                    </p>
                  </div>
                  <div className="bg-card border border-border rounded-xl p-5">
                    <p className="text-xs text-muted-foreground mb-1">환전 지급</p>
                    <p className="text-xs text-muted-foreground mb-2">유저 환전 요청 승인 합산</p>
                    <p className="text-2xl font-bold text-red-500">
                      -{formatBalance(pnlData.exchange_payout)}
                    </p>
                  </div>
                  <div className={`border rounded-xl p-5 ${pnlData.net_pnl >= 0 ? "bg-emerald-50 border-emerald-200" : "bg-red-50 border-red-200"}`}>
                    <p className="text-xs text-muted-foreground mb-1">순 손익</p>
                    <p className="text-xs text-muted-foreground mb-2">요율차익 + 수수료 - 환전</p>
                    <p className={`text-2xl font-bold ${pnlData.net_pnl >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                      {pnlData.net_pnl >= 0 ? "+" : ""}{formatBalance(pnlData.net_pnl)}
                    </p>
                  </div>
                </div>

                {/* 잔고 현황 */}
                <div className="bg-card border border-border rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-foreground mb-4">현재 잔고 현황</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">게임 포인트 잔고</p>
                      <p className="text-lg font-bold text-foreground">{formatBalance(pnlData.balance)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">현금 잔고</p>
                      <p className="text-lg font-bold text-foreground">{formatBalance(pnlData.cash_balance)}</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">누적 수익 대비 현재 잔고</p>
                      <p className={`text-sm font-semibold ${
                        pnlData.balance >= pnlData.net_pnl ? "text-emerald-600" : "text-amber-500"
                      }`}>
                        {pnlData.net_pnl > 0
                          ? `수익의 ${Math.round((pnlData.balance / pnlData.net_pnl) * 100)}% 보유 중`
                          : "손실 구간"}
                      </p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="py-20 text-center text-sm text-muted-foreground">
                데이터를 불러올 수 없습니다.
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  )
}
